import type { GraphEdge } from "@statelyai/graph";
import type { LayeredPhaseInput } from "./types";
import { findNode } from "./node-lookup";

/** ELK traverses connected edges through the node's port list, preserving each port's edge order. */
export function connectedEdgesInPortOrder(input: LayeredPhaseInput, nodeId: string): GraphEdge[] {
  const node = findNode(input.graph.nodes, nodeId);
  const portRank = new Map(node?.ports?.map((port, index) => [port.name, index]));
  const explicitCount = portRank.size;
  return input.graph.edges
    .map((edge, index) => ({ edge, index }))
    .filter(({ edge }) => edge.sourceId === nodeId || edge.targetId === nodeId)
    .sort((a, b) => {
      const rank = ({ edge, index }: { edge: GraphEdge; index: number }) => {
        const port = edge.sourceId === nodeId ? edge.sourcePort : edge.targetPort;
        return (port === undefined ? undefined : portRank.get(port)) ?? explicitCount + index;
      };
      return rank(a) - rank(b) || a.index - b.index;
    })
    .map(({ edge }) => edge);
}
