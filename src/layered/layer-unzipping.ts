/*******************************************************************************
 * Derived from Eclipse Layout Kernel's AlternatingLayerUnzipper.
 * Copyright (c) 2024 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/

import type { GraphEdge, GraphNode } from "@statelyai/graph";
import type { LongEdgeExpansion } from "./long-edges";
import type { LayerOrder, LayeredPhaseInput } from "./types";

type PlaceholderType = "PLACEHOLDER" | "NONSHIFTING_PLACEHOLDER";

function isLongEdgeNode(id: string): boolean {
  return id.startsWith("__layout_dummy:");
}

export function unzipLayersAlternating(
  expansion: LongEdgeExpansion,
  order: LayerOrder,
): { expansion: LongEdgeExpansion; order: LayerOrder } {
  const input = expansion.input;
  const nodes = [...input.graph.nodes] as GraphNode[];
  let edges = [...input.graph.edges] as GraphEdge[];
  const sizes = new Map(input.sizes);
  const usedNodeIds = new Set(nodes.map((node) => node.id));
  const placeholderTypeById = new Map<string, PlaceholderType>();
  const originalEdgeByCurrentId = new Map(edges.map((edge) => [edge.id, edge]));
  const leavesBySegmentId = new Map(edges.map((edge) => [edge.id, [edge.id] as string[]]));
  let dummySerial = 0;
  let edgeSerial = 0;

  const uniqueNodeId = (kind: "long" | "placeholder"): string => {
    let id: string;
    do id = `__layout_dummy:unzip:${kind}:${dummySerial++}`;
    while (usedNodeIds.has(id));
    usedNodeIds.add(id);
    return id;
  };
  const createNode = (kind: "long" | PlaceholderType): string => {
    const id = uniqueNodeId(kind === "long" ? "long" : "placeholder");
    nodes.push({ type: "node", id, data: undefined, width: 0, height: 0 });
    sizes.set(id, { width: 0, height: 0 });
    if (kind !== "long") placeholderTypeById.set(id, kind);
    return id;
  };
  const insertAt = (layer: string[], index: number, id: string): void => {
    layer.splice(Math.min(index, layer.length), 0, id);
  };
  const splitEdge = (edge: GraphEdge, dummyId: string): GraphEdge => {
    const original = originalEdgeByCurrentId.get(edge.id) ?? edge;
    const first: GraphEdge = {
      ...edge,
      id: `${edge.id}::unzip:${edgeSerial++}:0`,
      targetId: dummyId,
      targetPort: undefined,
      points: undefined,
      width: 0,
      height: 0,
    };
    const second: GraphEdge = {
      ...edge,
      id: `${edge.id}::unzip:${edgeSerial++}:1`,
      sourceId: dummyId,
      sourcePort: undefined,
      points: undefined,
      width: 0,
      height: 0,
    };
    const index = edges.findIndex((candidate) => candidate.id === edge.id);
    edges.splice(index, 1, first, second);
    originalEdgeByCurrentId.delete(edge.id);
    originalEdgeByCurrentId.set(first.id, original);
    originalEdgeByCurrentId.set(second.id, original);
    for (const leaves of leavesBySegmentId.values()) {
      const leaf = leaves.indexOf(edge.id);
      if (leaf >= 0) leaves.splice(leaf, 1, first.id, second.id);
    }
    return second;
  };

  const outputLayers: string[][] = [];
  for (const originalLayer of order.layers.map((layer) => [...layer])) {
    const configuredSplits = originalLayer.flatMap((id) => {
      const node = nodes.find((candidate) => candidate.id === id);
      const value = node && input.nodeSettings?.(node)?.["layerUnzipping.layerSplit"];
      return value === undefined ? [] : [Math.max(1, Number(value))];
    });
    const split = configuredSplits.length > 0 ? Math.min(...configuredSplits) : 2;
    const resetOnLongEdges = originalLayer.every((id) => {
      const node = nodes.find((candidate) => candidate.id === id);
      return !node || input.nodeSettings?.(node)?.["layerUnzipping.resetOnLongEdges"] !== false;
    });
    const minimizeEdgeLength = originalLayer.some((id) => {
      const node = nodes.find((candidate) => candidate.id === id);
      return node && input.nodeSettings?.(node)?.["layerUnzipping.minimizeEdgeLength"] === true;
    });
    if (minimizeEdgeLength) {
      const maximumWidth = Math.max(0, ...originalLayer.map((id) => sizes.get(id)?.width ?? 0));
      const averageHeight =
        originalLayer.reduce((sum, id) => sum + (sizes.get(id)?.height ?? 0), 0) /
        originalLayer.length;
      const estimatedWidth =
        maximumWidth +
        Math.max(
          2 * Number(input.settings["spacing.edgeNodeBetweenLayers"] ?? 10),
          originalLayer.length * Number(input.settings["spacing.edgeEdgeBetweenLayers"] ?? 10),
          input.spacing.layer,
        );
      const estimatedHeight =
        averageHeight +
        Math.max(input.spacing.node, Number(input.settings["spacing.edgeNode"] ?? 10));
      if (estimatedWidth / estimatedHeight >= originalLayer.length / 4) {
        outputLayers.push(originalLayer);
        continue;
      }
    }
    if (originalLayer.length <= split) {
      outputLayers.push(originalLayer);
      continue;
    }

    const sublayers = [originalLayer, ...Array.from({ length: split - 1 }, () => [] as string[])];
    const nodesInLayer = originalLayer.length;
    for (
      let j = 0, nodeIndex = 0, targetLayer = 0;
      j < nodesInLayer;
      j++, nodeIndex++, targetLayer++
    ) {
      const nodeId = sublayers[0]![nodeIndex]!;
      if (placeholderTypeById.get(nodeId) === "NONSHIFTING_PLACEHOLDER") {
        j--;
        targetLayer--;
        continue;
      }
      if (targetLayer % split > 0) {
        sublayers[0]!.splice(nodeIndex, 1);
        sublayers[targetLayer % split]!.push(nodeId);
      }

      let edgeCount = 0;
      const incoming = edges.filter((edge) => edge.targetId === nodeId).reverse();
      for (const incomingEdge of incoming) {
        let next = incomingEdge;
        for (let layerIndex = 0; layerIndex < targetLayer % split; layerIndex++) {
          const dummyId = createNode("long");
          insertAt(sublayers[layerIndex]!, nodeIndex + edgeCount, dummyId);
          next = splitEdge(next, dummyId);
        }
        if (targetLayer % split > 0) edgeCount++;
      }
      if (incoming.length === 0) {
        for (let layerIndex = 0; layerIndex < targetLayer % split; layerIndex++) {
          insertAt(sublayers[layerIndex]!, nodeIndex + edgeCount, createNode("PLACEHOLDER"));
        }
        if (targetLayer % split > 0) edgeCount++;
      }

      let extraEdge = false;
      for (const outgoingEdge of edges.filter((edge) => edge.sourceId === nodeId)) {
        let next = outgoingEdge;
        for (let layerIndex = (targetLayer % split) + 1; layerIndex < split; layerIndex++) {
          const dummyId = createNode("long");
          sublayers[layerIndex]!.push(dummyId);
          next = splitEdge(next, dummyId);
        }
        for (let layerIndex = 0; layerIndex <= targetLayer % split; layerIndex++) {
          if (extraEdge) {
            insertAt(sublayers[layerIndex]!, nodeIndex + 1, createNode("NONSHIFTING_PLACEHOLDER"));
          }
        }
        if (extraEdge) edgeCount++;
        extraEdge = true;
      }
      nodeIndex += Math.max(0, edgeCount - 1);
      if (resetOnLongEdges && isLongEdgeNode(nodeId)) targetLayer = -1;
    }
    outputLayers.push(...sublayers);
  }

  const layers = outputLayers.map((layer) =>
    layer.filter((id) => placeholderTypeById.get(id) === undefined),
  );
  const retainedIds = new Set(layers.flat());
  const graphNodes = nodes.filter((node) => retainedIds.has(node.id));
  const layerByNodeId = new Map<string, number>();
  layers.forEach((layer, layerNo) => layer.forEach((id) => layerByNodeId.set(id, layerNo)));
  const segmentIdsByEdgeId = new Map<string, readonly string[]>();
  for (const [edgeId, segmentIds] of expansion.segmentIdsByEdgeId) {
    segmentIdsByEdgeId.set(
      edgeId,
      segmentIds.flatMap((segmentId) => leavesBySegmentId.get(segmentId) ?? [segmentId]),
    );
  }
  const reversedEdgeIds = new Set<string>();
  for (const edge of edges) {
    const original = originalEdgeByCurrentId.get(edge.id);
    if (original && expansion.orientation.reversedEdgeIds.has(original.id)) {
      reversedEdgeIds.add(edge.id);
    }
  }
  const graph = { ...input.graph, nodes: graphNodes, edges } as LayeredPhaseInput["graph"];
  return {
    expansion: {
      ...expansion,
      input: {
        ...input,
        graph,
        sizes,
        edgeSettings: (edge) => input.edgeSettings?.(originalEdgeByCurrentId.get(edge.id) ?? edge),
      },
      orientation: { reversedEdgeIds },
      assignment: { layerByNodeId },
      segmentIdsByEdgeId,
    },
    order: { layers },
  };
}
