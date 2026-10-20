import { splitBezier } from "./bezier-fit";
import { arcCenter, distance } from "./path";
import type { RouteBounds, RoutePath, RoutePoint, RouteSegment } from "./types";

const subtract = (a: RoutePoint, b: RoutePoint): RoutePoint => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (point: RoutePoint, factor: number): RoutePoint => ({
  x: point.x * factor,
  y: point.y * factor,
});
const add = (a: RoutePoint, b: RoutePoint): RoutePoint => ({ x: a.x + b.x, y: a.y + b.y });
const unit = (point: RoutePoint): RoutePoint => {
  const length = Math.hypot(point.x, point.y);
  return length ? scale(point, 1 / length) : { x: 0, y: 0 };
};
const interpolate = (a: RoutePoint, b: RoutePoint, t: number): RoutePoint =>
  add(a, scale(subtract(b, a), t));

function distinctKnots(knots: readonly RoutePoint[], tangents: ReadonlyMap<number, RoutePoint>) {
  const points: RoutePoint[] = [];
  const directions = new Map<number, RoutePoint>();
  for (const [index, point] of knots.entries()) {
    const previous = points.at(-1);
    if (!previous || distance(previous, point) > 0) points.push(point);
    const direction = tangents.get(index);
    if (direction) directions.set(points.length - 1, unit(direction));
  }
  if (!points.length) throw new RangeError("A path needs at least one point");
  return { points, directions };
}

export function catmullRomPath(
  knots: readonly RoutePoint[],
  tangents: ReadonlyMap<number, RoutePoint> = new Map(),
): RoutePath {
  const { points, directions } = distinctKnots(knots, tangents);
  const segments: RouteSegment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const p1 = points[i]!,
      p2 = points[i + 1]!;
    const p0 = points[i - 1] ?? add(p1, subtract(p1, p2));
    const p3 = points[i + 2] ?? add(p2, subtract(p2, p1));
    const a = Math.sqrt(distance(p0, p1));
    const b = Math.sqrt(distance(p1, p2));
    const c = Math.sqrt(distance(p2, p3));
    const derivative = (
      before: RoutePoint,
      center: RoutePoint,
      after: RoutePoint,
      left: number,
      right: number,
    ) =>
      scale(
        add(
          subtract(
            scale(subtract(center, before), 1 / left),
            scale(subtract(after, before), 1 / (left + right)),
          ),
          scale(subtract(after, center), 1 / right),
        ),
        b,
      );
    const startDirection = directions.get(i),
      endDirection = directions.get(i + 1);
    const startDerivative = startDirection
      ? scale(startDirection, b * b)
      : derivative(p0, p1, p2, a, b);
    const endDerivative = endDirection ? scale(endDirection, b * b) : derivative(p1, p2, p3, b, c);
    segments.push({
      kind: "cubic",
      control1: add(p1, scale(startDerivative, 1 / 3)),
      control2: subtract(p2, scale(endDerivative, 1 / 3)),
      to: p2,
    });
  }
  return { start: points[0]!, segments };
}

export function bezierThroughPoints(
  knots: readonly RoutePoint[],
  tangents: ReadonlyMap<number, RoutePoint>,
  curvature: number,
): RoutePath {
  const { points, directions } = distinctKnots(knots, tangents);
  const tangentAt = (i: number): RoutePoint =>
    directions.get(i) ?? unit(subtract(points[i + 1] ?? points[i]!, points[i - 1] ?? points[i]!));
  return {
    start: points[0]!,
    segments: points.slice(1).map((to, i) => {
      const from = points[i]!,
        length = distance(from, to) * curvature;
      return {
        kind: "cubic",
        control1: add(from, scale(tangentAt(i), length)),
        control2: subtract(to, scale(tangentAt(i + 1), length)),
        to,
      };
    }),
  };
}

