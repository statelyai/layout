import type { Graph, Point, VisualGraph, VisualNode } from "@statelyai/graph";
import type { LayoutOptions } from "@statelyai/graph/layout";
import { LayoutError, UnsupportedLayoutError } from "../errors";
import { getFixedLayout } from "../fixed";
import type { LayoutPadding } from "../layered";
import { setElkjs0111ResultPolicy } from "./elkjs-compatibility";
import type { LayoutCapabilities } from "../types";

export interface GraphProviderOptions extends Pick<LayoutOptions, "measure"> {
  padding?: number | Partial<LayoutPadding>;
  spacing?: number;
}

export const graphProviderCapabilities: LayoutCapabilities = {
  full: true,
  incremental: false,
  partial: false,
  routeOnly: false,
  hierarchy: false,
  ports: false,
};

export function nonnegative(value: number | undefined, fallback: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < 0) {
    throw new LayoutError(`${name} must be a finite nonnegative number`, "INVALID_OPTIONS");
  }
  return result;
}

export function providerGraph<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: GraphProviderOptions,
): VisualGraph<N, E, G, P> {
  if (graph.nodes.some((node) => node.parentId != null)) {
    throw new UnsupportedLayoutError("This graph provider supports flat graphs only");
  }
  if (
    graph.nodes.some((node) => node.ports?.length) ||
    graph.edges.some((edge) => edge.sourcePort || edge.targetPort)
  ) {
    throw new UnsupportedLayoutError("This graph provider does not support explicit ports");
  }
  const result = getFixedLayout(graph, options);
  for (const node of result.nodes) {
    nonnegative(node.width, 0, "Node width");
    nonnegative(node.height, 0, "Node height");
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y))
      throw new LayoutError("Node positions must be finite", "INVALID_GRAPH");
  }
  for (const edge of result.edges) {
    nonnegative(edge.width, 0, "Edge label width");
    nonnegative(edge.height, 0, "Edge label height");
  }
  const ids = new Set(result.nodes.map((node) => node.id));
  if (result.edges.some((edge) => !ids.has(edge.sourceId) || !ids.has(edge.targetId))) {
    throw new LayoutError("Edge endpoint not found", "INVALID_GRAPH");
  }
  return result;
}

export function adjacency(graph: VisualGraph): Map<string, string[]> {
  const neighbors = new Map<string, string[]>(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    neighbors.get(edge.sourceId)?.push(edge.targetId);
    neighbors.get(edge.targetId)?.push(edge.sourceId);
  }
  return neighbors;
}

export function components(graph: VisualGraph): string[][] {
  const neighbors = adjacency(graph);
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const node of graph.nodes) {
    if (seen.has(node.id)) continue;
    const ids = [node.id];
    seen.add(node.id);
    for (const id of ids)
      for (const next of neighbors.get(id) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          ids.push(next);
        }
      }
    result.push(ids);
  }
  return result;
}

function border(node: VisualNode, other: VisualNode): Point {
  const x = node.x + node.width / 2,
    y = node.y + node.height / 2;
  const dx = other.x + other.width / 2 - x,
    dy = other.y + other.height / 2 - y;
  const scale = Math.min(
    dx === 0 ? Infinity : node.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : node.height / 2 / Math.abs(dy),
  );
  return Number.isFinite(scale)
    ? { x: x + dx * scale, y: y + dy * scale }
    : { x: node.x + node.width, y };
}

export function finishProvider<N, E, G, P>(
  graph: VisualGraph<N, E, G, P>,
  options: GraphProviderOptions,
  defaultPadding: number,
  preserveCoordinates = false,
): VisualGraph<N, E, G, P> {
  const value = options.padding;
  const left = nonnegative(
    typeof value === "number" ? value : value?.left,
    defaultPadding,
    "Left padding",
  );
  const top = nonnegative(
    typeof value === "number" ? value : value?.top,
    defaultPadding,
    "Top padding",
  );
  const minX = graph.nodes.length ? Math.min(...graph.nodes.map((node) => node.x)) : 0;
  const minY = graph.nodes.length ? Math.min(...graph.nodes.map((node) => node.y)) : 0;
  const nodes = graph.nodes.map((node) => ({
    ...node,
    x: preserveCoordinates ? node.x : node.x - minX + left,
    y: preserveCoordinates ? node.y : node.y - minY + top,
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = graph.edges.map((edge) => {
    const source = byId.get(edge.sourceId),
      target = byId.get(edge.targetId);
    const points =
      source && target
        ? source === target
          ? [
              { x: source.x + source.width, y: source.y + source.height / 2 },
              { x: source.x + source.width + 20, y: source.y + source.height / 2 },
              { x: source.x + source.width + 20, y: source.y - 20 },
              { x: source.x + source.width / 2, y: source.y - 20 },
              { x: source.x + source.width / 2, y: source.y },
            ]
          : [border(source, target), border(target, source)]
        : [];
    const first = points[0],
      last = points.at(-1);
    return {
      ...edge,
      points,
      routing: "polyline" as const,
      x: first && last ? (first.x + last.x - edge.width) / 2 : 0,
      y: first && last ? (first.y + last.y - edge.height) / 2 : 0,
    };
  });
  const right = nonnegative(
    typeof value === "number" ? value : value?.right,
    defaultPadding,
    "Right padding",
  );
  const bottom = nonnegative(
    typeof value === "number" ? value : value?.bottom,
    defaultPadding,
    "Bottom padding",
  );
  const allPoints = edges.flatMap((edge) => edge.points);
  const minimumX = Math.min(
    left,
    ...allPoints.map((point) => point.x),
    ...edges.map((edge) => edge.x),
  );
  const minimumY = Math.min(
    top,
    ...allPoints.map((point) => point.y),
    ...edges.map((edge) => edge.y),
  );
  const dx = preserveCoordinates ? 0 : left - minimumX;
  const dy = preserveCoordinates ? 0 : top - minimumY;
  const shiftedNodes = nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy }));
  const shiftedEdges = edges.map((edge) => ({
    ...edge,
    x: edge.x + dx,
    y: edge.y + dy,
    points: edge.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
  }));
  const width = nodes.length
    ? Math.max(
        ...shiftedNodes.map((node) => node.x + node.width),
        ...shiftedEdges.flatMap((edge) => [
          edge.x + edge.width,
          ...edge.points.map((point) => point.x),
        ]),
      ) + right
    : 0;
  const height = nodes.length
    ? Math.max(
        ...shiftedNodes.map((node) => node.y + node.height),
        ...shiftedEdges.flatMap((edge) => [
          edge.y + edge.height,
          ...edge.points.map((point) => point.y),
        ]),
      ) + bottom
    : 0;
  return setElkjs0111ResultPolicy(
    { ...graph, nodes: shiftedNodes, edges: shiftedEdges },
    {
      providerBounds: { width, height },
      skipBoundsNormalization: true,
    },
  );
}
