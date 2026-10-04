import type { GraphEdge } from "@statelyai/graph";
import type { PortEdgeList } from "./elk-port-lists";
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
  portLists: ReadonlyMap<string, readonly PortEdgeList[]>,
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
  // Visit ports and their outgoing edges in ELK's simulated list order, which
  // records reversal history. Expanded segment ids keep the original edge id.
  const original = (id: string) => id.split("::")[0]!;
  const targetsInPortOrder = (id: string): string[] => {
    const edges = outgoing.get(id) ?? [];
    const lists = portLists.get(id);
    if (!lists) return edges.map((edge) => (reversed(edge) ? edge.sourceId : edge.targetId));
    const rank = new Map<string, number>();
    for (const port of lists) for (const edgeId of port.outgoing) rank.set(edgeId, rank.size);
    return edges
      .map((edge, index) => ({
        edge,
        index,
        rank: rank.get(original(edge.id)) ?? rank.size + index,
      }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
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

/**
 * Each split re-targets a long edge through a new segment appended to the
 * target port's incoming edges. Long edges therefore follow retained short
 * edges, in the order of their final split.
 */
export function incomingAfterLongEdgeSplitting(
  lists: ReadonlyMap<string, readonly PortEdgeList[]>,
  expansion: LongEdgeExpansion,
): Map<string, PortEdgeList[]> {
  const { input, orientation, assignment } = expansion;
  const seed = new Map((assignment.seedOrder ?? []).map((id, index) => [id, index]));
  const listed = (id: string) => id.replace(/::segment:\d+$/, "");
  const finalSplit = new Map<string, number>();
  for (const edge of input.graph.edges) {
    const reversed = orientation.reversedEdgeIds.has(edge.id);
    const [source, target] = reversed
      ? [edge.targetId, edge.sourceId]
      : [edge.sourceId, edge.targetId];
    const at = seed.get(source);
    if (source.startsWith("__layout_dummy:") && at !== undefined)
      finalSplit.set(`${target}\0${listed(edge.id)}`, at);
  }
  return new Map(
    [...lists].map(([id, ports]) => [
      id,
      ports.map((port) => ({
        ...port,
        incoming: port.incoming
          .map((edgeId, index) => ({ edgeId, index, split: finalSplit.get(`${id}\0${edgeId}`) }))
          .sort((a, b) => (a.split ?? -1) - (b.split ?? -1) || a.index - b.index)
          .map(({ edgeId }) => edgeId),
      })),
    ]),
  );
}