function segmentGeometry(start: RoutePoint, segment: RouteSegment) {
  if (segment.kind === "arc") {
    const arc = arcCenter(start, segment);
    if (arc)
      return {
        point: (t: number): RoutePoint => {
          if (t === 0) return start;
          if (t === 1) return segment.to;
          const angle = arc.theta + arc.delta * t;
          return {
            x: arc.center.x + arc.c * arc.rx * Math.cos(angle) - arc.s * arc.ry * Math.sin(angle),
            y: arc.center.y + arc.s * arc.rx * Math.cos(angle) + arc.c * arc.ry * Math.sin(angle),
          };
        },
        derivative: (t: number): RoutePoint => {
          const angle = arc.theta + arc.delta * t;
          return {
            x: arc.delta * (-arc.c * arc.rx * Math.sin(angle) - arc.s * arc.ry * Math.cos(angle)),
            y: arc.delta * (-arc.s * arc.rx * Math.sin(angle) + arc.c * arc.ry * Math.cos(angle)),
          };
        },
      };
  }
  const controls =
    segment.kind === "cubic"
      ? [start, segment.control1, segment.control2, segment.to]
      : segment.kind === "quadratic"
        ? [start, segment.control, segment.to]
        : [start, segment.to];
  function evaluate(points: readonly RoutePoint[], t: number): RoutePoint {
    let row = [...points];
    while (row.length > 1) row = row.slice(1).map((point, i) => interpolate(row[i]!, point, t));
    return row[0]!;
  }
  const derivatives = controls
    .slice(1)
    .map((point, i) => scale(subtract(point, controls[i]!), controls.length - 1));
  return {
    point: (t: number) => evaluate(controls, t),
    derivative: (t: number) => evaluate(derivatives, t),
  };
}

function endpointDirection(
  start: RoutePoint,
  segment: RouteSegment,
  at: "start" | "end",
): RoutePoint {
  const derivative = segmentGeometry(start, segment).derivative(at === "start" ? 0 : 1);
  if (Math.hypot(derivative.x, derivative.y)) return unit(derivative);
  const controls =
    segment.kind === "cubic"
      ? [start, segment.control1, segment.control2, segment.to]
      : segment.kind === "quadratic"
        ? [start, segment.control, segment.to]
        : [start, segment.to];
  const endpoint = at === "start" ? start : segment.to;
  for (const point of at === "start" ? controls : controls.toReversed()) {
    const direction = at === "start" ? subtract(point, endpoint) : subtract(endpoint, point);
    if (Math.hypot(direction.x, direction.y)) return unit(direction);
  }
  return { x: 0, y: 0 };
}

export function pathEndpointTangent(path: RoutePath, at: "start" | "end"): RoutePoint {
  const segments = path.segments.map((segment, i) => ({
    start: i ? path.segments[i - 1]!.to : path.start,
    segment,
  }));
  for (const { start, segment } of at === "start" ? segments : segments.toReversed()) {
    const direction = endpointDirection(start, segment, at);
    if (Math.hypot(direction.x, direction.y)) return direction;
  }
  return { x: 0, y: 0 };
}

function quadraticRoots(a: number, b: number, c: number): number[] {
  if (a === 0) return b === 0 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  if (discriminant === 0) return [-b / (2 * a)];
  const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
  return [q / a, c / q];
}

function extrema(start: RoutePoint, segment: RouteSegment, axis: "x" | "y"): number[] {
  const p0 = start[axis],
    p3 = segment.to[axis];
  if (segment.kind === "cubic") {
    const p1 = segment.control1[axis],
      p2 = segment.control2[axis];
    return quadraticRoots(-p0 + 3 * p1 - 3 * p2 + p3, 2 * (p0 - 2 * p1 + p2), p1 - p0).filter(
      (t) => t > 0 && t < 1,
    );
  }
  if (segment.kind === "quadratic") {
    const denominator = p0 - 2 * segment.control[axis] + p3;
    const t = denominator ? (p0 - segment.control[axis]) / denominator : -1;
    return t > 0 && t < 1 ? [t] : [];
  }
  if (segment.kind !== "arc") return [];
  const arc = arcCenter(start, segment);
  if (!arc) return [];
  const cosine = axis === "x" ? arc.c * arc.rx : arc.s * arc.rx;
  const sine = axis === "x" ? -arc.s * arc.ry : arc.c * arc.ry;
  const first = Math.atan2(sine, cosine);
  const low = Math.min(arc.theta, arc.theta + arc.delta),
    high = Math.max(arc.theta, arc.theta + arc.delta);
  const result: number[] = [];
  for (let k = Math.ceil((low - first) / Math.PI); first + k * Math.PI < high; k++) {
    const t = (first + k * Math.PI - arc.theta) / arc.delta;
    if (t > 0 && t < 1) result.push(t);
  }
  return result;
}

