// Geometry metrics shared by both engines. No engine diagnostics enter these scores.
const EPS = 1e-6;
const terminalMargin = 12;
const overlap = (a, b) =>
  a.x < b.x + b.width - EPS &&
  a.x + a.width > b.x + EPS &&
  a.y < b.y + b.height - EPS &&
  a.y + a.height > b.y + EPS;
const inflate = (r) => ({
  x: r.x - terminalMargin,
  y: r.y - terminalMargin,
  width: r.width + 2 * terminalMargin,
  height: r.height + 2 * terminalMargin,
});
const length = (s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
const horizontal = (s) => Math.abs(s.a.y - s.b.y) < EPS;
const vertical = (s) => Math.abs(s.a.x - s.b.x) < EPS;

// Clip only open rectangle interiors: running along a boundary is not penetration.
function outside(s, r, closed = false) {
  let enter = 0,
    exit = 1;
  for (const axis of ["x", "y"]) {
    const delta = s.b[axis] - s.a[axis];
    const lo = r[axis],
      hi = lo + (axis === "x" ? r.width : r.height);
    if (Math.abs(delta) < EPS) {
      if (
        closed
          ? s.a[axis] < lo - EPS || s.a[axis] > hi + EPS
          : s.a[axis] <= lo + EPS || s.a[axis] >= hi - EPS
      )
        return [s];
      continue;
    }
    const a = (lo - s.a[axis]) / delta,
      b = (hi - s.a[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
  }
  if ((exit - enter) * length(s) <= EPS) return [s];
  const point = (t) => ({ x: s.a.x + t * (s.b.x - s.a.x), y: s.a.y + t * (s.b.y - s.a.y) });
  return [
    [0, enter],
    [exit, 1],
  ]
    .filter(([a, b]) => (b - a) * length(s) > EPS)
    .map(([a, b]) => ({ ...s, a: point(a), b: point(b) }));
}
const clip = (segments, rectangles, closed = false) =>
  rectangles.reduce((ss, r) => ss.flatMap((s) => outside(s, r, closed)), segments);
function sharedLength(a, b) {
  const intervals = new Map();
  for (const s of a)
    for (const t of b) {
      const h = horizontal(s) && horizontal(t),
        v = vertical(s) && vertical(t);
      if (!h && !v) continue;
      const fixed = h ? s.a.y : s.a.x,
        other = h ? t.a.y : t.a.x;
      if (Math.abs(fixed - other) > EPS) continue;
      const axis = h ? "x" : "y";
      const lo = Math.max(Math.min(s.a[axis], s.b[axis]), Math.min(t.a[axis], t.b[axis]));
      const hi = Math.min(Math.max(s.a[axis], s.b[axis]), Math.max(t.a[axis], t.b[axis]));
      if (hi - lo <= EPS) continue;
      const key = `${h ? "h" : "v"}:${Math.round(fixed / EPS)}`;
      const list = intervals.get(key) ?? [];
      list.push([lo, hi]);
      intervals.set(key, list);
    }
  let sum = 0;
  for (const list of intervals.values()) {
    list.sort((a, b) => a[0] - b[0]);
    let end = -Infinity;
    for (const [lo, hi] of list) {
      sum += Math.max(0, hi - Math.max(lo, end));
      end = Math.max(end, hi);
    }
  }
  return sum;
}
function crossings(a, b) {
  const points = new Set();
  for (const s of a)
    for (const t of b) {
      const h = horizontal(s) && vertical(t) ? s : horizontal(t) && vertical(s) ? t : null;
      if (!h) continue;
      const v = h === s ? t : s,
        x = v.a.x,
        y = h.a.y;
      if (
        x > Math.min(h.a.x, h.b.x) + EPS &&
        x < Math.max(h.a.x, h.b.x) - EPS &&
        y > Math.min(v.a.y, v.b.y) + EPS &&
        y < Math.max(v.a.y, v.b.y) - EPS
      )
        points.add(`${Math.round(x / EPS)}:${Math.round(y / EPS)}`);
    }
  return points.size;
}
export function measureQuality(layout, input) {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const nodes = layout.nodes.map((n) => {
    let x = n.x,
      y = n.y,
      parent = n.parentId;
    const seen = new Set([n.id]);
    while (parent) {
      if (seen.has(parent) || !byId.has(parent)) throw new Error(`Invalid hierarchy at ${n.id}`);
      seen.add(parent);
      const p = byId.get(parent);
      x += p.x;
      y += p.y;
      parent = p.parentId;
    }
    return { ...n, x, y };
  });
  const world = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Set(nodes.map((n) => n.parentId));
  const leaves = nodes.filter((n) => !parents.has(n.id));
  const labels = layout.edges.filter((e) => e.width > 0 && e.height > 0);
  const expected = new Map(input.edges.map((e) => [e.id, e]));
  const routes = new Map(layout.routes);
  let nonFinite = [...nodes, ...labels].filter(
      (n) => ![n.x, n.y, n.width, n.height].every(Number.isFinite),
    ).length,
    diagonals = 0,
    bends = 0,
    selfRetraceLength = 0;
  const segments = new Map(),
    nodeHits = new Set(),
    labelHits = new Set();
  const points = [];
  for (const n of [...nodes, ...labels])
    points.push({ x: n.x, y: n.y }, { x: n.x + n.width, y: n.y + n.height });
  for (const [id, route] of routes) {
    const ss = [];
    for (const section of route.sections) {
      let a = section.path.start,
        previous;
      for (const segment of section.path.segments) {
        if (segment.kind !== "line") throw new Error(`Unsupported path kind: ${segment.kind}`);
        const b = segment.to;
        if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) {
          nonFinite++;
          a = b;
          continue;
        }
        points.push(a, b);
        const s = { a, b };
        if (length(s) < EPS) {
          a = b;
          continue;
        }
        if (!horizontal(s) && !vertical(s)) diagonals++;
        const dir = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
        if (previous && (previous.x !== dir.x || previous.y !== dir.y)) bends++;
        previous = dir;
        ss.push(s);
        a = b;
      }
    }
    for (const n of leaves)
      if (ss.some((s) => clip([s], [n]).reduce((n, s) => n + length(s), 0) < length(s) - EPS))
        nodeHits.add(`${id}:${n.id}`);
    for (const l of labels.filter((l) => l.id !== id))
      if (ss.some((s) => clip([s], [l]).reduce((n, s) => n + length(s), 0) < length(s) - EPS))
        labelHits.add(`${id}:${l.id}`);
    const own = labels.filter((l) => l.id === id);
    segments.set(id, clip(ss, own));
    const edge = expected.get(id);
    const loopRect = edge?.sourceId === edge?.targetId ? world.get(edge.sourceId) : null;
    const self = loopRect ? clip(clip(ss, own), [inflate(loopRect)], true) : clip(ss, own);
    // Compare each segment against later segments, unioning retraced intervals per segment.
    for (let i = 0; i < self.length; i++)
      selfRetraceLength += sharedLength([self[i]], self.slice(i + 1));
  }
  let edgeCrossings = 0,
    edgeOverlapLength = 0,
    opposingOverlapLength = 0;
  const ids = [...segments.keys()];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = expected.get(ids[i]),
        b = expected.get(ids[j]);
      const shared =
        a && b
          ? [...new Set([a.sourceId, a.targetId])]
              .filter((id) => id === b.sourceId || id === b.targetId)
              .map((id) => world.get(id))
              .filter(Boolean)
              .map(inflate)
          : [];
      const as = clip(segments.get(ids[i]), shared, true),
        bs = clip(segments.get(ids[j]), shared, true);
      edgeCrossings += crossings(as, bs);
      edgeOverlapLength += sharedLength(as, bs);
      // Two edges on one track heading opposite ways read as one path; never acceptable.
      for (const s of as)
        for (const t of bs)
          if ((s.b.x - s.a.x) * (t.b.x - t.a.x) + (s.b.y - s.a.y) * (t.b.y - t.a.y) < 0)
            opposingOverlapLength += sharedLength([s], [t]);
    }
  let nodeOverlaps = 0,
    labelNodeOverlaps = 0,
    labelOverlaps = 0;
  const ancestor = (a, b) => {
    let p = b.parentId;
    while (p) {
      if (p === a.id) return true;
      p = byId.get(p)?.parentId;
    }
    return false;
  };
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      if (
        !ancestor(nodes[i], nodes[j]) &&
        !ancestor(nodes[j], nodes[i]) &&
        overlap(nodes[i], nodes[j])
      )
        nodeOverlaps++;
  for (const l of labels) for (const n of leaves) if (overlap(l, n)) labelNodeOverlaps++;
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++) if (overlap(labels[i], labels[j])) labelOverlaps++;
  const finite = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const width = finite.length
    ? Math.max(...finite.map((p) => p.x)) - Math.min(...finite.map((p) => p.x))
    : 0;
  const height = finite.length
    ? Math.max(...finite.map((p) => p.y)) - Math.min(...finite.map((p) => p.y))
    : 0;
  return {
    missingNodes: input.nodes.filter((n) => !byId.has(n.id)).length,
    missingRoutes: input.edges.filter((e) => !routes.has(e.id) || !segments.get(e.id)?.length)
      .length,
    nonFinite,
    diagonals,
    nodeHits: nodeHits.size,
    nodeOverlaps,
    labelNodeOverlaps,
    labelOverlaps,
    edgeLabelHits: labelHits.size,
    selfRetraceLength,
    edgeCrossings,
    edgeOverlapLength,
    opposingOverlapLength,
    bends,
    routeLength: [...segments.values()].flat().reduce((n, s) => n + length(s), 0),
    area: width * height,
  };
}
