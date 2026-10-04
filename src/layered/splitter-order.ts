import type { GraphEdge, GraphNode } from "@statelyai/graph";
import type { LongEdgeExpansion } from "./long-edges";
import type { LayeredPhaseInput } from "./types";

/**
 * ELK's LongEdgeSplitter appends each dummy to the next layer while visiting
 * the current layer's nodes, their ports and each port's outgoing edges. That
 * insertion order is the initial crossing-minimization order, so seed it here.
 */
export function withLongEdgeSplitterOrder(
  unsplit: LayeredPhaseInput,
  expansion: LongEdgeExpansion,
  baseOrder: readonly string[],
): LongEdgeExpansion {
  const { input, orientation, assignment } = expansion;
  const authoredIds = new Set(unsplit.graph.nodes.map((node) => node.id));
  const dummyIds = new Set(
    input.graph.nodes.map((node) => node.id).filter((id) => !authoredIds.has(id)),
  );
  if (dummyIds.size === 0) return expansion;
  const layerOf = (id: string) => assignment.layerByNodeId.get(id) ?? 0;
  const placed = new Set<string>();
  const layers: string[][] = [];
  for (const id of [...baseOrder, ...authoredIds]) {
    if (placed.has(id) || !authoredIds.has(id)) continue;
    placed.add(id);
    (layers[layerOf(id)] ??= []).push(id);
  }
  const reversed = (edge: GraphEdge) => orientation.reversedEdgeIds.has(edge.id);
  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of input.graph.edges) {
    const source = reversed(edge) ? edge.targetId : edge.sourceId;
    if (edge.sourceId === edge.targetId) continue;
    if (!outgoing.has(source)) outgoing.set(source, []);
    outgoing.get(source)!.push(edge);
  }
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  // Explicit ports precede implicit edge ports. Reversal appends an edge after
  // the port's retained outgoing edges.
  const targetsInPortOrder = (id: string): string[] => {
    const node = nodeById.get(id);
    const edges = outgoing.get(id) ?? [];
    const ranked = edges.map((edge, index) => {
      const port = authoredPortIndex(
        input,
        node,
        reversed(edge) ? edge.targetPort : edge.sourcePort,
      );
      return port < 0
        ? { edge, port: (node?.ports?.length ?? 0) + index, appended: 0, index }
        : { edge, port, appended: Number(reversed(edge)), index };
    });
    return ranked
      .sort((a, b) => a.port - b.port || a.appended - b.appended || a.index - b.index)
      .map(({ edge }) => (reversed(edge) ? edge.sourceId : edge.targetId));
  };
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index] ?? [];
    for (let position = 0; position < layer.length; position++) {
      for (const target of targetsInPortOrder(layer[position]!)) {
        if (!dummyIds.has(target) || placed.has(target) || layerOf(target) !== index + 1) continue;
        placed.add(target);
        (layers[index + 1] ??= []).push(target);
      }
    }
  }
  const seedOrder = layers.flatMap((layer) => layer ?? []);
  for (const id of dummyIds) if (!placed.has(id)) seedOrder.push(id);
  return { ...expansion, assignment: { ...assignment, seedOrder } };
}

/** ELK imports ports in authored order; side sorting happens after dummy insertion. */
function authoredPortIndex(
  input: LayeredPhaseInput,
  node: GraphNode | undefined,
  name: string | undefined,
): number {
  const port = name === undefined ? undefined : node?.ports?.find((p) => p.name === name);
  if (!node || !port) return -1;
  const settings = input.portSettings?.(port, node) as
    | { "port.authoredIndex"?: number }
    | undefined;
  return settings?.["port.authoredIndex"] ?? node.ports!.indexOf(port);
}