export function pathReverseTravel(
  path: RoutePath,
  axis: "x" | "y" | "both",
  start: RoutePoint,
  end: RoutePoint,
): number {
  let reverse = 0,
    from = path.start;
  const axes: readonly ("x" | "y")[] = axis === "both" ? ["x", "y"] : [axis];
  for (const segment of path.segments) {
    const geometry = segmentGeometry(from, segment);
    for (const coordinate of axes) {
      const orientation = Math.sign(end[coordinate] - start[coordinate]);
      const cuts = [0, ...extrema(from, segment, coordinate).sort((a, b) => a - b), 1];
      for (let i = 1; i < cuts.length; i++) {
        const change =
          geometry.point(cuts[i]!)[coordinate] - geometry.point(cuts[i - 1]!)[coordinate];
        reverse += orientation ? Math.max(0, -orientation * change) : Math.abs(change);
      }
    }
    from = segment.to;
  }
  return reverse;
}

function integrateSpeed(derivative: (t: number) => RoutePoint, end = 1): number {
  const speed = (t: number) => {
    const d = derivative(t);
    return Math.hypot(d.x, d.y);
  };
  function integrate(
    a: number,
    b: number,
    fa: number,
    fm: number,
    fb: number,
    estimate: number,
    tolerance: number,
    depth: number,
  ): number {
    const m = (a + b) / 2,
      leftMid = speed((a + m) / 2),
      rightMid = speed((m + b) / 2);
    const left = ((m - a) * (fa + 4 * leftMid + fm)) / 6;
    const right = ((b - m) * (fm + 4 * rightMid + fb)) / 6;
    if (depth === 0 || Math.abs(left + right - estimate) <= 15 * tolerance)
      return left + right + (left + right - estimate) / 15;
    return (
      integrate(a, m, fa, leftMid, fm, left, tolerance / 2, depth - 1) +
      integrate(m, b, fm, rightMid, fb, right, tolerance / 2, depth - 1)
    );
  }
  const fa = speed(0),
    fm = speed(end / 2),
    fb = speed(end),
    estimate = (end * (fa + 4 * fm + fb)) / 6;
  return integrate(0, end, fa, fm, fb, estimate, 1e-8 * Math.max(1, estimate), 20);
}

export function placeFollowingLabel(
  paths: readonly RoutePath[],
  size: { width: number; height: number },
  policy: { fraction?: number; offset?: number },
): { bounds: RouteBounds; anchor: RoutePoint; tangent: RoutePoint } {
  if (!paths.length) throw new RangeError("Label placement needs at least one path");
  const intervals = paths
    .flatMap((path) =>
      path.segments.map((segment, i) => {
        const start = i ? path.segments[i - 1]!.to : path.start;
        const geometry = segmentGeometry(start, segment);
        return { start, segment, geometry, length: integrateSpeed(geometry.derivative) };
      }),
    )
    .filter((interval) => interval.length > 0);
  let remaining =
    intervals.reduce((sum, interval) => sum + interval.length, 0) * (policy.fraction ?? 0.5);
  let anchor = paths[0]!.start,
    tangent: RoutePoint = { x: 0, y: 0 };
  for (const [index, interval] of intervals.entries()) {
    if (remaining > interval.length && index < intervals.length - 1) {
      remaining -= interval.length;
      continue;
    }
    let low = 0,
      high = 1;
    for (let i = 0; i < 36 && remaining > 0 && remaining < interval.length; i++) {
      const mid = (low + high) / 2;
      if (integrateSpeed(interval.geometry.derivative, mid) < remaining) low = mid;
      else high = mid;
    }
    const t = remaining <= 0 ? 0 : remaining >= interval.length ? 1 : (low + high) / 2;
    anchor = interval.geometry.point(t);
    tangent = unit(interval.geometry.derivative(t));
    if (!Math.hypot(tangent.x, tangent.y))
      tangent = endpointDirection(interval.start, interval.segment, t < 0.5 ? "start" : "end");
    break;
  }
  const offset = policy.offset ?? 0;
  anchor = { x: anchor.x - tangent.y * offset, y: anchor.y + tangent.x * offset };
  return {
    bounds: { x: anchor.x - size.width / 2, y: anchor.y - size.height / 2, ...size },
    anchor,
    tangent,
  };
}

