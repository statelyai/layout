import type { RouteBounds as Rect, RoutePoint as Point } from "./types";

const pointDistance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

export function segmentAvoidsRect(a: Point, b: Point, rect: Rect): boolean {
  let enter = 0;
  let exit = 1;
  for (const [start, delta, low, high] of [
    [a.x, b.x - a.x, rect.x, rect.x + rect.width],
    [a.y, b.y - a.y, rect.y, rect.y + rect.height],
  ]) {
    if (Math.abs(delta!) < 1e-12) {
      if (start! <= low! || start! >= high!) return true;
      continue;
    }
    const first = (low! - start!) / delta!;
    const last = (high! - start!) / delta!;
    enter = Math.max(enter, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
    if (enter >= exit - 1e-12) return true;
  }
  return enter >= exit - 1e-12;
}

// This multi-source search preserves attachment candidate order on ties and limits
// obstacle corners. The general router search has different attachment costs/budgets.
export function shortestVisibilityPath(
  starts: readonly Point[],
  end: Point,
  obstacles: readonly Rect[],
  terminalBounds: readonly Rect[],
): Point[] | undefined {
  const clear = (a: Point, b: Point, rects = obstacles) =>
    rects.every((rect) => segmentAvoidsRect(a, b, rect));
  let direct: Point | undefined;
  for (const start of starts) {
    if ((!direct || pointDistance(start, end) < pointDistance(direct, end)) && clear(start, end))
      direct = start;
  }
  if (direct) return [direct, end];
  if (!starts.length) return undefined;
  const barriers = obstacles.map((rect) =>
    terminalBounds.some(
      (terminal) =>
        terminal.x === rect.x &&
        terminal.y === rect.y &&
        terminal.width === rect.width &&
        terminal.height === rect.height,
    )
      ? rect
      : {
          x: rect.x - 8,
          y: rect.y - 8,
          width: rect.width + 16,
          height: rect.height + 16,
        },
  );
  const relevance = (rect: Rect) =>
    Math.min(
      ...starts.map(
        (start) =>
          pointDistance(start, {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
          }) +
          pointDistance(end, {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
          }),
      ),
    );
  const corners = [...barriers]
    .sort((a, b) => relevance(a) - relevance(b))
    .slice(0, 48)
    .flatMap((rect) => [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ]);
  const points = [...starts, end, ...corners];
  const costs = points.map((_, index) => (index < starts.length ? 0 : Infinity));
  const previous = points.map(() => -1);
  const visited = new Set<number>();
  for (let step = 0; step < points.length; step++) {
    let current = -1;
    for (let index = 0; index < points.length; index++) {
      if (!visited.has(index) && (current < 0 || costs[index]! < costs[current]!)) current = index;
    }
    if (current < 0 || !Number.isFinite(costs[current])) return undefined;
    if (current === starts.length) {
      const result: Point[] = [];
      for (let index = current; index >= 0; index = previous[index]!) result.push(points[index]!);
      return result.reverse();
    }
    visited.add(current);
    for (let next = 0; next < points.length; next++) {
      if (visited.has(next)) continue;
      const candidate = costs[current]! + pointDistance(points[current]!, points[next]!);
      if (candidate >= costs[next]!) continue;
      if (!clear(points[current]!, points[next]!, barriers)) continue;
      costs[next] = candidate;
      previous[next] = current;
    }
  }
  return undefined;
}
