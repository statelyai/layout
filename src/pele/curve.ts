import { LayoutError } from "../errors";
import type { RoutePath, RouteSegment } from "../routing/types";
import { routePath } from "./upstream-path";

/** Keep upstream's axis triples, including turns between differently directed groups. */
export function curveFromTriples(triples: number[], startReach = 0, endReach = 13): RoutePath {
  if (triples.length < 6 || !triples.every(Number.isFinite))
    throw new LayoutError("Missing compound Pele route", "INVALID_GEOMETRY");
  const tokens = routePath(triples, undefined, 0, 0, startReach, endReach, true).tokens!;
  const segments: RouteSegment[] = [];
  for (let i = 4; i < tokens.length;) {
    if (tokens[i] === 76)
      segments.push({ kind: "line", to: { x: tokens[i + 2]!, y: tokens[i + 3]! } });
    else if (tokens[i] === 67)
      segments.push({
        kind: "cubic",
        control1: { x: tokens[i + 2]!, y: tokens[i + 3]! },
        control2: { x: tokens[i + 4]!, y: tokens[i + 5]! },
        to: { x: tokens[i + 6]!, y: tokens[i + 7]! },
      });
    else throw new LayoutError("Unexpected Pele curve command", "INVALID_GEOMETRY");
    i += tokens[i + 1]! + 2;
  }
  return { start: { x: tokens[2]!, y: tokens[3]! }, segments };
}
