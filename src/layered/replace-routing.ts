import { worldGeometry } from "../authoring/coordinates";
import { routeToPolylines } from "../routing/adapters";
import { recordRouteGeometry } from "../routing/layout-cache";
import type { CompoundVisualGraph } from "./compound";
import type { LayeredLayoutOptions } from "./types";

/** Run a replacement on finalized geometry, with no initial route hints. */
export function replaceLayoutRouting<N, E, G, P>(
  graph: CompoundVisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
): CompoundVisualGraph<N, E, G, P> {
  if (!options.routing) return graph;
  const { compoundRoutes: _routes, compoundGeometry: _geometry, ...geometry } = graph;
  const world = worldGeometry(geometry);
  const input = {
    ...geometry,
    nodes: world.nodes.map((n) => ({ ...n, ports: n.ports?.map((p) => ({ ...p })) })),
    edges: world.edges.map(({ points: _points, routing: _routing, ...e }) => e),
  };
  const snapshot = options.routing.strategy.route(input, {
    ...options.routing.settings,
    coordinateSpace: "world",
  });
  if (snapshot instanceof Promise)
    throw new TypeError(
      "Layered route replacement must be synchronous; run async routing separately",
    );
  if (
    snapshot.routes.size !== graph.edges.length ||
    graph.edges.some((e) => !snapshot.routes.has(e.id))
  )
    throw new Error("Replacement router must return exactly one route for every edge");
  const result = {
    ...graph,
    edgeCoordinateSpace: "world" as const,
    edges: graph.edges.map((edge) => ({
      ...edge,
      points: routeToPolylines(snapshot.routes.get(edge.id)!).flat(),
      routing: "polyline" as const,
    })),
    compoundRoutes: snapshot.routes,
  };
  recordRouteGeometry(result, result.compoundRoutes);
  return result;
}
