import type { RouteBounds, RoutePath, RoutePoint, RouteSegment } from "./types";

export const distance = (a: RoutePoint, b: RoutePoint): number => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: RoutePoint, b: RoutePoint, t: number): RoutePoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export function pathFromPoints(points: readonly RoutePoint[]): RoutePath {
  if (!points.length) throw new RangeError("A path needs at least one point");
  return {
    start: { ...points[0]! },
    segments: points.slice(1).map((to) => ({ kind: "line", to: { ...to } })),
  };
}
function pointLineDistance(p: RoutePoint, a: RoutePoint, b: RoutePoint): number {
  const squared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = squared
    ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / squared))
    : 0;
  return distance(p, lerp(a, b, t));
}
type Arc = Extract<RouteSegment, { kind: "arc" }>;
/** SVG endpoint-to-center conversion, including SVG's radius correction. */
function arcCenter(start: RoutePoint, arc: Arc) {
  let rx = Math.abs(arc.rx),
    ry = Math.abs(arc.ry);
  if (!rx || !ry || distance(start, arc.to) === 0) return undefined;
  const phi = (arc.rotation * Math.PI) / 180,
    c = Math.cos(phi),
    s = Math.sin(phi);
  const dx = (start.x - arc.to.x) / 2,
    dy = (start.y - arc.to.y) / 2;
  const x = c * dx + s * dy,
    y = -s * dx + c * dy;
  const scale = Math.sqrt(Math.max(1, (x * x) / (rx * rx) + (y * y) / (ry * ry)));
  rx *= scale;
  ry *= scale;
  const factor =
    (arc.largeArc === arc.sweep ? -1 : 1) *
    Math.sqrt(
      Math.max(
        0,
        (rx * rx * ry * ry - rx * rx * y * y - ry * ry * x * x) /
          (rx * rx * y * y + ry * ry * x * x),
      ),
    );
  const cx = (factor * rx * y) / ry,
    cy = (-factor * ry * x) / rx;
  const center = {
    x: c * cx - s * cy + (start.x + arc.to.x) / 2,
    y: s * cx + c * cy + (start.y + arc.to.y) / 2,
  };
  const theta = Math.atan2((y - cy) / ry, (x - cx) / rx);
  let delta = Math.atan2((-y - cy) / ry, (-x - cx) / rx) - theta;
  if (arc.sweep && delta < 0) delta += 2 * Math.PI;
  if (!arc.sweep && delta > 0) delta -= 2 * Math.PI;
  return { rx, ry, c, s, center, theta, delta };
}
export interface FlattenPathOptions {
  readonly tolerance?: number;
  readonly maxSegments?: number;
}
/** Adaptive, bounded-error polyline approximation. Throws rather than silently exceeding tolerance. */
export function flattenPath(path: RoutePath, options: FlattenPathOptions = {}): RoutePoint[] {
  const tolerance = options.tolerance ?? 0.5,
    max = options.maxSegments ?? 65536;
  if (!(tolerance > 0 && Number.isFinite(tolerance)) || !Number.isInteger(max) || max < 1)
    throw new RangeError("Invalid flattening tolerance or segment budget");
  const points: RoutePoint[] = [{ ...path.start }];
  const add = (point: RoutePoint) => {
    if (points.length > max) throw new RangeError("Path flattening exceeded maxSegments");
    points.push({ ...point });
  };
  function bezier(controls: readonly RoutePoint[], depth = 0) {
    const first = controls[0]!,
      last = controls.at(-1)!;
    if (controls.slice(1, -1).every((p) => pointLineDistance(p, first, last) <= tolerance)) {
      add(last);
      return;
    }
    if (depth >= 32) throw new RangeError("Cannot flatten path at requested tolerance");
    const left = [first],
      right = [last];
    let row = [...controls];
    while (row.length > 1) {
      row = row.slice(1).map((p, i) => lerp(row[i]!, p, 0.5));
      left.push(row[0]!);
      right.unshift(row.at(-1)!);
    }
    bezier(left, depth + 1);
    bezier(right, depth + 1);
  }
  let from = path.start;
  for (const segment of path.segments) {
    if (segment.kind === "line") add(segment.to);
    else if (segment.kind === "quadratic") bezier([from, segment.control, segment.to]);
    else if (segment.kind === "cubic")
      bezier([from, segment.control1, segment.control2, segment.to]);
    else {
      const arc = arcCenter(from, segment);
      if (!arc) add(segment.to);
      else {
        const step = Math.min(
          Math.PI / 2,
          2 * Math.acos(Math.max(-1, 1 - tolerance / Math.max(arc.rx, arc.ry))),
        );
        const count = Math.max(1, Math.ceil(Math.abs(arc.delta) / step));
        if (!Number.isFinite(count) || points.length + count > max + 1)
          throw new RangeError("Path flattening exceeded maxSegments");
        for (let i = 1; i < count; i++) {
          const t = arc.theta + (arc.delta * i) / count;
          add({
            x: arc.center.x + arc.c * arc.rx * Math.cos(t) - arc.s * arc.ry * Math.sin(t),
            y: arc.center.y + arc.s * arc.rx * Math.cos(t) + arc.c * arc.ry * Math.sin(t),
          });
        }
        add(segment.to);
      }
    }
    from = segment.to;
  }
  return points;
}
/** Conservative bounds: control hulls and full ellipse envelopes contain every curve. */
export function getPathBounds(path: RoutePath): RouteBounds {
  const points: RoutePoint[] = [path.start];
  let from = path.start;
  for (const segment of path.segments) {
    points.push(segment.to);
    if (segment.kind === "quadratic") points.push(segment.control);
    if (segment.kind === "cubic") points.push(segment.control1, segment.control2);
    if (segment.kind === "arc") {
      const arc = arcCenter(from, segment);
      if (arc) {
        const dx = Math.hypot(arc.rx * arc.c, arc.ry * arc.s),
          dy = Math.hypot(arc.rx * arc.s, arc.ry * arc.c);
        points.push(
          { x: arc.center.x - dx, y: arc.center.y - dy },
          { x: arc.center.x + dx, y: arc.center.y + dy },
        );
      }
    }
    from = segment.to;
  }
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
export function getPathLength(path: RoutePath, options?: FlattenPathOptions): number {
  const points = flattenPath(path, options);
  return points.reduce((sum, p, i) => sum + (i ? distance(points[i - 1]!, p) : 0), 0);
}
function locate(path: RoutePath, length: number, options?: FlattenPathOptions) {
  const points = flattenPath(path, options);
  let remaining = Math.max(0, length);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!,
      size = distance(a, b);
    if (size && (remaining <= size || i === points.length - 1))
      return { a, b, t: Math.min(1, remaining / size) };
    remaining -= size;
  }
  return { a: points.at(-1)!, b: points.at(-1)!, t: 0 };
}
export function getPointAtLength(
  path: RoutePath,
  length: number,
  options?: FlattenPathOptions,
): RoutePoint {
  const { a, b, t } = locate(path, length, options);
  return lerp(a, b, t);
}
export function getTangentAtLength(
  path: RoutePath,
  length: number,
  options?: FlattenPathOptions,
): RoutePoint {
  const { a, b } = locate(path, length, options),
    d = distance(a, b);
  return d ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : { x: 0, y: 0 };
}
/** Round line-to-line corners only; existing curves and path endpoints are retained. */
export function roundCorners(path: RoutePath, options: { readonly radius: number }): RoutePath {
  const radius = options.radius;
  if (!Number.isFinite(radius) || radius < 0)
    throw new RangeError("radius must be non-negative and finite");
  if (!radius) return path;
  const result: RouteSegment[] = [];
  let previous = path.start;
  for (let i = 0; i < path.segments.length; i++) {
    const segment = path.segments[i]!,
      next = path.segments[i + 1];
    const corner = segment.to;
    if (segment.kind === "line" && next?.kind === "line") {
      const l1 = distance(previous, corner),
        l2 = distance(corner, next.to);
      if (l1 > 0 && l2 > 0) {
        const u = { x: (corner.x - previous.x) / l1, y: (corner.y - previous.y) / l1 },
          v = { x: (next.to.x - corner.x) / l2, y: (next.to.y - corner.y) / l2 };
        const angle = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)));
        if (angle > 1e-8 && angle < Math.PI - 1e-8) {
          const tangent = Math.tan(angle / 2),
            trim = Math.min(radius * tangent, l1 / 2, l2 / 2),
            r = trim / tangent;
          result.push(
            { kind: "line", to: { x: corner.x - u.x * trim, y: corner.y - u.y * trim } },
            {
              kind: "arc",
              rx: r,
              ry: r,
              rotation: 0,
              largeArc: false,
              sweep: u.x * v.y - u.y * v.x > 0,
              to: { x: corner.x + v.x * trim, y: corner.y + v.y * trim },
            },
          );
          previous = corner;
          continue;
        }
      }
    }
    result.push(segment);
    previous = corner;
  }
  return { start: path.start, segments: result };
}
export function toSvgPath(
  path: RoutePath,
  options: { readonly radius?: number; readonly precision?: number } = {},
): string {
  const shaped = options.radius ? roundCorners(path, { radius: options.radius }) : path;
  const precision = options.precision ?? 6;
  if (!Number.isInteger(precision) || precision < 0 || precision > 15)
    throw new RangeError("precision must be an integer from 0 to 15");
  const n = (value: number) => {
    if (!Number.isFinite(value)) throw new RangeError("Path coordinates must be finite");
    return String(Number(value.toFixed(precision)));
  };
  const p = (point: RoutePoint) => `${n(point.x)} ${n(point.y)}`;
  return [
    `M ${p(shaped.start)}`,
    ...shaped.segments.map((s) => {
      switch (s.kind) {
        case "line":
          return `L ${p(s.to)}`;
        case "quadratic":
          return `Q ${p(s.control)} ${p(s.to)}`;
        case "cubic":
          return `C ${p(s.control1)} ${p(s.control2)} ${p(s.to)}`;
        case "arc":
          return `A ${n(Math.abs(s.rx))} ${n(Math.abs(s.ry))} ${n(s.rotation)} ${Number(s.largeArc)} ${Number(s.sweep)} ${p(s.to)}`;
      }
    }),
  ].join(" ");
}
