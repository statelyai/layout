import type { VisualGraph } from "@statelyai/graph";
import type { Route } from "./types";

const geometryByRoutes = new WeakMap<ReadonlyMap<string, Route>, string>();

/** Compare only geometry and topology; application data may contain cycles. */
function geometryKey(graph: VisualGraph): string {
  return JSON.stringify({
    nodes: graph.nodes.map(({ id, parentId, x, y, width, height, ports }) => ({
      id,
      parentId,
      x,
      y,
      width,
      height,
      ports: ports?.map(({ name, x, y, width, height }) => ({
        name,
        x,
        y,
        width,
        height,
      })),
    })),
    edges: graph.edges.map(
      ({
        id,
        sourceId,
        targetId,
        sourcePort,
        targetPort,
        x,
        y,
        width,
        height,
        points,
        routing,
      }) => ({
        id,
        sourceId,
        targetId,
        sourcePort,
        targetPort,
        x,
        y,
        width,
        height,
        points,
        routing,
      }),
    ),
  });
}

/** Associate structured sections with the geometry that produced them. */
export function recordRouteGeometry(graph: VisualGraph, routes: ReadonlyMap<string, Route>): void {
  geometryByRoutes.set(routes, geometryKey(graph));
}

/** Graph edits invalidate cached sections, including edits made by external consumers. */
export function hasCurrentRouteGeometry(
  graph: VisualGraph,
  routes: ReadonlyMap<string, Route>,
): boolean {
  return geometryByRoutes.get(routes) === geometryKey(graph);
}
