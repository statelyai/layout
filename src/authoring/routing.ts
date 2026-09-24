import type { EntityRect, Point, VisualNode, GraphEdge } from "@statelyai/graph";
import { LayoutError } from "../errors";
import type { LayoutDirection } from "../types";

export function overlaps(a: EntityRect, b: EntityRect, gap = 0): boolean {
  return (
    a.width > 0 &&
    a.height > 0 &&
    b.width > 0 &&
    b.height > 0 &&
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

/** Open-interior intersection: travelling along a rectangle boundary is allowed. */
export function crossesRect(a: Point, b: Point, rect: EntityRect): boolean {
  let low = 0,
    high = 1;
  for (const axis of ["x", "y"] as const) {
    const delta = b[axis] - a[axis];
    const min = rect[axis],
      max = min + (axis === "x" ? rect.width : rect.height);
    if (Math.abs(delta) < 1e-10) {
      if (a[axis] <= min || a[axis] >= max) return false;
    } else {
      const t1 = (min - a[axis]) / delta,
        t2 = (max - a[axis]) / delta;
      low = Math.max(low, Math.min(t1, t2));
      high = Math.min(high, Math.max(t1, t2));
    }
  }
  return low < high - 1e-10;
}

export function routeCrosses(points: readonly Point[] | undefined, rect: EntityRect): boolean {
  return points?.some((point, i) => i > 0 && crossesRect(points[i - 1]!, point, rect)) ?? false;
}

export function endpoint(
  node: VisualNode,
  portName: string | undefined,
  direction: LayoutDirection,
  source: boolean,
): Point {
  if (portName !== undefined) {
    const port = node.ports?.find((p) => p.name === portName);
    if (port?.x !== undefined && port.y !== undefined) {
      return {
        x: node.x + port.x + (port.width ?? 0) / 2,
        y: node.y + port.y + (port.height ?? 0) / 2,
      };
    }
    throw new LayoutError(
      `Port ${portName} on ${node.id} requires positioned geometry`,
      "MISSING_GEOMETRY",
    );
  }
  const horizontal = direction === "left" || direction === "right";
  const forward = direction === "right" || direction === "down";
  const far = source === forward;
  return horizontal
    ? { x: node.x + (far ? node.width : 0), y: node.y + node.height / 2 }
    : { x: node.x + node.width / 2, y: node.y + (far ? node.height : 0) };
}

/** Deterministic orthogonal visibility-grid search around fixed rectangles. */
function connect(
  start: Point,
  end: Point,
  obstacles: readonly EntityRect[],
  check: () => void,
): Point[] | undefined {
  if (start.x === end.x && start.y === end.y) return [start];
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap((r) => [r.x, r.x + r.width])])].sort(
    (a, b) => a - b,
  );
  const ys = [
    ...new Set([start.y, end.y, ...obstacles.flatMap((r) => [r.y, r.y + r.height])]),
  ].sort((a, b) => a - b);
  // Bound interactive work; the caller returns a diagnostic without inventing a route.
  if (xs.length * ys.length > 40000) return undefined;
  const width = xs.length;
  const point = (id: number): Point => ({ x: xs[id % width]!, y: ys[Math.floor(id / width)]! });
  const from = ys.indexOf(start.y) * width + xs.indexOf(start.x);
  const to = ys.indexOf(end.y) * width + xs.indexOf(end.x);
  const distances = new Map<number, number>([[from, 0]]);
  const previous = new Map<number, number>();
  const queue: { id: number; cost: number }[] = [];
  function push(item: { id: number; cost: number }) {
    queue.push(item);
    let i = queue.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (queue[parent]!.cost <= item.cost) break;
      queue[i] = queue[parent]!;
      i = parent;
    }
    queue[i] = item;
  }
  function pop() {
    const first = queue[0]!;
    const last = queue.pop()!;
    if (queue.length) {
      let i = 0;
      while (i * 2 + 1 < queue.length) {
        let child = i * 2 + 1;
        if (child + 1 < queue.length && queue[child + 1]!.cost < queue[child]!.cost) child++;
        if (last.cost <= queue[child]!.cost) break;
        queue[i] = queue[child]!;
        i = child;
      }
      queue[i] = last;
    }
    return first;
  }
  push({ id: from, cost: 0 });
  let visits = 0;
  while (queue.length) {
    if (++visits % 128 === 0) check();
    const current = pop();
    if (current.cost !== distances.get(current.id)) continue;
    if (current.id === to) {
      const result = [end];
      let id = to;
      while (id !== from) {
        id = previous.get(id)!;
        result.push(point(id));
      }
      return result.reverse();
    }
    const x = current.id % width,
      y = Math.floor(current.id / width);
    const neighbors = [
      x > 0 ? current.id - 1 : -1,
      x + 1 < width ? current.id + 1 : -1,
      y > 0 ? current.id - width : -1,
      y + 1 < ys.length ? current.id + width : -1,
    ];
    const a = point(current.id);
    for (const next of neighbors) {
      if (next < 0) continue;
      const b = point(next);
      if (obstacles.some((rect) => crossesRect(a, b, rect))) continue;
      const cost = current.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (cost >= (distances.get(next) ?? Infinity)) continue;
      distances.set(next, cost);
      previous.set(next, current.id);
      push({ id: next, cost });
    }
  }
  return undefined;
}

export function routeOrthogonal(
  edge: GraphEdge,
  source: VisualNode,
  target: VisualNode,
  direction: LayoutDirection,
  obstacles: readonly EntityRect[],
  waypoints: readonly Point[],
  check: () => void,
): Point[] | undefined {
  const anchors = [
    endpoint(source, edge.sourcePort, direction, true),
    ...waypoints,
    endpoint(target, edge.targetPort, direction, false),
  ];
  const points: Point[] = [];
  for (let i = 1; i < anchors.length; i++) {
    const segment = connect(anchors[i - 1]!, anchors[i]!, obstacles, check);
    if (!segment) return undefined;
    points.push(...(points.length ? segment.slice(1) : segment));
  }
  return points.filter((p, i) => {
    if (i === 0 || i === points.length - 1) return true;
    const before = points[i - 1]!,
      after = points[i + 1]!;
    return !(
      (before.x === p.x && p.x === after.x && (p.y - before.y) * (after.y - p.y) >= 0) ||
      (before.y === p.y && p.y === after.y && (p.x - before.x) * (after.x - p.x) >= 0)
    );
  });
}
