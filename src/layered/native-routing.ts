import type { VisualGraph } from "@statelyai/graph";
import type { LayeredLayoutOptions } from "./types";
import { routeCrosses } from "../authoring/routing";
import { orthogonalRouting, routeToPolylines } from "../routing";
import { recordRouteGeometry } from "../routing/layout-cache";

/** Keep valid layered tracks; repair infeasible port leads and obstacle crossings. */
export function repairFlatRouting<N, E, G, P>(
  graph: VisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
): VisualGraph<N, E, G, P> {
  if (
    graph.nodes.some((n) => n.parentId != null) ||
    options.settings?.noLayout ||
    (options.settings?.edgeRouting ?? "ORTHOGONAL") !== "ORTHOGONAL" ||
    options.strategies?.routeEdges
  )
    return graph;
  if (!graph.edges.some((edge) => graph.nodes.some((node) => routeCrosses(edge.points, node))))
    return graph;
  const edges = graph.edges.map((edge) => ({ ...edge }));
  const overlaps = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  // The original track may put an exterior label partly inside a node. Move
  // only colliding labels before routing their actual boundary connections.
  for (const edge of edges.filter((e) => e.width > 0 && e.height > 0)) {
    const obstacles = [
      ...graph.nodes.map((n) => ({
        x: n.x - 8,
        y: n.y - 8,
        width: n.width + 16,
        height: n.height + 16,
      })),
      ...edges.filter((e) => e.id !== edge.id && e.width > 0 && e.height > 0),
    ];
    if (!obstacles.some((rect) => overlaps(edge, rect))) continue;
    const xs = [edge.x, ...obstacles.flatMap((r) => [r.x - edge.width - 8, r.x + r.width + 8])];
    const ys = [edge.y, ...obstacles.flatMap((r) => [r.y - edge.height - 8, r.y + r.height + 8])];
    let best: { x: number; y: number; distance: number } | undefined;
    for (const x of xs)
      for (const y of ys) {
        const distance = Math.abs(x - edge.x) + Math.abs(y - edge.y);
        if (best && distance >= best.distance) continue;
        if (!obstacles.some((rect) => overlaps({ ...edge, x, y }, rect))) best = { x, y, distance };
      }
    if (best) {
      edge.x = best.x;
      edge.y = best.y;
    }
  }
  const snapshot = orthogonalRouting.route(
    { ...graph, edges },
    { coordinateSpace: "world", maxSearchNodes: 40000 },
  );
  const result = {
    ...graph,
    edges: edges.map((edge) => ({
      ...edge,
      points: routeToPolylines(snapshot.routes.get(edge.id)!).flatMap((points) =>
        points.map((p) => ({ ...p })),
      ),
    })),
    compoundRoutes: snapshot.routes,
  };
  recordRouteGeometry(result, snapshot.routes);
  return result;
}
