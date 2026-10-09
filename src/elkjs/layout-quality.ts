import type { ElkNode } from "./types";

/** Geometry measures used to choose between candidate layouts of one graph. */
export interface LayoutQuality {
  /** Routes through leaf nodes, routes folded onto themselves, and diagonal segments. */
  defects: number;
  crossings: number;
  overlap: number;
  bends: number;
  length: number;
  area: number;
}

interface Point {
  x: number;
  y: number;
}
interface Rect extends Point {
  width: number;
  height: number;
}
interface Segment {
  a: Point;
  b: Point;
}

const EPS = 1e-6;
/** Shared endpoint nodes get this clearance, so fan-in and fan-out are not penalized. */
const TERMINAL_MARGIN = 12;
const horizontal = (s: Segment) => Math.abs(s.a.y - s.b.y) < EPS;
const vertical = (s: Segment) => Math.abs(s.a.x - s.b.x) < EPS;
const span = (s: Segment, axis: "x" | "y") =>
  [Math.min(s.a[axis], s.b[axis]), Math.max(s.a[axis], s.b[axis])] as const;
const strictlyInside = (value: number, low: number, high: number) =>
  value > low + EPS && value < high - EPS;
const overlapLength = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
/** Within `margin` of the rectangle, its border included. */
const inRect = (point: Point, rect: Rect, margin: number) =>
  point.x >= rect.x - margin - EPS &&
  point.x <= rect.x + rect.width + margin + EPS &&
  point.y >= rect.y - margin - EPS &&
  point.y <= rect.y + rect.height + margin + EPS;

/**
 * Measure an ELK JSON result in absolute coordinates. `defectsOnly` skips the
 * pairwise route measures (crossings and overlap stay 0).
 */
export function measureLayout(root: ElkNode, defectsOnly = false): LayoutQuality {
  const frames = new Map<string, Point>([[String(root.id), { x: 0, y: 0 }]]);
  const rects = new Map<string, Rect>();
  const owner = new Map<string, string>();
  const leaves: Rect[] = [];
  const bounds: Point[] = [];
  const place = (parent: ElkNode, offset: Point) => {
    for (const child of parent.children ?? []) {
      const id = String(child.id);
      const at = { x: offset.x + (child.x ?? 0), y: offset.y + (child.y ?? 0) };
      const rect = { ...at, width: child.width ?? 0, height: child.height ?? 0 };
      frames.set(id, at);
      rects.set(id, rect);
      owner.set(id, id);
      for (const port of child.ports ?? []) owner.set(String(port.id), id);
      bounds.push(at, { x: at.x + rect.width, y: at.y + rect.height });
      if (child.children?.length) place(child, at);
      else leaves.push(rect);
    }
  };
  place(root, { x: 0, y: 0 });

  const routes: Array<{ ends: string[]; segments: Segment[]; visible: Segment[]; labels: Rect[] }> =
    [];
  let defects = 0,
    bends = 0,
    length = 0;
  const collect = (parent: ElkNode) => {
    for (const edge of parent.edges ?? []) {
      const container = String((edge as { container?: string }).container ?? parent.id);
      const offset = frames.get(container) ?? { x: 0, y: 0 };
      const ends = [edge.sources?.[0], edge.targets?.[0]].flatMap((end) => {
        const node = owner.get(String(end));
        return node === undefined ? [] : [node];
      });
      const segments: Segment[] = [];
      for (const section of edge.sections ?? []) {
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
          (point) => ({ x: point.x + offset.x, y: point.y + offset.y }),
        );
        bounds.push(...points);
        let direction: Point | undefined;
        for (let index = 0; index + 1 < points.length; index++) {
          const segment = { a: points[index]!, b: points[index + 1]! };
          const size = Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y);
          if (size < EPS) continue;
          if (!horizontal(segment) && !vertical(segment)) defects++;
          const next = {
            x: Math.sign(segment.b.x - segment.a.x),
            y: Math.sign(segment.b.y - segment.a.y),
          };
          if (direction && (direction.x !== next.x || direction.y !== next.y)) bends++;
          direction = next;
          length += size;
          segments.push(segment);
        }
      }
      const labels = (edge.labels ?? []).flatMap((label) =>
        label.width && label.height
          ? [
              {
                x: (label.x ?? 0) + offset.x,
                y: (label.y ?? 0) + offset.y,
                width: label.width,
                height: label.height,
              },
            ]
          : [],
      );
      for (const label of labels)
        bounds.push(label, { x: label.x + label.width, y: label.y + label.height });
      // A route through a leaf, or folding back onto itself, is a defect.
      for (const segment of segments)
        for (const rect of leaves)
          if (
            (horizontal(segment) &&
              strictlyInside(segment.a.y, rect.y, rect.y + rect.height) &&
              overlapLength(span(segment, "x"), [rect.x, rect.x + rect.width]) > EPS) ||
            (vertical(segment) &&
              strictlyInside(segment.a.x, rect.x, rect.x + rect.width) &&
              overlapLength(span(segment, "y"), [rect.y, rect.y + rect.height]) > EPS)
          )
            defects++;
      for (const [index, first] of segments.entries())
        for (const second of segments.slice(index + 1))
          if (sharedLength(first, second) > EPS) defects++;
      routes.push({
        ends,
        segments,
        visible:
          labels.length && !defectsOnly ? segments.flatMap((s) => outsideAll(s, labels)) : segments,
        labels,
      });
    }
    for (const child of parent.children ?? []) collect(child);
  };
  collect(root);

  // Labels covering nodes or each other, and routes through other edges'
  // labels, are defects.
  const allLabels = routes.flatMap((route) => route.labels);
  const covers = (a: Rect, b: Rect) =>
    a.x < b.x + b.width - EPS &&
    a.x + a.width > b.x + EPS &&
    a.y < b.y + b.height - EPS &&
    a.y + a.height > b.y + EPS;
  for (const [index, label] of allLabels.entries()) {
    for (const rect of leaves) if (covers(label, rect)) defects++;
    for (const other of allLabels.slice(index + 1)) if (covers(label, other)) defects++;
  }
  for (const route of routes)
    for (const other of routes)
      if (other !== route)
        for (const label of other.labels)
          if (
            route.segments.some(
              (segment) =>
                (horizontal(segment) &&
                  strictlyInside(segment.a.y, label.y, label.y + label.height) &&
                  overlapLength(span(segment, "x"), [label.x, label.x + label.width]) > EPS) ||
                (vertical(segment) &&
                  strictlyInside(segment.a.x, label.x, label.x + label.width) &&
                  overlapLength(span(segment, "y"), [label.y, label.y + label.height]) > EPS),
            )
          )
            defects++;

  let crossings = 0,
    overlap = 0;
  if (!defectsOnly)
    for (const [index, first] of routes.entries())
      for (const second of routes.slice(index + 1)) {
        const shared = first.ends
          .filter((id) => second.ends.includes(id))
          .flatMap((id) => {
            const rect = rects.get(id);
            return rect ? [rect] : [];
          });
        const clear = (point: Point) =>
          shared.every((rect) => !inRect(point, rect, TERMINAL_MARGIN));
        // A crossing under an edge's own label is not seen; two routes crossing
        // at one point cross once.
        let points: Set<string> | undefined;
        const cross = (s: Segment, t: Segment) => {
          const h = horizontal(s) && vertical(t) ? s : horizontal(t) && vertical(s) ? t : undefined;
          if (!h) return;
          const v = h === s ? t : s;
          const point = { x: v.a.x, y: h.a.y };
          if (
            strictlyInside(point.x, ...span(h, "x")) &&
            strictlyInside(point.y, ...span(v, "y")) &&
            clear(point)
          )
            (points ??= new Set()).add(`${Math.round(point.x / EPS)}:${Math.round(point.y / EPS)}`);
        };
        const unlabeled = first.visible === first.segments && second.visible === second.segments;
        for (const s of first.segments)
          for (const t of second.segments) {
            if (unlabeled) cross(s, t);
            const shared = sharedLength(s, t);
            if (shared > EPS && clear(s.a) && clear(s.b)) overlap += shared;
          }
        if (!unlabeled) for (const s of first.visible) for (const t of second.visible) cross(s, t);
        crossings += points?.size ?? 0;
      }
  const xs = bounds.map((point) => point.x).filter(Number.isFinite),
    ys = bounds.map((point) => point.y).filter(Number.isFinite);
  const area = xs.length
    ? (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
    : 0;
  return { defects, crossings, overlap, bends, length, area };
}

