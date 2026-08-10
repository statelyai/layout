/*******************************************************************************
 * Copyright (c) 2016, 2020 Kiel University and others.
 *
 * Translated from ELK v0.11.0 StretchWidthLayerer.java.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { GraphEdge } from "@statelyai/graph";
import type { AcyclicOrientation, LayerAssigner, LayeredPhaseInput } from "./types";

interface StretchNode {
  id: string;
  modelOrder: number;
  index: number;
  size: number;
  rank: number;
  incoming: StretchEdge[];
  outgoing: StretchEdge[];
}

interface StretchEdge {
  edge: GraphEdge;
  source: StretchNode;
  target: StretchNode;
}

function createGraph(input: LayeredPhaseInput, orientation: AcyclicOrientation): StretchNode[] {
  const horizontal = input.direction === "left" || input.direction === "right";
  const nodes = input.graph.nodes.map((node, modelOrder): StretchNode => ({
    id: node.id,
    modelOrder,
    index: modelOrder,
    size: horizontal
      ? (input.sizes.get(node.id)?.height ?? 0)
      : (input.sizes.get(node.id)?.width ?? 0),
    rank: 0,
    incoming: [],
    outgoing: [],
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const graphEdge of input.graph.edges) {
    if (graphEdge.sourceId === graphEdge.targetId) continue;
    const reversed = orientation.reversedEdgeIds.has(graphEdge.id);
    const source = nodeById.get(reversed ? graphEdge.targetId : graphEdge.sourceId);
    const target = nodeById.get(reversed ? graphEdge.sourceId : graphEdge.targetId);
    if (!source || !target) continue;
    const edge = { edge: graphEdge, source, target };
    source.outgoing.push(edge);
    target.incoming.push(edge);
  }
  for (const node of nodes) {
    node.rank = Math.max(
      node.outgoing.length,
      ...node.incoming.map((edge) => edge.source.outgoing.length),
    );
  }
  const sorted = [...nodes].sort(
    (left, right) => right.rank - left.rank || left.modelOrder - right.modelOrder,
  );
  for (const [index, node] of sorted.entries()) node.index = index;
  return sorted;
}

export const assignLayersWithStretchWidth: LayerAssigner = (input, orientation) => {
  if (input.graph.nodes.length === 0) return { layerByNodeId: new Map() };
  const nodes = createGraph(input, orientation);
  const minimumSize = Math.max(1, Math.min(...nodes.map((node) => node.size)));
  const maximumSize = Math.max(1, Math.max(...nodes.map((node) => node.size)));
  const normalizedSize = nodes.map((node) => node.size / minimumSize);
  const dummySize = (input.settings["spacing.edgeEdge"] ?? 10) / minimumSize;
  const indegree = nodes.map((node) => node.incoming.length);
  const outdegree = nodes.map((node) => node.outgoing.length);
  const averageOutdegree =
    nodes.reduce((total, node) => total + node.outgoing.length, 0) / nodes.length;
  let maximumWidth = maximumSize / minimumSize;

  while (true) {
    let widthCurrent = 0;
    let widthUp = 0;
    const layers: StretchNode[][] = [[]];
    let currentLayer = layers[0] as StretchNode[];
    const remainingNodes = [...nodes];
    const remainingOutgoing = [...outdegree];
    const alreadyPlacedInCurrentLayer = new Set<StretchNode>();
    let reset = false;

    while (remainingNodes.length > 0) {
      const selected = remainingNodes.find((node) => (remainingOutgoing[node.index] ?? 0) <= 0);
      const conditionGoUp = selected
        ? widthCurrent -
            (outdegree[selected.index] ?? 0) * dummySize +
            (normalizedSize[selected.index] ?? 0) >
            maximumWidth ||
          widthUp + (indegree[selected.index] ?? 0) * dummySize >
            maximumWidth * averageOutdegree * dummySize
        : false;

      if (!selected || (conditionGoUp && alreadyPlacedInCurrentLayer.size > 0)) {
        for (const node of currentLayer) {
          for (const edge of node.incoming) {
            remainingOutgoing[edge.source.index] = (remainingOutgoing[edge.source.index] ?? 1) - 1;
          }
        }
        currentLayer = [];
        layers.push(currentLayer);
        alreadyPlacedInCurrentLayer.clear();
        widthCurrent = widthUp;
        widthUp = 0;
      } else if (conditionGoUp) {
        maximumWidth++;
        reset = true;
        break;
      } else {
        currentLayer.push(selected);
        remainingNodes.splice(remainingNodes.indexOf(selected), 1);
        alreadyPlacedInCurrentLayer.add(selected);
        widthCurrent =
          widthCurrent -
          (outdegree[selected.index] ?? 0) * dummySize +
          (normalizedSize[selected.index] ?? 0);
        widthUp += (indegree[selected.index] ?? 0) * dummySize;
      }
    }

    if (reset) continue;
    const layerByNodeId = new Map<string, number>();
    const layerCount = layers.length;
    for (const [bottomUpLayer, layer] of layers.entries()) {
      for (const node of layer) layerByNodeId.set(node.id, layerCount - bottomUpLayer - 1);
    }
    return { layerByNodeId };
  }
};
