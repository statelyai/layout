import type { Graph, Point, VisualGraph, VisualNode } from "@statelyai/graph";
import { getNodeSize, type LayoutOptions } from "@statelyai/graph/layout";
import { getPolylineMidpoint, placePorts } from "./layered/strategies";
import type { LayoutAlgorithm } from "./types";

export interface FixedLayoutOptions extends Pick<LayoutOptions, "direction" | "measure"> {}

function defaultRoute(source: VisualNode, target: VisualNode): Point[] {
  return [
    {
      x: source.x + source.width / 2,
      y: source.y + source.height / 2,
    },
    {
      x: target.x + target.width / 2,
      y: target.y + target.height / 2,
    },
  ];
}

/** Preserve authored positions and routes while completing visual geometry. */
export function getFixedLayout<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: FixedLayoutOptions = {},
): VisualGraph<N, E, G, P> {
  const direction = options.direction ?? graph.direction ?? "down";
  const nodes = graph.nodes.map((node): VisualNode<N, P> => {
    const size = getNodeSize(node, options);
    const rect = {
      x: node.x ?? 0,
      y: node.y ?? 0,
      ...size,
    };
    const ports = placePorts(node.ports, rect, direction);
    return {
      ...node,
      ...rect,
      ...(ports === undefined ? {} : { ports }),
    } as VisualNode<N, P>;
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = graph.edges.map((edge) => {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    const points = edge.points
      ? [...edge.points]
      : source && target
        ? defaultRoute(source, target)
        : [];
    const midpoint = getPolylineMidpoint(points);
    const width = edge.width ?? 0;
    const height = edge.height ?? 0;
    return {
      ...edge,
      x: edge.x ?? midpoint.x - width / 2,
      y: edge.y ?? midpoint.y - height / 2,
      width,
      height,
      points,
      routing: edge.routing ?? ("polyline" as const),
    };
  });

  return { ...graph, direction, nodes, edges };
}

export const fixedAlgorithm: LayoutAlgorithm<FixedLayoutOptions> = {
  id: "fixed",
  capabilities: {
    full: true,
    incremental: false,
    partial: false,
    routeOnly: false,
    hierarchy: true,
    ports: true,
  },
  layout(graph, options) {
    return getFixedLayout(graph, options ?? {});
  },
};
