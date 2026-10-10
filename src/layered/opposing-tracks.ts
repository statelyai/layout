import { worldGeometry } from "../authoring/coordinates";
import { recordRouteGeometry } from "../routing/layout-cache";
import type { CompoundVisualGraph } from "./compound";
import type { LayeredLayoutOptions } from "./types";

/**
 * Two different edges on one collinear track, heading opposite ways, read as
 * one path. Move one of the two segments to a free parallel track, keeping its
 * neighbours orthogonal and never adding node hits, label hits or retraces.
 */
export interface TrackPoint {
  x: number;
  y: number;
}
export interface TrackRect extends TrackPoint {
  width: number;
  height: number;
}
export interface TrackRoute {
  id: string;
  /** Endpoint node ids; shared endpoint nodes get the quality metric's terminal clearance. */
  ends: readonly string[];
  /** World-coordinate polyline. */
  points: readonly TrackPoint[];
  labels: readonly TrackRect[];
  /** Port ids at the source and target end, when the route attaches to a port. */
  ports?: readonly [string | undefined, string | undefined];
  /** False when the route may be measured but not changed. */
  movable: boolean;
}
export interface TrackPort {
  /** Owning node id. */
  node: string;
  /** World rect. */
  rect: TrackRect;
}
export interface TrackScene {
  routes: readonly TrackRoute[];
  /** World rect of every node, by id. */
  nodes: ReadonlyMap<string, TrackRect>;
  /** Ids of nodes without children: routes never pass through them. */
  leaves: ReadonlySet<string>;
  /** Parallel track distance (elk.spacing.edgeEdge). */
  spacing: number;
  /** Ports by id, for routes that name them. */
  ports?: ReadonlyMap<string, TrackPort>;
}

const EPS = 1e-6;
/** The quality metric's clearance around endpoints two edges share. */
const TERMINAL_MARGIN = 12;
const MINSTUB = 0.5;
type Segment = { a: TrackPoint; b: TrackPoint };
const horizontal = (s: Segment) => Math.abs(s.a.y - s.b.y) < EPS;
const vertical = (s: Segment) => Math.abs(s.a.x - s.b.x) < EPS;
const size = (s: Segment) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
const inflate = (r: TrackRect, m: number): TrackRect => ({
  x: r.x - m,
  y: r.y - m,
  width: r.width + 2 * m,
  height: r.height + 2 * m,
});