/** The parts of an axis-parallel segment outside the open interiors of `rects`. */
function outsideAll(segment: Segment, rects: readonly Rect[]): Segment[] {
  let parts = [segment];
  for (const rect of rects)
    parts = parts.flatMap((part) => {
      const axis = horizontal(part) ? "x" : vertical(part) ? "y" : undefined;
      if (!axis) return [part];
      const cross = axis === "x" ? "y" : "x";
      const [low, high] =
        axis === "x" ? [rect.x, rect.x + rect.width] : [rect.y, rect.y + rect.height];
      const [crossLow, crossHigh] =
        cross === "x" ? [rect.x, rect.x + rect.width] : [rect.y, rect.y + rect.height];
      if (!strictlyInside(part.a[cross], crossLow, crossHigh)) return [part];
      const [from, to] = span(part, axis);
      if (overlapLength([from, to], [low, high]) <= EPS) return [part];
      const at = (value: number) => ({ ...part.a, [axis]: value }) as Point;
      return (
        [
          [from, Math.max(from, low)],
          [Math.min(to, high), to],
        ] as const
      )
        .filter(([a, b]) => b - a > EPS)
        .map(([a, b]) => ({ a: at(a), b: at(b) }));
    });
  return parts;
}

function sharedLength(s: Segment, t: Segment): number {
  if (horizontal(s) && horizontal(t) && Math.abs(s.a.y - t.a.y) < EPS)
    return overlapLength(span(s, "x"), span(t, "x"));
  if (vertical(s) && vertical(t) && Math.abs(s.a.x - t.a.x) < EPS)
    return overlapLength(span(s, "y"), span(t, "y"));
  return 0;
}

const TOLERANCE = 0.02;
/** True when `candidate` is better at the first measure where the two layouts differ. */
export function isBetterLayout(candidate: LayoutQuality, current: LayoutQuality): boolean {
  for (const key of ["defects", "crossings", "overlap", "bends", "length", "area"] as const) {
    const tolerant = key === "overlap" || key === "length" || key === "area";
    const limit = tolerant ? Math.max(TOLERANCE * Math.abs(current[key]), EPS) : 0;
    if (Math.abs(candidate[key] - current[key]) > limit) return candidate[key] < current[key];
  }
  return false;
}
