import { crossesRect } from "../authoring/routing";
import { distance } from "./path";
import { inflate, union } from "./spatial";
import type { RouteBounds, RoutePoint } from "./types";

export interface SearchContext {
  obstacles(bounds: RouteBounds): readonly RouteBounds[];
  edgeCost?(a: RoutePoint, b: RoutePoint): number;
  guides?(bounds: RouteBounds): readonly RouteBounds[];
  readonly maxSearchNodes: number;
  readonly maxGridNodes?: number;
  readonly bendPenalty: number;
  visited: number;
  budgetExceeded: boolean;
}
export const segmentBounds = (a: RoutePoint, b: RoutePoint): RouteBounds => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(b.x - a.x),
  height: Math.abs(b.y - a.y),
});
export function clear(a: RoutePoint, b: RoutePoint, context: SearchContext): boolean {
  return !context.obstacles(segmentBounds(a, b)).some((r) => crossesRect(a, b, r));
}
export function simplify(points: readonly RoutePoint[]): RoutePoint[] {
  const result: RoutePoint[] = [];
  for (const p of points) {
    if (result.length && distance(result.at(-1)!, p) < 1e-9) continue;
    while (result.length > 1) {
      const a = result.at(-2)!,
        b = result.at(-1)!;
      if (
        Math.abs((b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x)) > 1e-8 ||
        (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y) < 0
      )
        break;
      result.pop();
    }
    result.push(p);
  }
  return result;
}
class Queue<T> {
  items: { value: T; priority: number }[] = [];
  push(value: T, priority: number) {
    const item = { value, priority };
    let i = this.items.length;
    this.items.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p]!.priority <= priority) break;
      this.items[i] = this.items[p]!;
      i = p;
    }
    this.items[i] = item;
  }
  pop(): T {
    const first = this.items[0]!,
      last = this.items.pop()!;
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1;
        if (
          child + 1 < this.items.length &&
          this.items[child + 1]!.priority < this.items[child]!.priority
        )
          child++;
        if (last.priority <= this.items[child]!.priority) break;
        this.items[i] = this.items[child]!;
        i = child;
      }
      this.items[i] = last;
    }
    return first.value;
  }
}
/** Visibility graph + A*, with incoming direction in the state for bend costs. */
export function findPath(
  start: RoutePoint,
  end: RoutePoint,
  style: "orthogonal" | "polyline" | "octilinear",
  context: SearchContext,
  terminals: { incoming?: RoutePoint; outgoing?: RoutePoint } = {},
): RoutePoint[] | undefined {
  const maxGridNodes = context.maxGridNodes ?? context.maxSearchNodes;
  const turnCost = (a: RoutePoint | undefined, b: RoutePoint | undefined) => {
    if (!a || !b || !Math.hypot(a.x, a.y) || !Math.hypot(b.x, b.y)) return 0;
    const dot = a.x * b.x + a.y * b.y,
      cross = a.x * b.y - a.y * b.x;
    return dot < -1e-8 ? context.bendPenalty * 4 : Math.abs(cross) > 1e-8 ? context.bendPenalty : 0;
  };
  const delta = (a: RoutePoint, b: RoutePoint) => ({ x: b.x - a.x, y: b.y - a.y });
  const attachmentCost = (points: RoutePoint[]) =>
    turnCost(terminals.incoming, delta(points[0]!, points[1]!)) +
    turnCost(delta(points.at(-2)!, points.at(-1)!), terminals.outgoing);
  const aligned = start.x === end.x || start.y === end.y;
  if (
    (style === "polyline" ||
      aligned ||
      (style === "octilinear" && Math.abs(start.x - end.x) === Math.abs(start.y - end.y))) &&
    clear(start, end, context) &&
    attachmentCost([start, end]) === 0 &&
    (context.edgeCost?.(start, end) ?? 0) === 0
  )
    return [start, end];
  if (style === "orthogonal") {
    const candidates = [
      { x: start.x, y: end.y },
      { x: end.x, y: start.y },
    ]
      .filter((bend) => clear(start, bend, context) && clear(bend, end, context))
      .map((bend) => simplify([start, bend, end]));
    candidates.sort((a, b) => attachmentCost(a) - attachmentCost(b));
    if (
      candidates.length &&
      attachmentCost(candidates[0]!) === 0 &&
      candidates[0]!
        .slice(1)
        .every((p, i) => (context.edgeCost?.(candidates[0]![i]!, p) ?? 0) === 0)
    )
      return candidates[0];
  }
  for (let attempt = 0; attempt < 5 && context.visited < context.maxSearchNodes; attempt++) {
    const area = inflate(segmentBounds(start, end), 32 * 2 ** attempt);
    const guides = context.guides?.(area) ?? [];
    const obstacles = context.obstacles(guides.reduce(union, area));
    const corners = [...obstacles, ...guides].flatMap((r) => [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
      { x: r.x, y: r.y + r.height },
      { x: r.x + r.width, y: r.y + r.height },
    ]);
    let points: RoutePoint[], neighbors: (i: number) => number[];
    if (style === "polyline") {
      points = [start, end, ...corners];
      neighbors = () => points.map((_, i) => i);
    } else {
      // Fractional compound offsets can produce almost-identical grid tracks.
      // Zero-length steps between them bypass terminal direction constraints.
      const coordinates = (values: number[]) => {
        const endpoints = values.slice(0, 2);
        const sorted = [...values].sort((a, b) => a - b);
        const unique: number[] = [];
        for (const value of sorted) {
          if (unique.length && Math.abs(value - unique.at(-1)!) < 1e-8) continue;
          unique.push(value);
        }
        // Preserve exact terminal values so reconstructed leads stay aligned.
        return unique.map((value) => endpoints.find((p) => Math.abs(p - value) < 1e-8) ?? value);
      };
      const xs = coordinates([
        start.x,
        end.x,
        area.x,
        area.x + area.width,
        ...corners.map((p) => p.x),
      ]);
      const ys = coordinates([
        start.y,
        end.y,
        area.y,
        area.y + area.height,
        ...corners.map((p) => p.y),
      ]);
      if (xs.length * ys.length > maxGridNodes) {
        context.budgetExceeded = true;
        return undefined;
      }
      points = ys.flatMap((y) => xs.map((x) => ({ x, y })));
      const width = xs.length;
      if (style === "octilinear") {
        // Add intersections between endpoint/corner diagonals and grid lines.
        const extra: RoutePoint[] = [];
        for (const p of [start, end, ...corners])
          for (const x of xs)
            for (const sign of [-1, 1]) {
              const y = p.y + sign * (x - p.x);
              if (y >= area.y && y <= area.y + area.height) extra.push({ x, y });
            }
        for (const p of [start, end, ...corners])
          for (const y of ys)
            for (const sign of [-1, 1]) {
              const x = p.x + sign * (y - p.y);
              if (x >= area.x && x <= area.x + area.width) extra.push({ x, y });
            }
        const unique = new Map(points.map((p) => [`${p.x}:${p.y}`, p]));
        for (const p of extra) unique.set(`${p.x}:${p.y}`, p);
        points = [...unique.values()];
        if (points.length > maxGridNodes) {
          context.budgetExceeded = true;
          return undefined;
        }
        const groups = new Map<string, number[]>();
        const keys = (p: RoutePoint) => [
          `x:${p.x}`,
          `y:${p.y}`,
          `a:${(p.x - p.y).toFixed(8)}`,
          `b:${(p.x + p.y).toFixed(8)}`,
        ];
        points.forEach((p, i) => {
          for (const key of keys(p)) {
            const list = groups.get(key) ?? [];
            list.push(i);
            groups.set(key, list);
          }
        });
        const adjacent = points.map(() => new Set<number>());
        for (const ids of groups.values()) {
          ids.sort((a, b) => points[a]!.x - points[b]!.x || points[a]!.y - points[b]!.y);
          for (let i = 1; i < ids.length; i++) {
            adjacent[ids[i - 1]!]!.add(ids[i]!);
            adjacent[ids[i]!]!.add(ids[i - 1]!);
          }
        }
        neighbors = (i) => [...adjacent[i]!];
      } else
        neighbors = (i) =>
          [
            i % width ? i - 1 : -1,
            i % width < width - 1 ? i + 1 : -1,
            i >= width ? i - width : -1,
            i + width < points.length ? i + width : -1,
          ].filter((v) => v >= 0);
    }
    if (points.length > maxGridNodes) {
      context.budgetExceeded = true;
      return undefined;
    }
    const from = points.findIndex((p) => distance(p, start) < 1e-8),
      to = points.findIndex((p) => distance(p, end) < 1e-8);
    const queue = new Queue<{ index: number; previous: number; key: string; cost: number }>();
    const costs = new Map<string, number>(),
      parents = new Map<string, string>(),
      vertices = new Map<string, number>(),
      visibility = new Map<number, boolean>(),
      edgeCosts = new Map<number, number>();
    const visible = (a: number, b: number) => {
      const key = a < b ? a * points.length + b : b * points.length + a;
      let result = visibility.get(key);
      if (result === undefined) {
        result = clear(points[a]!, points[b]!, context);
        visibility.set(key, result);
      }
      return result;
    };
    const first = `${from}:-1`;
    costs.set(first, 0);
    vertices.set(first, from);
    queue.push({ index: from, previous: -1, key: first, cost: 0 }, distance(start, end));
    while (queue.items.length && context.visited < context.maxSearchNodes) {
      const current = queue.pop();
      if (costs.get(current.key) !== current.cost) continue;
      context.visited++;
      if (current.index === to) {
        const result: RoutePoint[] = [];
        let key: string | undefined = current.key;
        while (key !== undefined) {
          result.push(points[vertices.get(key)!]!);
          key = parents.get(key);
        }
        return simplify(result.reverse());
      }
      const a = points[current.index]!;
      for (const next of neighbors(current.index)) {
        if (next === current.index || next === current.previous) continue;
        const b = points[next]!;
        if (!visible(current.index, next)) continue;
        const before =
          current.previous < 0 ? terminals.incoming : delta(points[current.previous]!, a);
        const step = delta(a, b);
        const reverses = (incoming: RoutePoint | undefined, outgoing: RoutePoint | undefined) =>
          incoming &&
          outgoing &&
          Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x) < 1e-8 &&
          incoming.x * outgoing.x + incoming.y * outgoing.y < -1e-8;
        // A terminal lead must leave/enter its boundary in the chosen direction.
        // Paying a bend penalty to immediately retrace that lead is not a turn.
        if (
          (current.previous < 0 && reverses(terminals.incoming, step)) ||
          (next === to && reverses(step, terminals.outgoing))
        )
          continue;
        const bend =
          turnCost(before, step) + (next === to ? turnCost(step, terminals.outgoing) : 0);
        const pair = Math.min(current.index, next) * points.length + Math.max(current.index, next);
        let edgeCost = edgeCosts.get(pair);
        if (edgeCost === undefined) {
          edgeCost = context.edgeCost?.(a, b) ?? 0;
          edgeCosts.set(pair, edgeCost);
        }
        const cost = current.cost + distance(a, b) + bend + edgeCost;
        const key = `${next}:${current.index}`;
        if (cost >= (costs.get(key) ?? Infinity)) continue;
        costs.set(key, cost);
        parents.set(key, current.key);
        vertices.set(key, next);
        queue.push({ index: next, previous: current.index, key, cost }, cost + distance(b, end));
      }
    }
  }
  if (context.visited >= context.maxSearchNodes) context.budgetExceeded = true;
  return undefined;
}
export function pointsBounds(points: readonly RoutePoint[]): RouteBounds {
  return points.slice(1).reduce<RouteBounds>((r, p) => union(r, { ...p, width: 0, height: 0 }), {
    ...points[0]!,
    width: 0,
    height: 0,
  });
}
