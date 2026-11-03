import { pathFromPoints } from "./path";
import { simplify } from "./search";
import type { RouteGeometry, RoutePath, RoutePoint } from "./types";

export function retargetLinePath(
  path: RoutePath,
  start: RoutePoint,
  end: RoutePoint,
  geometry: RouteGeometry,
): RoutePath | undefined {
  if (!path.segments.length || path.segments.some((segment) => segment.kind !== "line")) return;
  const old = [path.start, ...path.segments.map((segment) => segment.to)];
  if (geometry === "straight") return pathFromPoints([start, end]);
  const points = old.map((point) => ({ ...point }));
  points[0] = start;
  points[points.length - 1] = end;
  if (geometry === "orthogonal") {
    if (points.length === 2) {
      const horizontal = Math.abs(old[0]!.y - old[1]!.y) < 1e-7;
      if (horizontal) {
        const x = (old[0]!.x + old[1]!.x) / 2;
        points.splice(1, 0, { x, y: start.y }, { x, y: end.y });
      } else {
        const y = (old[0]!.y + old[1]!.y) / 2;
        points.splice(1, 0, { x: start.x, y }, { x: end.x, y });
      }
    } else {
      const first = points[1]!,
        last = points[points.length - 2]!;
      if (Math.abs(old[0]!.y - old[1]!.y) < 1e-7) first.y = start.y;
      else first.x = start.x;
      if (Math.abs(old.at(-1)!.y - old.at(-2)!.y) < 1e-7) last.y = end.y;
      else last.x = end.x;
    }
  }
  return pathFromPoints(simplify(points));
}
