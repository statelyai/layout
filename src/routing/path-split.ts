import { arcCenter, splitSegment, toSvgPath } from "./path";
import type { RouteBounds, RoutePath, RoutePoint, RouteSegment } from "./types";

interface Position {
  readonly index: number;
  readonly t: number;
}

function roots(value: (t: number) => number, critical: readonly number[]): number[] {
  const stops = [0, ...critical.filter((t) => t > 0 && t < 1), 1].sort((a, b) => a - b);
  const result: number[] = [];
  for (let i = 1; i < stops.length; i++) {
    let low = stops[i - 1]!,
      high = stops[i]!;
    const a = value(low),
      b = value(high);
    if (a === 0) result.push(low);
    if (b === 0) result.push(high);
    if (a < 0 === b < 0 || a === 0 || b === 0) continue;
    for (let step = 0; step < 60; step++) {
      const middle = (low + high) / 2;
      if (value(middle) < 0 === a < 0) low = middle;
      else high = middle;
    }
    result.push((low + high) / 2);
  }
  return result;
}

function quadraticRoots(a: number, b: number, c: number): number[] {
  if (a === 0) return b === 0 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  const q = -0.5 * (b + (b < 0 ? -root : root));
  return q === 0 ? [-b / (2 * a)] : [q / a, c / q];
}

function segmentGeometry(start: RoutePoint, segment: RouteSegment) {
  const arc = segment.kind === "arc" ? arcCenter(start, segment) : undefined;
  const point = (t: number): RoutePoint => {
    if (segment.kind === "line" || (segment.kind === "arc" && !arc))
      return {
        x: start.x + (segment.to.x - start.x) * t,
        y: start.y + (segment.to.y - start.y) * t,
      };
    if (arc) {
      const angle = arc.theta + t * arc.delta;
      return {
        x: arc.center.x + arc.c * arc.rx * Math.cos(angle) - arc.s * arc.ry * Math.sin(angle),
        y: arc.center.y + arc.s * arc.rx * Math.cos(angle) + arc.c * arc.ry * Math.sin(angle),
      };
    }
    const u = 1 - t;
    if (segment.kind === "quadratic")
      return {
        x: u * u * start.x + 2 * u * t * segment.control.x + t * t * segment.to.x,
        y: u * u * start.y + 2 * u * t * segment.control.y + t * t * segment.to.y,
      };
    if (segment.kind === "cubic")
      return {
        x:
          u ** 3 * start.x +
          3 * u * u * t * segment.control1.x +
          3 * u * t * t * segment.control2.x +
          t ** 3 * segment.to.x,
        y:
          u ** 3 * start.y +
          3 * u * u * t * segment.control1.y +
          3 * u * t * t * segment.control2.y +
          t ** 3 * segment.to.y,
      };
    return segment.to;
  };
  const critical = (axis: "x" | "y"): number[] => {
    if (arc) {
      const a = axis === "x" ? arc.c * arc.rx : arc.s * arc.rx;
      const b = axis === "x" ? -arc.s * arc.ry : arc.c * arc.ry;
      const phase = Math.atan2(b, a);
      const low = Math.min(arc.theta, arc.theta + arc.delta),
        high = Math.max(arc.theta, arc.theta + arc.delta);
      const result: number[] = [];
      for (let k = Math.ceil((low - phase) / Math.PI); phase + k * Math.PI < high; k++)
        result.push((phase + k * Math.PI - arc.theta) / arc.delta);
      return result;
    }
    if (segment.kind === "quadratic") {
      const denominator = start[axis] - 2 * segment.control[axis] + segment.to[axis];
      return denominator === 0 ? [] : [(start[axis] - segment.control[axis]) / denominator];
    }
    if (segment.kind === "cubic") {
      const a =
        -start[axis] + 3 * segment.control1[axis] - 3 * segment.control2[axis] + segment.to[axis];
      const b = 2 * (start[axis] - 2 * segment.control1[axis] + segment.control2[axis]);
      const c = segment.control1[axis] - start[axis];
      return quadraticRoots(a, b, c);
    }
    return [];
  };
  return { point, critical, linear: segment.kind === "line" || (segment.kind === "arc" && !arc) };
}

/** Remove the first-entry to last-exit passage through a rectangle, retaining exact curves. */
export function splitPathAtBounds(
  path: RoutePath,
  bounds: RouteBounds,
): { readonly before: RoutePath; readonly after: RoutePath } | undefined {
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
    bounds.width < 0 ||
    bounds.height < 0
  )
    throw new RangeError("Path split bounds must be finite and non-negative");
  toSvgPath(path);
  if (!bounds.width || !bounds.height || !path.segments.length) return;
  const inside = (p: RoutePoint) =>
    p.x > bounds.x &&
    p.x < bounds.x + bounds.width &&
    p.y > bounds.y &&
    p.y < bounds.y + bounds.height;
  if (inside(path.start) || inside(path.segments.at(-1)!.to)) return;
  let first: Position | undefined, last: Position | undefined;
  const starts: RoutePoint[] = [];
  let start = path.start;
  for (const [index, segment] of path.segments.entries()) {
    starts.push(start);
    const geometry = segmentGeometry(start, segment);
    const cuts = [0, 1];
    for (const axis of ["x", "y"] as const) {
      const critical = geometry.critical(axis);
      for (const face of [
        bounds[axis],
        bounds[axis] + (axis === "x" ? bounds.width : bounds.height),
      ]) {
        if (geometry.linear) {
          const delta = segment.to[axis] - start[axis];
          const t = (face - start[axis]) / delta;
          if (delta && t >= 0 && t <= 1) cuts.push(t);
        } else cuts.push(...roots((t) => geometry.point(t)[axis] - face, critical));
      }
    }
    cuts.sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const a = cuts[i - 1]!,
        b = cuts[i]!;
      if (b - a <= Number.EPSILON || !inside(geometry.point((a + b) / 2))) continue;
      first ??= { index, t: a };
      last = { index, t: b };
    }
    start = segment.to;
  }
  if (!first || !last) return;
  const [left] = splitSegment(starts[first.index]!, path.segments[first.index]!, first.t);
  const [, right] = splitSegment(starts[last.index]!, path.segments[last.index]!, last.t);
  return {
    before: {
      start: path.start,
      segments: [...path.segments.slice(0, first.index), ...(first.t > 0 ? left.segments : [])],
    },
    after: {
      start: right.start,
      segments: [...(last.t < 1 ? right.segments : []), ...path.segments.slice(last.index + 1)],
    },
  };
}
