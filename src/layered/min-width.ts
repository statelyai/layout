/*******************************************************************************
 * Copyright (c) 2016, 2020 Kiel University and others.
 *
 * Translated from ELK v0.11.0 MinWidthLayerer.java.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { GraphEdge } from "@statelyai/graph";
import type { AcyclicOrientation, LayerAssigner, LayeredPhaseInput } from "./types";

interface MinWidthNode {
  id: string;
  index: number;
  modelOrder: number;
  normalizedSize: number;
  incoming: MinWidthEdge[];
  outgoing: MinWidthEdge[];
}

interface MinWidthEdge {
  edge: GraphEdge;
  source: MinWidthNode;
  target: MinWidthNode;
}

function createGraph(input: LayeredPhaseInput, orientation: AcyclicOrientation) {
  const horizontal = input.direction === "left" || input.direction === "right";
  const crossSize = (id: string) => {
    const size = input.sizes.get(id);
    return horizontal ? (size?.height ?? 0) : (size?.width ?? 0);
  };
  const minimumSize = Math.max(1, Math.min(...input.graph.nodes.map((node) => crossSize(node.id))));
  const nodes = input.graph.nodes.map((node, index): MinWidthNode => ({
    id: node.id,
    index,
    modelOrder: index,
    normalizedSize: crossSize(node.id) / minimumSize,
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
  return { nodes, minimumSize };
}

function computeLayering(
  nodes: readonly MinWidthNode[],
  upperBoundOnWidth: number,
  compensator: number,
  averageSize: number,
  dummySize: number,
): { maximumWidth: number; layers: MinWidthNode[][] } {
  const layers: MinWidthNode[][] = [];
  const unplaced = new Set(nodes);
  const alreadyPlacedInCurrentLayer = new Set<MinWidthNode>();
  const alreadyPlacedInOtherLayers = new Set<MinWidthNode>();
  let currentLayer: MinWidthNode[] = [];
  let widthCurrent = 0;
  let widthUp = 0;
  let maximumWidth = 0;
  let realWidth = 0;
  let currentSpanningEdges = 0;
  let goingOutFromThisLayer = 0;
  const sizeAwareBound = upperBoundOnWidth * averageSize;

  while (unplaced.size > 0) {
    const currentNode = [...unplaced].find((node) =>
      node.outgoing.every((edge) => alreadyPlacedInOtherLayers.has(edge.target)),
    );
    if (currentNode) {
      unplaced.delete(currentNode);
      currentLayer.push(currentNode);
      alreadyPlacedInCurrentLayer.add(currentNode);
      const outdegree = currentNode.outgoing.length;
      widthCurrent += currentNode.normalizedSize - outdegree * dummySize;
      widthUp += currentNode.incoming.length * dummySize;
      goingOutFromThisLayer += outdegree * dummySize;
      realWidth += currentNode.normalizedSize;
    }

    if (
      !currentNode ||
      unplaced.size === 0 ||
      (widthCurrent >= sizeAwareBound &&
        currentNode.normalizedSize > currentNode.outgoing.length * dummySize) ||
      widthUp >= compensator * sizeAwareBound
    ) {
      layers.push(currentLayer);
      currentLayer = [];
      for (const node of alreadyPlacedInCurrentLayer) alreadyPlacedInOtherLayers.add(node);
      alreadyPlacedInCurrentLayer.clear();
      currentSpanningEdges -= goingOutFromThisLayer;
      maximumWidth = Math.max(maximumWidth, currentSpanningEdges * dummySize + realWidth);
      currentSpanningEdges += widthUp;
      widthCurrent = widthUp;
      widthUp = 0;
      goingOutFromThisLayer = 0;
      realWidth = 0;
    }
  }
  return { maximumWidth, layers };
}

export const assignLayersWithMinWidth: LayerAssigner = (input, orientation) => {
  if (input.graph.nodes.length === 0) return { layerByNodeId: new Map() };
  const { nodes, minimumSize } = createGraph(input, orientation);
  const orderedNodes = [...nodes].sort(
    (left, right) =>
      right.outgoing.length - left.outgoing.length || left.modelOrder - right.modelOrder,
  );
  const averageSize = nodes.reduce((total, node) => total + node.normalizedSize, 0) / nodes.length;
  const dummySize = (input.settings["spacing.edgeEdge"] ?? 10) / minimumSize;
  const configuredUpperBound = input.settings["layering.minWidth.upperBoundOnWidth"] ?? 4;
  const configuredCompensator =
    input.settings["layering.minWidth.upperLayerEstimationScalingFactor"] ?? 2;
  const upperBounds = configuredUpperBound < 0 ? [1, 2, 3, 4] : [configuredUpperBound];
  const compensators = configuredCompensator < 0 ? [1, 2] : [configuredCompensator];

  let winner: { maximumWidth: number; layers: MinWidthNode[][] } | undefined;
  for (const upperBound of upperBounds) {
    for (const compensator of compensators) {
      const candidate = computeLayering(
        orderedNodes,
        upperBound,
        compensator,
        averageSize,
        dummySize,
      );
      if (
        !winner ||
        candidate.maximumWidth < winner.maximumWidth ||
        (candidate.maximumWidth === winner.maximumWidth &&
          candidate.layers.length < winner.layers.length)
      ) {
        winner = candidate;
      }
    }
  }
  if (!winner) throw new Error("MinWidth produced no layering");

  const layerByNodeId = new Map<string, number>();
  const layerCount = winner.layers.length;
  for (const [bottomUpLayer, layer] of winner.layers.entries()) {
    for (const node of layer) layerByNodeId.set(node.id, layerCount - bottomUpLayer - 1);
  }
  return {
    layerByNodeId,
    seedOrder: [...winner.layers].reverse().flatMap((layer) => layer.map((node) => node.id)),
  };
};
