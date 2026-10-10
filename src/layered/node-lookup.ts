import type { GraphNode } from "@statelyai/graph";

// First position of each id per node list, rebuilt when the list's length
// changes. Layout code only appends to node lists, never replaces entries in
// place; positions are still checked on use and a miss scans like `find`.
const indexByNodes = new WeakMap<
  readonly GraphNode[],
  { length: number; positions: Map<string, number> }
>();

function indexNodes(nodes: readonly GraphNode[]): Map<string, number> {
  const positions = new Map<string, number>();
  for (const [index, node] of nodes.entries())
    if (!positions.has(node.id)) positions.set(node.id, index);
  indexByNodes.set(nodes, { length: nodes.length, positions });
  return positions;
}

/** Same as `nodes.find((node) => node.id === id)`, indexed per list. */
export function findNode(nodes: readonly GraphNode[], id: string): GraphNode | undefined {
  const cached = indexByNodes.get(nodes);
  let position = (
    cached && cached.length === nodes.length ? cached.positions : indexNodes(nodes)
  ).get(id);
  if (position !== undefined && nodes[position]?.id !== id) position = indexNodes(nodes).get(id);
  return position !== undefined && nodes[position]?.id === id
    ? nodes[position]
    : nodes.find((node) => node.id === id);
}
