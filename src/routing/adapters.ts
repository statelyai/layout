import type { GraphPatch, Point, VisualGraph } from "@statelyai/graph";
import { hasCurrentRouteGeometry } from "./layout-cache";
import { worldGeometry } from "../authoring/coordinates";
import { freeze } from "./model";
import { flattenPath, pathFromPoints } from "./path";
import { PersistentMap } from "./persistent";
import type { Route, RoutePath, RoutePoint, RouteSegment } from "./types";

/** ELK/native spline output: start, then repeating control1/control2/end triples. */
export function pathFromSplinePoints(points: readonly RoutePoint[]): RoutePath {
  if (points.length < 4 || (points.length - 1) % 3 !== 0)
    throw new RangeError("Cubic spline points require a start and control1/control2/end triples");
  const segments: RouteSegment[] = [];
  for (let i = 1; i < points.length; i += 3)
    segments.push({
      kind: "cubic",
      control1: { ...points[i]! },
      control2: { ...points[i + 1]! },
      to: { ...points[i + 2]! },
    });
  return { start: { ...points[0]! }, segments };
}
/** Normalize routes from any native layout algorithm, without running layout again. */
export function getLayoutRoutes(graph: VisualGraph): ReadonlyMap<string, Route> {
  const compound = graph as VisualGraph & { compoundRoutes?: ReadonlyMap<string, Route> };
  if (compound.compoundRoutes?.size && hasCurrentRouteGeometry(graph, compound.compoundRoutes))
    return compound.compoundRoutes;
  const world = worldGeometry(graph),
    nodes = new Map(world.nodes.map((n) => [n.id, n]));
  let result = new PersistentMap<Route>();
  for (const edge of world.edges) {
    const points = edge.points;
    let path: RoutePath | undefined;
    if (points?.length && points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
      if (edge.routing === "splines") {
        if (points.length >= 4 && (points.length - 1) % 3 === 0)
          path = pathFromSplinePoints(points);
      } else path = pathFromPoints(points);
    }
    const routed = path !== undefined;
    if (!path) {
      const a = nodes.get(edge.sourceId),
        b = nodes.get(edge.targetId);
      path = pathFromPoints([
        { x: a ? a.x + a.width : 0, y: a ? a.y + a.height / 2 : 0 },
        { x: b?.x ?? 40, y: b ? b.y + b.height / 2 : 40 },
      ]);
    }
    result = result.set(
      edge.id,
      freeze({
        edgeId: edge.id,
        status: routed ? "routed" : "fallback",
        diagnostics: routed
          ? []
          : [
              {
                code: "MISSING_GEOMETRY",
                edgeId: edge.id,
                message: "Layout has no valid route; rendered a fallback connection",
              },
            ],
        sections: [
          {
            id: `${edge.id}:0`,
            from: {
              kind: "node",
              nodeId: edge.sourceId,
              ...(edge.sourcePort === undefined ? {} : { port: edge.sourcePort }),
            },
            to: {
              kind: "node",
              nodeId: edge.targetId,
              ...(edge.targetPort === undefined ? {} : { port: edge.targetPort }),
            },
            path,
          },
        ],
      }),
    );
  }
  return result;
}
/** One polyline per section preserves label gaps and branching for simple renderers. */
export function routeToPolylines(
  route: Route,
  options?: { readonly tolerance?: number },
): readonly (readonly RoutePoint[])[] {
  return route.sections.map((s) => flattenPath(s.path, options));
}
/**
 * One point list for consumers of `GraphEdge.points`. Sections are joined
 * through their gaps (an edge label, for example); between orthogonal
 * sections the join is orthogonal too, so it never adds a diagonal.
 */
export function routeToPoints(
  route: Route,
  options?: { readonly tolerance?: number },
): RoutePoint[] {
  const points: RoutePoint[] = [];
  const axis = (a: RoutePoint, b: RoutePoint) =>
    Math.abs(a.y - b.y) < 1e-9 ? "horizontal" : Math.abs(a.x - b.x) < 1e-9 ? "vertical" : undefined;
  for (const polyline of routeToPolylines(route, options)) {
    const a = points.at(-1),
      b = polyline[0];
    if (a && b && axis(a, b) === undefined) {
      const before = points.length > 1 ? axis(points.at(-2)!, a) : undefined;
      const after = polyline.length > 1 ? axis(b, polyline[1]!) : undefined;
      if (before && after) {
        if (before === "horizontal" && after === "horizontal") {
          const x = (a.x + b.x) / 2;
          points.push({ x, y: a.y }, { x, y: b.y });
        } else if (before === "vertical" && after === "vertical") {
          const y = (a.y + b.y) / 2;
          points.push({ x: a.x, y }, { x: b.x, y });
        } else points.push(before === "horizontal" ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
      }
    }
    points.push(...polyline.map((point) => ({ ...point })));
  }
  return points;
}
/** Compatibility for single-section native consumers. Refuses to erase gaps or topology. */
export function routeToGraphPatch(
  route: Route,
  options: { readonly tolerance?: number; readonly offset?: RoutePoint } = {},
): GraphPatch {
  if (
    route.sections.length !== 1 ||
    route.sections[0]!.sharedId ||
    route.sections[0]!.from.kind !== "node" ||
    route.sections[0]!.to.kind !== "node"
  )
    throw new Error(
      "This route requires section-aware rendering; a single GraphEdge.points array would lose topology",
    );
  const offset = options.offset ?? { x: 0, y: 0 };
  const points: Point[] = flattenPath(route.sections[0]!.path, options).map((p) => ({
    x: p.x - offset.x,
    y: p.y - offset.y,
  }));
  return { op: "updateEdge", id: route.edgeId, data: { points, routing: "polyline" } };
}
