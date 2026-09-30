import { flattenPath } from "./path";
import { segmentBounds } from "./search";
import { inflate } from "./spatial";
import type { Settings } from "./model";
import type { Route, RouteBounds, RoutePoint, RoutePath } from "./types";

export interface Reservation {
  readonly a: RoutePoint;
  readonly b: RoutePoint;
  readonly sharedId?: string;
}
export function reservations(route: Route): Reservation[] {
  return route.sections.flatMap((section) =>
    pathReservations(section.path).map((segment) => ({ ...segment, sharedId: section.sharedId })),
  );
}
export function pathReservations(path: RoutePath): Reservation[] {
  const points = flattenPath(path, { tolerance: 0.5 });
  return points.slice(1).map((b, i) => ({ a: points[i]!, b }));
}
export function reservationBounds(segment: Reservation, spacing: number): RouteBounds {
  return inflate(segmentBounds(segment.a, segment.b), Math.max(1, spacing));
}
/** Finite penalties: a crossing is preferable to an arbitrarily long detour. */
export function conflictCost(
  a: RoutePoint,
  b: RoutePoint,
  other: Reservation,
  config: Settings,
): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const ex = other.b.x - other.a.x,
    ey = other.b.y - other.a.y;
  const length = Math.hypot(dx, dy),
    otherLength = Math.hypot(ex, ey);
  if (length < 1e-8 || otherLength < 1e-8) return 0;
  const cross = dx * ey - dy * ex;
  const ox = other.a.x - a.x,
    oy = other.a.y - a.y;
  if (Math.abs(cross) > 1e-8 * length * otherLength) {
    const t = (ox * ey - oy * ex) / cross;
    const u = (ox * dy - oy * dx) / cross;
    if (t < -1e-8 || t > 1 + 1e-8 || u < -1e-8 || u > 1 + 1e-8) return 0;
    // Half-cost at vertices keeps subdivision from making crossings free.
    return (
      config.crossingPenalty *
      (t < 1e-8 || t > 1 - 1e-8 ? 0.5 : 1) *
      (u < 1e-8 || u > 1 - 1e-8 ? 0.5 : 1)
    );
  }
  const separation = Math.abs(ox * dy - oy * dx) / length;
  const spacing = Math.max(1e-8, config.edgeSpacing);
  if (separation >= spacing) return 0;
  const lo = (ox * dx + oy * dy) / length;
  const hi = lo + (ex * dx + ey * dy) / length;
  const overlap = Math.max(0, Math.min(length, Math.max(lo, hi)) - Math.max(0, Math.min(lo, hi)));
  return config.overlapPenalty * overlap * (1 - separation / spacing);
}

/** Remove only the common terminal's attachment region from soft reservations. */
export function outsideTerminal(segment: Reservation, rect: RouteBounds): Reservation[] {
  let lo = 0,
    hi = 1;
  const dx = segment.b.x - segment.a.x,
    dy = segment.b.y - segment.a.y;
  for (const [start, delta, min, max] of [
    [segment.a.x, dx, rect.x, rect.x + rect.width],
    [segment.a.y, dy, rect.y, rect.y + rect.height],
  ] as const) {
    if (Math.abs(delta) < 1e-8) {
      if (start < min || start > max) return [segment];
    } else {
      const a = (min - start) / delta,
        b = (max - start) / delta;
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
    }
  }
  if (lo > hi) return [segment];
  const at = (t: number) => ({ x: segment.a.x + dx * t, y: segment.a.y + dy * t });
  return [
    ...(lo > 1e-8 ? [{ ...segment, b: at(lo) }] : []),
    ...(hi < 1 - 1e-8 ? [{ ...segment, a: at(hi) }] : []),
  ];
}
