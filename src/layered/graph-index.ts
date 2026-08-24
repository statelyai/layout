import type { GraphEdge, GraphNode } from "@statelyai/graph";
import type { LayeredPhaseInput } from "./types";

export interface LayeredGraphIndex {
  nodeById: ReadonlyMap<string, GraphNode>;
  edgeById: ReadonlyMap<string, GraphEdge>;
  incomingByNodeId: ReadonlyMap<string, readonly GraphEdge[]>;
  outgoingByNodeId: ReadonlyMap<string, readonly GraphEdge[]>;
  incidentByNodeId: ReadonlyMap<string, readonly GraphEdge[]>;
}

const indexByGraph = new WeakMap<object, LayeredGraphIndex>();

/** Private, lazily shared indexes for phase hot paths. */
export function getLayeredGraphIndex(input: LayeredPhaseInput): LayeredGraphIndex {
  const cached = indexByGraph.get(input.graph);
  if (cached) return cached;

  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(input.graph.edges.map((edge) => [edge.id, edge]));
  const incomingByNodeId = new Map(input.graph.nodes.map((node) => [node.id, [] as GraphEdge[]]));
  const outgoingByNodeId = new Map(input.graph.nodes.map((node) => [node.id, [] as GraphEdge[]]));
  const incidentByNodeId = new Map(input.graph.nodes.map((node) => [node.id, [] as GraphEdge[]]));
  for (const edge of input.graph.edges) {
    outgoingByNodeId.get(edge.sourceId)?.push(edge);
    incomingByNodeId.get(edge.targetId)?.push(edge);
    incidentByNodeId.get(edge.sourceId)?.push(edge);
    if (edge.targetId !== edge.sourceId) incidentByNodeId.get(edge.targetId)?.push(edge);
  }

  const index = {
    nodeById,
    edgeById,
    incomingByNodeId,
    outgoingByNodeId,
    incidentByNodeId,
  } satisfies LayeredGraphIndex;
  indexByGraph.set(input.graph, index);
  return index;
}