function segmentSlice(
  start: RoutePoint,
  segment: RouteSegment,
  low: number,
  high: number,
): { start: RoutePoint; segment: RouteSegment } {
  const geometry = segmentGeometry(start, segment);
  if (low === 0 && high === 1) return { start, segment };
  if (segment.kind === "cubic") {
    const left = splitBezier(
      { start, control1: segment.control1, control2: segment.control2, end: segment.to },
      high,
    )[0];
    const part = low ? splitBezier(left, low / high)[1] : left;
    return {
      start: part.start,
      segment: { kind: "cubic", control1: part.control1, control2: part.control2, to: part.end },
    };
  }
  if (segment.kind === "quadratic") {
    const leftControl = interpolate(start, segment.control, high);
    const leftEnd = geometry.point(high);
    return {
      start: geometry.point(low),
      segment: {
        kind: "quadratic",
        control: interpolate(leftControl, leftEnd, low / high),
        to: leftEnd,
      },
    };
  }
  if (segment.kind === "arc") {
    const arc = arcCenter(start, segment);
    if (arc)
      return {
        start: geometry.point(low),
        segment: {
          ...segment,
          rx: arc.rx,
          ry: arc.ry,
          largeArc: Math.abs(arc.delta * (high - low)) > Math.PI,
          to: geometry.point(high),
        },
      };
  }
  return { start: geometry.point(low), segment: { kind: "line", to: geometry.point(high) } };
}

export function clipPathOutsideRect(path: RoutePath, rect: RouteBounds): RoutePath[] {
  const paths: RoutePath[] = [];
  let current: { start: RoutePoint; segments: RouteSegment[] } | undefined;
  let from = path.start;
  const inside = (point: RoutePoint) =>
    point.x > rect.x &&
    point.x < rect.x + rect.width &&
    point.y > rect.y &&
    point.y < rect.y + rect.height;
  for (const segment of path.segments) {
    const geometry = segmentGeometry(from, segment);
    const cuts = [0, 1];
    for (const axis of ["x", "y"] as const) {
      const monotone = [0, ...extrema(from, segment, axis).sort((a, b) => a - b), 1];
      for (const border of [rect[axis], rect[axis] + (axis === "x" ? rect.width : rect.height)]) {
        for (let i = 1; i < monotone.length; i++) {
          let low = monotone[i - 1]!,
            high = monotone[i]!;
          const a = geometry.point(low)[axis] - border,
            b = geometry.point(high)[axis] - border;
          if (a === 0) cuts.push(low);
          if (b === 0) cuts.push(high);
          if (a * b >= 0) continue;
          for (let iteration = 0; iteration < 48; iteration++) {
            const mid = (low + high) / 2,
              value = geometry.point(mid)[axis] - border;
            if (a < 0 === value < 0) low = mid;
            else high = mid;
          }
          cuts.push((low + high) / 2);
        }
      }
    }
    const sorted = cuts
      .sort((a, b) => a - b)
      .filter((t, i, values) => !i || t - values[i - 1]! > 1e-12);
    for (let i = 1; i < sorted.length; i++) {
      const low = sorted[i - 1]!,
        high = sorted[i]!;
      if (inside(geometry.point((low + high) / 2))) {
        current = undefined;
        continue;
      }
      const part = segmentSlice(from, segment, low, high);
      if (!current) {
        current = { start: part.start, segments: [] };
        paths.push(current);
      }
      current.segments.push(part.segment);
    }
    from = segment.to;
  }
  if (!path.segments.length && !inside(path.start)) return [path];
  return paths;
}
