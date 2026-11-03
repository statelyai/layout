import type { VisualGraph } from "@statelyai/graph";
import type { Route, RoutingGraph, RoutingSnapshot } from "./types";

const geometryByRoutes = new WeakMap<ReadonlyMap<string, Route>, string>();
export interface LayoutRouting {
  /** Resolved world geometry, including layout-owned header barriers and port constraints. */
  readonly graph: RoutingGraph;
  readonly snapshot: RoutingSnapshot;
}
const routingByGraph = new WeakMap<VisualGraph, LayoutRouting & { readonly key: string }>();
const routingByRoutes = new WeakMap<
  ReadonlyMap<string, Route>,
  LayoutRouting & { readonly key: string }
>();

/** Compare only geometry and topology; application data may contain cycles. */
function geometryKey(graph: VisualGraph): string {
  return JSON.stringify({
    id: graph.id,
    direction: graph.direction,
    edgeCoordinateSpace: "edgeCoordinateSpace" in graph ? graph.edgeCoordinateSpace : undefined,
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

export function recordLayoutRouting(
  graph: VisualGraph & { readonly compoundRoutes?: ReadonlyMap<string, Route> },
  input: RoutingGraph,
  snapshot: RoutingSnapshot,
): void {
  const cached = {
    key: geometryKey(graph),
    snapshot,
    graph: {
      ...input,
      nodes: input.nodes.map((node) => ({
        ...node,
        ports: node.ports?.map((port) => ({ ...port })),
      })),
      edges: input.edges.map((edge) => ({ ...edge })),
    },
  };
  routingByGraph.set(graph, cached);
  routingByRoutes.set(graph.compoundRoutes ?? snapshot.routes, cached);
}

/** Read once at layout handoff; edits invalidate the cached snapshot. */
export function getLayoutRouting(
  graph: VisualGraph & { readonly compoundRoutes?: ReadonlyMap<string, Route> },
): LayoutRouting | undefined {
  const cached =
    routingByGraph.get(graph) ??
    (graph.compoundRoutes && routingByRoutes.get(graph.compoundRoutes));
  if (!cached || cached.key !== geometryKey(graph)) return undefined;
  return { graph: cached.graph, snapshot: cached.snapshot };
}