/** The parts of `s` outside `r`; `closed` also clips segments running along its border. */
function outside(s: Segment, r: TrackRect, closed: boolean): Segment[] {
  let enter = 0,
    exit = 1;
  for (const axis of ["x", "y"] as const) {
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
  const length = size(s);
  if ((exit - enter) * length <= EPS) return [s];
  const at = (t: number) => ({ x: s.a.x + t * (s.b.x - s.a.x), y: s.a.y + t * (s.b.y - s.a.y) });
  const parts: Segment[] = [];
  if (enter * length > EPS) parts.push({ a: s.a, b: at(enter) });
  if ((1 - exit) * length > EPS) parts.push({ a: at(exit), b: s.b });
  return parts;
}
const clip = (segments: Segment[], rects: readonly TrackRect[], closed = false) =>
  rects.reduce((list, r) => list.flatMap((s) => outside(s, r, closed)), segments);
const hits = (s: Segment, r: TrackRect) =>
  clip([s], [r]).reduce((sum, part) => sum + size(part), 0) < size(s) - EPS;

/** Collinear shared length of two axis-parallel segments. */
function shared(s: Segment, t: Segment): number {
  const h = horizontal(s) && horizontal(t),
    v = vertical(s) && vertical(t);
  if (!h && !v) return 0;
  if (Math.abs(h ? s.a.y - t.a.y : s.a.x - t.a.x) > EPS) return 0;
  const axis = h ? "x" : "y";
  const lo = Math.max(Math.min(s.a[axis], s.b[axis]), Math.min(t.a[axis], t.b[axis]));
  const hi = Math.min(Math.max(s.a[axis], s.b[axis]), Math.max(t.a[axis], t.b[axis]));
  return Math.max(0, hi - lo);
}
const opposite = (s: Segment, t: Segment) =>
  (s.b.x - s.a.x) * (t.b.x - t.a.x) + (s.b.y - s.a.y) * (t.b.y - t.a.y) < 0;
function crossing(s: Segment, t: Segment): boolean {
  const h = horizontal(s) && vertical(t) ? s : horizontal(t) && vertical(s) ? t : undefined;
  if (!h) return false;
  const v = h === s ? t : s;
  return (
    v.a.x > Math.min(h.a.x, h.b.x) + EPS &&
    v.a.x < Math.max(h.a.x, h.b.x) - EPS &&
    h.a.y > Math.min(v.a.y, v.b.y) + EPS &&
    h.a.y < Math.max(v.a.y, v.b.y) - EPS
  );
}
const onBorder = (p: TrackPoint, r: TrackRect) => {
  const inX = p.x >= r.x - EPS && p.x <= r.x + r.width + EPS,
    inY = p.y >= r.y - EPS && p.y <= r.y + r.height + EPS;
  return (
    (inY && (Math.abs(p.x - r.x) <= EPS || Math.abs(p.x - r.x - r.width) <= EPS)) ||
    (inX && (Math.abs(p.y - r.y) <= EPS || Math.abs(p.y - r.y - r.height) <= EPS))
  );
};
const segmentsOf = (points: readonly TrackPoint[]): Segment[] =>
  points.slice(1).flatMap((b, i) => {
    const s = { a: points[i]!, b };
    return size(s) > EPS ? [s] : [];
  });

interface State {
  route: TrackRoute;
  points: TrackPoint[];
  /** Segments outside the route's own labels, as the metric measures them. */
  measured: Segment[];
}

/** Returns the routes whose points changed. */
export function separateOpposingTracks(scene: TrackScene): Map<string, TrackPoint[]> {
  const { nodes, leaves, spacing } = scene;
  const leafRects = [...leaves].flatMap((id) => (nodes.has(id) ? [nodes.get(id)!] : []));
  const compounds = [...nodes].flatMap(([id, r]) => (leaves.has(id) ? [] : [r]));
  const allLabels = scene.routes.flatMap((route) => route.labels.map((rect) => ({ route, rect })));
  const states: State[] = scene.routes.map((route) => ({
    route,
    // Repeated points carry no segment; dropping them lets every segment move.
    points: route.points
      .filter((p, i) => i === 0 || size({ a: route.points[i - 1]!, b: p }) > EPS)
      .map((p) => ({ ...p })),
    measured: clip(segmentsOf(route.points), route.labels),
  }));
  const terminals = (a: TrackRoute, b: TrackRoute) =>
    [...new Set(a.ends)]
      .filter((id) => b.ends.includes(id) && nodes.has(id))
      .map((id) => inflate(nodes.get(id)!, TERMINAL_MARGIN));
  const terminalCache = new Map<string, TrackRect[]>();
  const terminalsOf = (a: State, b: State) => {
    const key =
      a.route.id < b.route.id ? `${a.route.id}\0${b.route.id}` : `${b.route.id}\0${a.route.id}`;
    let rects = terminalCache.get(key);
    if (!rects) terminalCache.set(key, (rects = terminals(a.route, b.route)));
    return rects;
  };
  const boxes = new WeakMap<Segment[], [number, number, number, number]>();
  const boxOf = (segments: Segment[]) => {
    let box = boxes.get(segments);
    if (!box) {
      box = [Infinity, Infinity, -Infinity, -Infinity];
      for (const { a, b } of segments) {
        box[0] = Math.min(box[0], a.x, b.x);
        box[1] = Math.min(box[1], a.y, b.y);
        box[2] = Math.max(box[2], a.x, b.x);
        box[3] = Math.max(box[3], a.y, b.y);
      }
      boxes.set(segments, box);
    }
    return box;
  };
  const none = { opposing: 0, overlap: 0, crossings: 0 };
  // The metric's pair measures: opposite-direction and same-direction shared length, crossings.
  const pair = (mine: Segment[], self: State, other: State) => {
    // Routes with disjoint bounds neither share a track nor cross.
    const [ax0, ay0, ax1, ay1] = boxOf(mine),
      [bx0, by0, bx1, by1] = boxOf(other.measured);
    if (ax1 < bx0 - EPS || bx1 < ax0 - EPS || ay1 < by0 - EPS || by1 < ay0 - EPS) return none;
    const rects = terminalsOf(self, other);
    const as = rects.length ? clip(mine, rects, true) : mine,
      bs = rects.length ? clip(other.measured, rects, true) : other.measured;
    let opposing = 0,
      overlap = 0,
      crossings = 0;
    for (const s of as)
      for (const t of bs) {
        const length = shared(s, t);
        if (length > EPS) {
          overlap += length;
          if (opposite(s, t)) opposing += length;
        } else if (crossing(s, t)) crossings++;
      }
    return { opposing, overlap, crossings };
  };
  const measure = (state: State, mine: Segment[]) => {
    let opposing = 0,
      overlap = 0,
      crossings = 0;
    for (const other of states) {
      if (other === state) continue;
      const result = pair(mine, state, other);
      opposing += result.opposing;
      overlap += result.overlap;
      crossings += result.crossings;
    }
    return { opposing, overlap, crossings };
  };
  const loop = (route: TrackRoute) =>
    route.ends.length === 2 && route.ends[0] === route.ends[1] && nodes.has(route.ends[0]!)
      ? inflate(nodes.get(route.ends[0]!)!, TERMINAL_MARGIN)
      : undefined;
  const retrace = (route: TrackRoute, segments: Segment[]) => {
    const rect = loop(route);
    const own = rect ? clip(segments, [rect], true) : segments;
    let sum = 0;
    for (let i = 0; i < own.length; i++)
      for (let j = i + 1; j < own.length; j++) sum += shared(own[i]!, own[j]!);
    return sum;
  };
  // Tracks of other routes closer than the spacing along the moved segment.
  const crowding = (state: State, s: Segment) => {
    let count = 0;
    const h = horizontal(s),
      fixed = h ? s.a.y : s.a.x,
      axis = h ? "x" : "y";
    const lo = Math.min(s.a[axis], s.b[axis]),
      hi = Math.max(s.a[axis], s.b[axis]);
    for (const other of states) {
      if (other === state) continue;
      for (const t of other.measured) {
        if (h ? !horizontal(t) : !vertical(t)) continue;
        const distance = Math.abs((h ? t.a.y : t.a.x) - fixed);
        if (distance >= spacing - EPS) continue;
        const overlap =
          Math.min(hi, Math.max(t.a[axis], t.b[axis])) -
          Math.max(lo, Math.min(t.a[axis], t.b[axis]));
        if (overlap > EPS) count++;
      }
    }
    return count;
  };
  // Border crossings of axis-parallel segments with container rects.
  const borders = (list: Segment[]) =>
    compounds.reduce((sum, r) => {
      for (const s of list) {
        const h = horizontal(s),
          fixed = h ? s.a.y : s.a.x,
          axis = h ? "x" : "y";
        const lo = Math.min(s.a[axis], s.b[axis]),
          hi = Math.max(s.a[axis], s.b[axis]);
        const across = h ? [r.y, r.y + r.height] : [r.x, r.x + r.width],
          along = h ? [r.x, r.x + r.width] : [r.y, r.y + r.height];
        if (fixed <= across[0]! + EPS || fixed >= across[1]! - EPS) continue;
        for (const edge of along) if (edge > lo + EPS && edge < hi - EPS) sum++;
      }
      return sum;
    }, 0);
  const better = (a: number[], b: number[]) => {
    const i = a.findIndex((value, index) => Math.abs(value - b[index]!) > EPS);
    return i >= 0 && a[i]! < b[i]!;
  };
  const changed = new Set<State>();
  splitSharedPorts(false);
  // Opposite-direction sharing is a hard defect: moves may add crossings,
  // but only where no crossing-neutral move remains, and then the fewest.
  splitLanes(false);
  separateRoutes(false);
  reshapeLoops(false);
  separateCheapestFirst();
  // A shared port whose split must cross something takes the cheapest split.
  splitSharedPorts(true);
  reshapeLoops(true);
  return new Map([...changed].map((state) => [state.route.id, state.points]));

  /**
   * A self-loop on a port that other edges also use leaves along their line.
   * Redraw it as a plain rectangle on the same side, its two attachments
   * slid along the side and the loop turning either way, keeping its depth.
   */
  function reshapeLoops(tolerant: boolean) {
    for (const state of states) {
      const { route } = state;
      const node = route.ends[0] === route.ends[1] ? nodes.get(route.ends[0]!) : undefined;
      if (!node || !route.movable || route.labels.length || state.points.length < 4) continue;
      const current = measure(state, state.measured);
      if (current.opposing <= EPS) continue;
      const [p, q] = state.points as [TrackPoint, TrackPoint];
      const first = { a: p, b: q };
      if (size(first) <= EPS || (!horizontal(first) && !vertical(first))) continue;
      const normal = { x: Math.sign(q.x - p.x), y: Math.sign(q.y - p.y) };
      const lateral = normal.x !== 0 ? "y" : "x",
        across = normal.x !== 0 ? "x" : "y";
      const lo = node[lateral],
        hi = lo + (lateral === "x" ? node.width : node.height);
      // The loop leaves from its port's face, at most a spacing off the node border.
      const side =
        normal[across] > 0
          ? node[across] + (across === "x" ? node.width : node.height)
          : node[across];
      if ((p[across] - side) * normal[across] < -EPS || Math.abs(p[across] - side) > spacing)
        continue;
      const border = p[across];
      const depth = Math.max(
        spacing / 2,
        ...state.points.map((point) => Math.abs(point[across] - border)),
      );
      const width = Math.max(
        spacing / 2,
        ...state.points.map((point) => Math.abs(point[lateral] - p[lateral])),
      );
      let best: { next: Map<State, TrackPoint[]>; key: number[] } | undefined;
      for (const slide of [0, 1, -1, 2, -2].map((k) => (k * spacing) / 2))
        for (const turn of [1, -1]) {
          const start = p[lateral] + slide,
            end = start + turn * width;
          if (Math.min(start, end) < lo - EPS || Math.max(start, end) > hi + EPS) continue;
          const at = (lateralValue: number, out: number) =>
            ({
              [lateral]: lateralValue,
              [across]: border + normal[across] * out,
            }) as unknown as TrackPoint;
          const points = [at(start, 0), at(start, depth), at(end, depth), at(end, 0)];
          const next = new Map([[state, points]]);
          const result = evaluate(next);
          if (!result || result.opposing >= -current.opposing + EPS) continue;
          if (!tolerant && result.crossings > 0) continue;
          const key = [
            Math.max(0, result.crossings),
            result.opposing,
            result.overlap,
            Math.abs(slide),
          ];
          if (!best || better(key, best.key)) best = { next, key };
        }
      if (best) commit(best.next);
    }
  }

  /** Move one segment of a route at a time to a free parallel track. */
  function separateRoutes(tolerant: boolean) {
    for (const state of states) {
      if (!state.route.movable) continue;
      for (let moves = 0; moves < 8; moves++) {
        const best = routeMove(state, tolerant);
        if (!best) break;
        state.points = best.points;
        state.measured = best.measured;
        changed.add(state);
      }
    }
  }

  /** The best single-segment move for a route, keyed by added crossings first. */
  function routeMove(state: State, tolerant: boolean) {
    {
      {
        const current = measure(state, state.measured);
        if (current.opposing <= EPS) return undefined;
        const raw = segmentsOf(state.points);
        if (raw.length !== state.points.length - 1) return undefined;
        // Segments on or beside an opposing stretch are candidates.
        const involved = new Set<number>();
        for (const [index, s] of raw.entries())
          if (
            states.some(
              (other) =>
                other !== state && other.measured.some((t) => opposite(s, t) && shared(s, t) > EPS),
            )
          )
            for (const k of [index - 1, index, index + 1]) involved.add(k);
        const baseRetrace = retrace(state.route, state.measured);
        let best: { points: TrackPoint[]; measured: Segment[]; key: number[] } | undefined;
        const consider = (
          points: TrackPoint[],
          old: Segment[],
          next: Segment[],
          track: Segment,
          bends: number,
          delta: number,
        ) => {
          if (next.some((s) => leafRects.some((r) => hits(s, r)))) return;
          if (
            allLabels.some(
              ({ route, rect }) =>
                next.some((s) => hits(s, rect)) &&
                !(route === state.route && old.some((s) => hits(s, rect))),
            )
          )
            return;
          // Never carry a route across a container border it did not cross.
          if (borders(next) !== borders(old)) return;
          // The new track must be free: no collinear sharing with another route.
          if (
            states.some(
              (other) => other !== state && other.measured.some((t) => shared(track, t) > EPS),
            )
          )
            return;
          const measured = clip(segmentsOf(points), state.route.labels);
          if (retrace(state.route, measured) > baseRetrace + EPS) return;
          const result = measure(state, measured);
          if (result.opposing >= current.opposing - EPS) return;
          if (!tolerant && result.crossings > current.crossings) return;
          const key = [
            Math.max(0, result.crossings - current.crossings),
            result.opposing,
            bends,
            crowding(state, track),
            result.crossings,
            result.overlap,
            Math.abs(delta),
          ];
          if (!best || better(key, best.key)) best = { points, measured, key };
        };
        // A neighbour keeps its direction and a usable length.
        const keeps = (old: Segment, next: Segment) =>
          (old.b.x - old.a.x) * (next.b.x - next.a.x) +
            (old.b.y - old.a.y) * (next.b.y - next.a.y) >
            0 && size(next) >= Math.min(size(old), MINSTUB * spacing) - EPS;
        const offsets = Array.from(
          { length: 16 },
          (_, i) => ((i % 2 ? 1 : -1) * (1 + (i >> 1)) * spacing) / 2,
        );
        for (const k of [...involved].sort((a, b) => a - b)) {
          if (k < 0 || k >= raw.length) continue;
          const segment = raw[k]!;
          const h = horizontal(segment);
          if (!h && !vertical(segment)) continue;
          // A segment carrying its own label stays with it.
          if (state.route.labels.some((label) => hits(segment, inflate(label, spacing)))) continue;
          const shift = (p: TrackPoint, delta: number) =>
            h ? { x: p.x, y: p.y + delta } : { x: p.x + delta, y: p.y };
          if (k >= 1 && k <= raw.length - 2) {
            // Shift an interior segment; its perpendicular neighbours stretch.
            const before = raw[k - 1]!,
              after = raw[k + 1]!;
            if (
              h ? !vertical(before) || !vertical(after) : !horizontal(before) || !horizontal(after)
            )
              continue;
            for (const delta of offsets) {
              const points = state.points.map((p, i) =>
                i === k || i === k + 1 ? shift(p, delta) : p,
              );
              const next = [k - 1, k, k + 1].map((i) => ({ a: points[i]!, b: points[i + 1]! }));
              if (!keeps(before, next[0]!) || !keeps(after, next[2]!)) continue;
              consider(points, [before, segment, after], next, next[1]!, 0, delta);
            }
            continue;
          }
          if (raw.length < 2) continue;
          // A terminal segment is pinned to its port: jog off the shared line
          // just past the shared terminal clearance and run parallel instead.
          const reversed = k === raw.length - 1;
          const path = reversed ? [...state.points].reverse() : state.points;
          const [port, corner, beyond] = path as [TrackPoint, TrackPoint, TrackPoint];
          const along = size({ a: port, b: corner });
          const unit = { x: (corner.x - port.x) / along, y: (corner.y - port.y) / along };
          const end = state.route.ends[reversed ? 1 : 0];
          const rect = end === undefined ? undefined : nodes.get(end);
          const clearance = rect
            ? clip([{ a: port, b: corner }], [inflate(rect, TERMINAL_MARGIN)], true).reduce(
                (sum, part) => sum + size(part),
                0,
              )
            : along;
          // A portless end may instead slide along its node side; its
          // perpendicular neighbour stretches.
          const after = { a: corner, b: beyond };
          const against = (s: Segment) =>
            states.reduce(
              (sum, other) =>
                other === state
                  ? sum
                  : other.measured.reduce((n, t) => n + (opposite(s, t) ? shared(s, t) : 0), sum),
              0,
            );
          if (
            state.route.ends.length === 2 &&
            state.route.ports?.[reversed ? 1 : 0] === undefined &&
            rect &&
            onBorder(port, rect) &&
            (h ? vertical(after) : horizontal(after))
          ) {
            const lo = h ? rect.y : rect.x,
              hi = lo + (h ? rect.height : rect.width);
            for (const delta of offsets) {
              const moved = shift(port, delta);
              if ((h ? moved.y : moved.x) < lo - EPS || (h ? moved.y : moved.x) > hi + EPS)
                continue;
              const next = [
                { a: moved, b: shift(corner, delta) },
                { a: shift(corner, delta), b: beyond },
              ];
              // The stretched neighbour may not run against another route more than before.
              if (!keeps(after, next[1]!) || against(next[1]!) > against(after) + EPS) continue;
              const replaced = [moved, shift(corner, delta), ...path.slice(2)];
              const points = reversed ? replaced.reverse() : replaced;
              consider(points, [segment, after], next, next[0]!, 0, delta);
            }
          }
          for (const stub of new Set([along - clearance, spacing]))
            for (const delta of offsets) {
              if (stub < 1 || along - stub < spacing) continue;
              const q = { x: port.x + unit.x * stub, y: port.y + unit.y * stub };
              const jog = shift(q, delta),
                rejoin = shift(corner, delta);
              const next = [
                { a: port, b: q },
                { a: q, b: jog },
                { a: jog, b: rejoin },
                { a: rejoin, b: beyond },
              ];
              const old = [
                { a: port, b: corner },
                { a: corner, b: beyond },
              ];
              // The rejoined neighbour keeps its direction; a stretched one may grow.
              if (
                (beyond.x - corner.x) * (beyond.x - rejoin.x) +
                  (beyond.y - corner.y) * (beyond.y - rejoin.y) <=
                  0 ||
                size(next[3]!) < Math.min(size(old[1]!), spacing) - EPS
              )
                continue;
              const replaced = [port, q, jog, rejoin, ...path.slice(2)];
              const points = reversed ? replaced.reverse() : replaced;
              consider(points, old, next, next[2]!, 2, delta);
            }
        }
        return best && { ...best, gain: best.key[1]! - current.opposing };
      }
    }
  }

  /**
   * A port carrying edges in both directions gives each direction its own
   * attachment point along the port's side, so the two stubs run parallel
   * instead of on one track. A wide port splits across its extent; a port
   * narrower than the spacing moves the attachments onto the node border,
   * half a spacing either side of the port's centre.
   */
  function splitSharedPorts(tolerant: boolean) {
    type End = { state: State; end: 0 | 1 };
    const groups = new Map<string, { port: TrackPort; normal: TrackPoint; ends: End[] }>();
    // Implicit attachment points per node; points within EPS are one point.
    const implicit = new Map<string, TrackPoint[]>();
    for (const state of states)
      for (const end of [0, 1] as const) {
        if (state.points.length < 2) continue;
        const path = end ? [...state.points].reverse() : state.points;
        const [p, q] = path as [TrackPoint, TrackPoint];
        let id = state.route.ports?.[end];
        let port = id === undefined ? undefined : scene.ports?.get(id);
        // Portless ends meeting at one point of a node border (merged edges)
        // share an implicit port there.
        const node = state.route.ends.length === 2 ? state.route.ends[end]! : undefined;
        const rect = node === undefined ? undefined : nodes.get(node);
        if (id === undefined && rect && onBorder(p, rect)) {
          const points = implicit.get(node!) ?? [];
          implicit.set(node!, points);
          let at = points.find((o) => Math.abs(o.x - p.x) <= EPS && Math.abs(o.y - p.y) <= EPS);
          if (!at) points.push((at = { x: p.x, y: p.y }));
          id = `${node}\0${points.indexOf(at)}`;
          port = { node: node!, rect: { ...at, width: 0, height: 0 } };
        }
        if (!port) continue;
        const s = { a: p, b: q };
        if (size(s) <= EPS || (!horizontal(s) && !vertical(s))) continue;
        const normal = { x: Math.sign(q.x - p.x), y: Math.sign(q.y - p.y) };
        const key = `${id}\0${normal.x}\0${normal.y}`;
        let group = groups.get(key);
        if (!group) groups.set(key, (group = { port, normal, ends: [] }));
        group.ends.push({ state, end });
      }
    for (const group of groups.values()) {
      const { port, normal } = group;
      // An earlier split may have slid a straight route off an implicit port.
      const ends = group.ends.filter(({ state, end }) => {
        if (state.route.ports?.[end] !== undefined) return true;
        const p = end ? state.points.at(-1)! : state.points[0]!;
        return Math.abs(p.x - port.rect.x) <= EPS && Math.abs(p.y - port.rect.y) <= EPS;
      });
      const incoming = ends.filter((e) => e.end === 1),
        outgoing = ends.filter((e) => e.end === 0);
      if (!incoming.length || !outgoing.length) continue;
      const stub = ({ state, end }: End) => {
        const path = end ? [...state.points].reverse() : state.points;
        return { a: path[0]!, b: path[1]! };
      };
      if (!incoming.some((i) => outgoing.some((o) => shared(stub(i), stub(o)) > EPS))) continue;
      if (ends.some(({ state }) => !state.route.movable)) continue;
      const node = nodes.get(port.node);
      if (!node) continue;
      // The lateral axis runs along the port's side.
      const lateral = normal.x !== 0 ? "y" : "x",
        across = normal.x !== 0 ? "x" : "y";
      const extent = lateral === "x" ? port.rect.width : port.rect.height;
      const sideLo = node[lateral],
        sideHi = node[lateral] + (lateral === "x" ? node.width : node.height);
      const wide = extent >= spacing - EPS;
      const half = spacing / 2;
      // A straight portless two-point route slides sideways whole, both ends
      // staying on their node sides.
      const slid = (state: State, points: TrackPoint[], end: 0 | 1, offset: number) => {
        if (state.route.ports?.some((id) => id !== undefined)) return undefined;
        if (Math.abs(points[0]![across] - points[1]![across]) <= EPS) return undefined;
        const far = nodes.get(state.route.ends[1 - end] ?? "");
        const moved = points.map((p) => ({ ...p, [lateral]: p[lateral] + offset }));
        const within = (value: number, rect: TrackRect) => {
          const lo = rect[lateral];
          return (
            value >= lo - EPS && value <= lo + (lateral === "x" ? rect.width : rect.height) + EPS
          );
        };
        const value = moved[0]![lateral];
        return within(value, node) && far && within(value, far) ? moved : undefined;
      };
      // Move one end of a route sideways by `offset`, keeping it orthogonal.
      const shifted = (state: State, points: TrackPoint[], end: 0 | 1, offset: number) => {
        if (Math.abs(offset) <= EPS) return points;
        const path = end ? [...points].reverse() : [...points];
        if (path.length === 2) return slid(state, points, end, offset);
        if (path.length < 3) return undefined;
        const [p, q, r] = path as [TrackPoint, TrackPoint, TrackPoint];
        const along = r[lateral] - q[lateral];
        if (Math.abs(r[across] - q[across]) > EPS || Math.abs(along) <= EPS) return undefined;
        const moved = q[lateral] + offset;
        if ((r[lateral] - moved) * along <= EPS) return undefined;
        if (moved < sideLo - EPS || moved > sideHi + EPS) return undefined;
        const attach = { ...p, [lateral]: moved };
        if (!wide) {
          // Onto the node border nearest the old attachment.
          const lo = node[across],
            hi = lo + (across === "x" ? node.width : node.height);
          attach[across] = Math.abs(p[across] - lo) < Math.abs(p[across] - hi) ? lo : hi;
        }
        path[0] = attach;
        path[1] = { ...q, [lateral]: moved };
        return end ? path.reverse() : path;
      };
      let best: { points: Map<State, TrackPoint[]>; key: number[] } | undefined;
      // Lateral order without crossings: ends turning towards lower
      // coordinates first, earliest turn outermost; straight ends in the
      // middle; then ends turning higher, earliest turn outermost. Adjacent
      // ends of one direction share a slot.
      const turnOf = ({ state, end }: End) => {
        const path = end ? [...state.points].reverse() : state.points;
        const [p, q, r] = path as [TrackPoint, TrackPoint, TrackPoint?];
        const depth = Math.abs(q[across] - p[across]);
        if (!r || Math.abs(r[across] - q[across]) > EPS) return { turn: 0, depth };
        return { turn: Math.sign(r[lateral] - q[lateral]), depth };
      };
      const ordered = ends
        .map((e) => ({ e, ...turnOf(e) }))
        .sort((a, b) => a.turn - b.turn || (a.turn < 0 ? a.depth - b.depth : b.depth - a.depth));
      const slotOf = new Map<End, number>();
      let slots = 0;
      for (const [index, item] of ordered.entries()) {
        if (index && item.e.end !== ordered[index - 1]!.e.end) slots++;
        slotOf.set(item.e, slots);
      }
      const straightSlots = new Set(
        ordered.filter((item) => item.turn === 0).map((item) => slotOf.get(item.e)!),
      );
      const candidates: Array<(e: End) => number> = [];
      if (straightSlots.size <= 1) {
        const anchor = straightSlots.size ? [...straightSlots][0]! : slots / 2;
        candidates.push((e) => (slotOf.get(e)! - anchor) * spacing);
      }
      for (const [inOffset, outOffset] of [
        [half, -half],
        [-half, half],
        [0, spacing],
        [0, -spacing],
        [spacing, 0],
        [-spacing, 0],
      ] as const)
        candidates.push((e) => (e.end ? inOffset : outOffset));
      for (const offsetOf of candidates) {
        const next = new Map<State, TrackPoint[]>();
        let feasible = true;
        for (const e of ends) {
          const points = shifted(e.state, next.get(e.state) ?? e.state.points, e.end, offsetOf(e));
          if (!points) {
            feasible = false;
            break;
          }
          next.set(e.state, points);
        }
        if (!feasible) continue;
        const result = evaluate(next);
        if (!result || (!tolerant && result.crossings > 0) || result.opposing > EPS) continue;
        const { crossings, opposing, overlap } = result;
        const shift = ends.reduce((sum, e) => sum + Math.abs(offsetOf(e)), 0);
        const key = [Math.max(0, crossings), opposing, crossings, overlap, shift];
        if (!best || better(key, best.key)) best = { points: next, key };
      }
      if (!best) continue;
      commit(best.points);
    }
  }

  /**
   * A track carrying both directions splits into lanes: every interior
   * segment of one direction on it moves together to a parallel track, so
   * same-direction edges keep sharing their track and only the opposite
   * direction leaves it.
   */
  function splitLanes(tolerant: boolean) {
    for (let round = 0; round < 4; round++) {
      let moved = false;
      for (const track of mixedTracks()) {
        const best = laneMove(track, tolerant);
        if (best) {
          commit(best.next);
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  /** Collinear overlapping segments carrying both directions. */
  function mixedTracks() {
    type Member = { state: State; index: number; lo: number; hi: number; sign: number };
    const result: Member[][] = [];
    {
      const lines = new Map<string, Member[]>();
      for (const state of states) {
        if (!state.route.movable) continue;
        const raw = segmentsOf(state.points);
        if (raw.length !== state.points.length - 1) continue;
        for (const [index, s] of raw.entries()) {
          const h = horizontal(s);
          if (!h && !vertical(s)) continue;
          const axis = h ? "x" : "y";
          const key = `${h ? "h" : "v"}:${Math.round((h ? s.a.y : s.a.x) * 1e3)}`;
          if (!lines.has(key)) lines.set(key, []);
          lines.get(key)!.push({
            state,
            index,
            lo: Math.min(s.a[axis], s.b[axis]),
            hi: Math.max(s.a[axis], s.b[axis]),
            sign: Math.sign(s.b[axis] - s.a[axis]),
          });
        }
      }
      for (const members of lines.values()) {
        members.sort((a, b) => a.lo - b.lo);
        // Overlapping members form one track.
        const tracks: Member[][] = [];
        let end = -Infinity;
        for (const member of members) {
          if (member.lo < end - EPS) tracks.at(-1)!.push(member);
          else tracks.push([member]);
          end = Math.max(end, member.hi);
        }
        for (const track of tracks) {
          const mixed = track.some((a) =>
            track.some(
              (b) =>
                a.state !== b.state &&
                a.sign !== b.sign &&
                Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > EPS,
            ),
          );
          if (mixed) result.push(track);
        }
      }
    }
    return result;
  }

  /**
   * Where crossing-neutral moves are exhausted, apply the cheapest move
   * anywhere in the layout, then retry neutral moves, until no sharing is left.
   */
  function separateCheapestFirst() {
    for (let step = 0; step < 4 * states.length; step++) {
      let pick: { apply: () => void; key: number[] } | undefined;
      const offer = (key: number[], apply: () => void) => {
        if (!pick || better(key, pick.key)) pick = { apply, key };
      };
      for (const track of mixedTracks()) {
        const best = laneMove(track, true);
        if (best) offer([best.key[0]!, best.key[1]!], () => commit(best.next));
      }
      for (const state of states) {
        if (!state.route.movable) continue;
        const best = routeMove(state, true);
        if (best)
          offer([best.key[0]!, best.gain], () => {
            state.points = best.points;
            state.measured = best.measured;
            changed.add(state);
          });
      }
      if (!pick) return;
      pick.apply();
      splitLanes(false);
      separateRoutes(false);
    }
  }

  function laneMove(
    track: ReadonlyArray<{ state: State; index: number; sign: number }>,
    tolerant: boolean,
  ) {
    const offsets = Array.from(
      { length: 8 },
      (_, i) => ((i % 2 ? 1 : -1) * (1 + (i >> 1)) * spacing) / 2,
    );
    let best: { next: Map<State, TrackPoint[]>; key: number[] } | undefined;
    const plans: Array<{
      moves: Array<{ state: State; index: number; delta: number }>;
      delta: number;
    }> = [];
    for (const sign of [1, -1])
      for (const delta of offsets)
        plans.push({
          delta,
          moves: track.filter((m) => m.sign === sign).map((m) => ({ ...m, delta })),
        });
    for (const delta of [spacing / 2, -spacing / 2])
      plans.push({
        delta: delta / 2,
        moves: track.map((m) => ({ ...m, delta: m.sign > 0 ? delta / 2 : -delta / 2 })),
      });
    {
      for (const plan of plans) {
        const next = new Map<State, TrackPoint[]>();
        let feasible = true;
        for (const { state, index, delta } of plan.moves) {
          const points = next.get(state) ?? state.points.map((p) => ({ ...p }));
          const raw = segmentsOf(points);
          if (index < 1 || index > raw.length - 2) {
            feasible = false;
            break;
          }
          const segment = raw[index]!,
            before = raw[index - 1]!,
            after = raw[index + 1]!;
          const h = horizontal(segment);
          if (
            h ? !vertical(before) || !vertical(after) : !horizontal(before) || !horizontal(after)
          ) {
            feasible = false;
            break;
          }
          if (state.route.labels.some((label) => hits(segment, inflate(label, spacing)))) {
            feasible = false;
            break;
          }
          const shift = (p: TrackPoint) =>
            h ? { x: p.x, y: p.y + delta } : { x: p.x + delta, y: p.y };
          points[index] = shift(points[index]!);
          points[index + 1] = shift(points[index + 1]!);
          const a = { a: points[index - 1]!, b: points[index]! },
            b = { a: points[index + 1]!, b: points[index + 2]! };
          const keeps = (old: Segment, now: Segment) =>
            (old.b.x - old.a.x) * (now.b.x - now.a.x) + (old.b.y - old.a.y) * (now.b.y - now.a.y) >
              0 && size(now) >= Math.min(size(old), MINSTUB * spacing) - EPS;
          if (!keeps(before, a) || !keeps(after, b)) {
            feasible = false;
            break;
          }
          next.set(state, points);
        }
        if (!feasible || !next.size) continue;
        const result = evaluate(next);
        if (!result || result.opposing >= -EPS) continue;
        const key = [
          Math.max(0, result.crossings),
          result.opposing,
          result.overlap,
          Math.abs(plan.delta),
        ];
        if (!best || better(key, best.key)) best = { next, key };
      }
    }
    return !best || (!tolerant && best.key[0]! > 0) ? undefined : best;
  }

  function commit(next: ReadonlyMap<State, TrackPoint[]>) {
    for (const [state, points] of next) {
      state.points = points;
      state.measured = clip(segmentsOf(points), state.route.labels);
      changed.add(state);
    }
  }

  /**
   * Measure moving several routes at once: undefined when a move adds node or
   * label hits, container-border crossings or retraces; otherwise the change
   * in crossings and opposing length, and the resulting shared length.
   */
  function evaluate(next: ReadonlyMap<State, TrackPoint[]>) {
    const touched = [...next.keys()];
    const before = new Map(touched.map((state) => [state, state.points]));
    const baseline = touched.map((state) => {
      const result = measure(state, state.measured);
      return {
        state,
        crossings: result.crossings,
        opposing: result.opposing,
        retrace: retrace(state.route, state.measured),
        borders: borders(segmentsOf(state.points)),
      };
    });
    for (const [state, points] of next) {
      state.points = points;
      state.measured = clip(segmentsOf(points), state.route.labels);
    }
    let crossings = 0,
      opposing = 0,
      overlap = 0,
      ok = true;
    for (const base of baseline) {
      const { state } = base;
      const old = segmentsOf(before.get(state)!),
        segments = segmentsOf(state.points);
      const added = segments.filter(
        (s) => !old.some((o) => size(o) > EPS && shared(o, s) >= size(s) - EPS),
      );
      if (
        added.some((s) => leafRects.some((r) => hits(s, r))) ||
        allLabels.some(({ rect }) => added.some((s) => hits(s, rect))) ||
        borders(segments) !== base.borders ||
        retrace(state.route, state.measured) > base.retrace + EPS
      ) {
        ok = false;
        break;
      }
      const result = measure(state, state.measured);
      crossings += result.crossings - base.crossings;
      opposing += result.opposing - base.opposing;
      overlap += result.overlap;
    }
    for (const state of touched) {
      state.points = before.get(state)!;
      state.measured = clip(segmentsOf(state.points), state.route.labels);
    }
    return ok ? { crossings, opposing, overlap } : undefined;
  }
}

/**
 * Separate opposite-direction track sharing in a finished native layout, in
 * world coordinates. Only orthogonal layouts are changed.
 */
export function separateLayoutOpposingTracks<N, E, G, P>(
  graph: CompoundVisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
): CompoundVisualGraph<N, E, G, P> {
  if ((options.settings?.edgeRouting ?? "ORTHOGONAL") !== "ORTHOGONAL") return graph;
  const world = worldGeometry(graph);
  const parents = new Set(world.nodes.map((node) => node.parentId));
  const nodes = new Map<string, TrackRect>(),
    ports = new Map<string, TrackPort>();
  for (const node of world.nodes) {
    nodes.set(node.id, { x: node.x, y: node.y, width: node.width, height: node.height });
    for (const port of node.ports ?? [])
      ports.set(`${node.id}\0${port.name}`, {
        node: node.id,
        rect: { x: node.x + port.x, y: node.y + port.y, width: port.width, height: port.height },
      });
  }
  const leaves = new Set(world.nodes.filter((node) => !parents.has(node.id)).map((n) => n.id));
  const routes: TrackRoute[] = world.edges.map((edge) => {
    const points = edge.points ?? [];
    const route = graph.compoundRoutes.get(edge.id);
    const portOf = (node: string, port: string | undefined) =>
      port !== undefined && ports.has(`${node}\0${port}`) ? `${node}\0${port}` : undefined;
    return {
      id: edge.id,
      ends: [edge.sourceId, edge.targetId],
      points,
      labels: edge.width > 0 && edge.height > 0 ? [edge] : [],
      ports: [portOf(edge.sourceId, edge.sourcePort), portOf(edge.targetId, edge.targetPort)],
      movable:
        points.length > 1 &&
        points.every(
          (p, i) =>
            i === 0 ||
            Math.abs(p.x - points[i - 1]!.x) < EPS ||
            Math.abs(p.y - points[i - 1]!.y) < EPS,
        ) &&
        (!route ||
          (route.sections.length === 1 &&
            route.sections[0]!.path.segments.every((segment) => segment.kind === "line"))),
    };
  });
  if (!routes.some((route) => route.movable)) return graph;
  const spacing = Number(options.settings?.["spacing.edgeEdge"] ?? 10);
  const changed = separateOpposingTracks({
    routes,
    nodes,
    leaves,
    ports,
    spacing: Number.isFinite(spacing) && spacing > 0 ? spacing : 10,
  });
  if (!changed.size) return graph;
  const worldEdges = new Map(world.edges.map((edge) => [edge.id, edge]));
  const compoundRoutes = new Map(graph.compoundRoutes);
  const edges = graph.edges.map((edge) => {
    const points = changed.get(edge.id);
    if (!points || !edge.points?.length) return edge;
    const from = worldEdges.get(edge.id)!.points![0]!,
      to = edge.points[0]!;
    const local = points.map((p) => ({ x: p.x - from.x + to.x, y: p.y - from.y + to.y }));
    const route = compoundRoutes.get(edge.id);
    if (route)
      compoundRoutes.set(edge.id, {
        ...route,
        sections: [
          {
            ...route.sections[0]!,
            path: {
              start: points[0]!,
              segments: points.slice(1).map((p) => ({ kind: "line" as const, to: p })),
            },
          },
        ],
      });
    return { ...edge, points: local };
  });
  const result = { ...graph, edges, compoundRoutes };
  if (compoundRoutes.size) recordRouteGeometry(result, compoundRoutes);
  return result;
}
