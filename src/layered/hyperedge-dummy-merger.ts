/*
 * Copyright (c) 2015, 2020 Kiel University and others.
 * Native adaptation of ELK HyperedgeDummyMerger (v0.11.0).
 * SPDX-License-Identifier: EPL-2.0
 */
import type { LayeredPhaseInput, LayerOrder } from "./types";
import type { LongEdgeExpansion } from "./long-edges";

const mergedNodes = new WeakMap<LayeredPhaseInput, Set<string>>();
export const isMergedHyperedgeDummy = (input: LayeredPhaseInput, id: string): boolean =>
  mergedNodes.get(input)?.has(id) ?? false;

/** Merge adjacent long-edge dummies connected through the same physical hyperedge. */
export function mergeHyperedgeDummies(expansion: LongEdgeExpansion, order: LayerOrder): LayerOrder {
  const { input } = expansion;
  const labelNodes = new Set(expansion.labelDummyIdByEdgeId.values());
  const longDummy = (id: string) =>
    id.startsWith("__layout_dummy:") &&
    !id.startsWith("__layout_dummy:north-south:") &&
    !id.startsWith("__layout_dummy:label:") &&
    !labelNodes.has(id);
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    const next = parent.get(id);
    if (next === undefined) {
      parent.set(id, id);
      return id;
    }
    if (next === id) return id;
    const result = root(next);
    parent.set(id, result);
    return result;
  };
  const port = (id: string, name: string | undefined, edge: string, endpoint: string) =>
    longDummy(id)
      ? JSON.stringify(["dummy", id])
      : name !== undefined
        ? JSON.stringify(["port", id, name])
        : input.settings.mergeEdges === true
          ? JSON.stringify(["implicit", id, endpoint])
          : JSON.stringify(["edge", edge, endpoint]);
  for (const edge of input.graph.edges) {
    const source = port(edge.sourceId, edge.sourcePort, edge.id, "source");
    const target = port(edge.targetId, edge.targetPort, edge.id, "target");
    parent.set(root(source), root(target));
  }
  // Label-bearing chains merge only before a shared source or after a shared target.
  type Metadata = { source?: string; target?: string; label?: boolean; before?: boolean };
  const metadata = new Map<string, Metadata>();
  const edges = new Map(input.graph.edges.map((edge) => [edge.id, edge]));
  for (const [edgeId, ids] of expansion.segmentIdsByEdgeId) {
    const chain = ids.map((id) => edges.get(id)).filter((edge) => edge !== undefined);
    if (!chain.length) continue;
    const first = chain[0]!,
      last = chain.at(-1)!;
    const reversed =
      (expansion.assignment.layerByNodeId.get(first.sourceId) ?? 0) >
      (expansion.assignment.layerByNodeId.get(last.targetId) ?? 0);
    const source = port(
      reversed ? last.targetId : first.sourceId,
      reversed ? last.targetPort : first.sourcePort,
      edgeId,
      "source",
    );
    const target = port(
      reversed ? first.sourceId : last.targetId,
      reversed ? first.sourcePort : last.targetPort,
      edgeId,
      "target",
    );
    const labelId = expansion.labelDummyIdByEdgeId.get(edgeId);
    const labelLayer =
      labelId === undefined ? undefined : expansion.assignment.layerByNodeId.get(labelId);
    for (const edge of chain)
      for (const id of [edge.sourceId, edge.targetId]) {
        if (!longDummy(id)) continue;
        metadata.set(id, {
          source,
          target,
          label: labelId !== undefined,
          before:
            labelLayer !== undefined &&
            (expansion.assignment.layerByNodeId.get(id) ?? 0) < labelLayer,
        });
      }
  }
  const aliases = new Map<string, string>(),
    merged = new Set<string>();
  const layers = order.layers.map((layer) => {
    const result: string[] = [];
    for (const id of layer) {
      const previous = result.at(-1);
      if (previous !== undefined && longDummy(id) && longDummy(previous)) {
        const currentInfo = metadata.get(id) ?? {},
          priorInfo = metadata.get(previous) ?? {};
        const sameSource =
          currentInfo.source !== undefined && currentInfo.source === priorInfo.source;
        const sameTarget =
          currentInfo.target !== undefined && currentInfo.target === priorInfo.target;
        const allowed =
          !currentInfo.label && !priorInfo.label
            ? root(JSON.stringify(["dummy", id])) === root(JSON.stringify(["dummy", previous]))
            : (sameSource &&
                (!currentInfo.label || currentInfo.before) &&
                (!priorInfo.label || priorInfo.before)) ||
              (sameTarget &&
                (!currentInfo.label || !currentInfo.before) &&
                (!priorInfo.label || !priorInfo.before));
        if (allowed) {
          aliases.set(id, previous);
          merged.add(previous);
          metadata.set(previous, {
            ...priorInfo,
            source: sameSource ? priorInfo.source : undefined,
            target: sameTarget ? priorInfo.target : undefined,
          });
          continue;
        }
      }
      result.push(id);
    }
    return result;
  });
  if (!aliases.size) return order;
  input.graph = {
    ...input.graph,
    nodes: input.graph.nodes.filter((node) => !aliases.has(node.id)),
    edges: input.graph.edges.map((edge) => ({
      ...edge,
      sourceId: aliases.get(edge.sourceId) ?? edge.sourceId,
      targetId: aliases.get(edge.targetId) ?? edge.targetId,
    })),
  } as LayeredPhaseInput["graph"];
  mergedNodes.set(input, merged);
  const portOrders = (original: ReadonlyMap<string, readonly string[]> | undefined) => {
    if (!original) return undefined;
    const result = new Map(original);
    for (const [removed, kept] of aliases) {
      result.set(kept, [...(result.get(kept) ?? []), ...(result.get(removed) ?? [])]);
      result.delete(removed);
    }
    return result;
  };
  return {
    ...order,
    layers,
    inputPortOrderByNodeId: portOrders(order.inputPortOrderByNodeId),
    outputPortOrderByNodeId: portOrders(order.outputPortOrderByNodeId),
  };
}
