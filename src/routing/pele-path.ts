import { curveFromTriples } from "../pele/curve";
import { distance } from "./path";
import type { RoutePath, RoutePoint } from "./types";

/** Use Pele's axis-aware S-curves and broad corners, including marker approaches. */
export function pelePath(
  knots: readonly RoutePoint[],
  startDirection: RoutePoint,
  endDirection: RoutePoint,
): RoutePath {
  const points = knots.filter((point, i) => !i || distance(point, knots[i - 1]!) > 1e-8);
  if (points.length < 2) return { start: knots[0]!, segments: [] };
  const triples = points.flatMap((point, i) => {
    const before = points[i - 1] ?? point;
    const direction =
      i === 0
        ? startDirection
        : i === points.length - 1
          ? endDirection
          : {
              x: point.x - before.x,
              y: point.y - before.y,
            };
    return [point.x, point.y, Math.abs(direction.y) >= Math.abs(direction.x) ? 0 : 1];
  });
  return curveFromTriples(triples, 6, 13);
}

/** Preserve straight runs while reducing broad turns to fit a narrow corridor. */
export function peleCornerKnots(points: readonly RoutePoint[], reach: number): RoutePoint[] {
  const result = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!,
      to = points[i]!;
    const length = distance(from, to);
    if (length > reach * 2 && (from.x === to.x || from.y === to.y)) {
      for (const fraction of [reach / length, 1 - reach / length])
        result.push({
          x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction,
        });
    }
    result.push(to);
  }
  return result;
}
