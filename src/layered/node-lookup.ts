import type { GraphNode } from "@statelyai/graph";

// First position of each id per node list. Positions are checked on use and
// a miss still scans, so a list edited after indexing answers like `find`.
const positionsByNodes = new WeakMap<readonly GraphNode[], Map<string, number>>();

function indexNodes(nodes: readonly GraphNode[]): Map<string, number> {
  const positions = new Map<string, number>();
  for (const [index, node] of nodes.entries())
    if (!positions.has(node.id)) positions.set(node.id, index);
  positionsByNodes.set(nodes, positions);
  return positions;
}

/** Same as `nodes.find((node) => node.id === id)`, indexed per list. */
export function findNode(nodes: readonly GraphNode[], id: string): GraphNode | undefined {
  let position = (positionsByNodes.get(nodes) ?? indexNodes(nodes)).get(id);
  if (position !== undefined && nodes[position]?.id !== id) position = indexNodes(nodes).get(id);
  return position !== undefined && nodes[position]?.id === id
    ? nodes[position]
    : nodes.find((node) => node.id === id);
}
