/*******************************************************************************
 * Derived from Eclipse Layout Kernel's network-simplex node placer.
 * Copyright (c) 2016, 2017 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/

import type { EntityRect, GraphEdge } from "@statelyai/graph";
import { runNetworkSimplex } from "./network-simplex";
import type { SimplexEdge, SimplexNode } from "./network-simplex";
import { placeNodesInLayers } from "./strategies";
import type { LayerOrder, LayeredPhaseInput, NodePlacement } from "./types";
import { nodeNodeSpacing } from "./spacing";
import { setFlexiblePortPosition } from "./flexible-ports";

function crossSize(input: LayeredPhaseInput, id: string): number {
  const size = input.sizes.get(id);
  return input.direction === "left" || input.direction === "right"
    ? (size?.height ?? 0)
    : (size?.width ?? 0);
}

function makeNode(id: string, order: number): SimplexNode {
  return { id, order, layer: 0, incoming: [], outgoing: [], treeNode: false };
}

function addEdge(
  edges: SimplexEdge[],
  source: SimplexNode,
  target: SimplexNode,
  delta: number,
  weight: number,
): void {
  const edge: SimplexEdge = {
    id: `aux:${edges.length}`,
    order: edges.length,
    source,
    target,
    delta,
    weight,
    treeEdge: false,
  };
  edges.push(edge);
  source.outgoing.push(edge);
  target.incoming.push(edge);
}

function endpointAnchors(input: LayeredPhaseInput, order: LayerOrder) {
  const layer = new Map<string, number>();
  const index = new Map<string, number>();
  order.layers.forEach((ids, layerNo) =>
    ids.forEach((id, nodeNo) => {
      layer.set(id, layerNo);
      index.set(id, nodeNo);
    }),
  );
  const before = new Map<string, GraphEdge[]>();
  const after = new Map<string, GraphEdge[]>();
  for (const id of layer.keys()) {
    before.set(id, []);
    after.set(id, []);
  }
  for (const edge of input.graph.edges) {
    const sourceLayer = layer.get(edge.sourceId) ?? 0;
    const targetLayer = layer.get(edge.targetId) ?? 0;
    if (sourceLayer < targetLayer) {
      after.get(edge.sourceId)?.push(edge);
      before.get(edge.targetId)?.push(edge);
    } else if (targetLayer < sourceLayer) {
      before.get(edge.sourceId)?.push(edge);
      after.get(edge.targetId)?.push(edge);
    }
  }
  const other = (edge: GraphEdge, id: string) =>
    edge.sourceId === id ? edge.targetId : edge.sourceId;
  const anchors = new Map<string, number>();
  for (const [id, edges] of after) {
    edges.sort((a, b) => (index.get(other(a, id)) ?? 0) - (index.get(other(b, id)) ?? 0));
    edges.forEach((edge, edgeNo) =>
      anchors.set(
        `${edge.id}:${id}`,
        Math.round((crossSize(input, id) * (edgeNo + 1)) / (edges.length + 1)),
      ),
    );
  }
  for (const [id, edges] of before) {
    edges.sort((a, b) => (index.get(other(a, id)) ?? 0) - (index.get(other(b, id)) ?? 0));
    edges.forEach((edge, edgeNo) =>
      anchors.set(
        `${edge.id}:${id}`,
        Math.round((crossSize(input, id) * (edges.length - edgeNo)) / (edges.length + 1)),
      ),
    );
  }
  return anchors;
}

/** ELK auxiliary-graph network-simplex placement for fixed-position ports. */
export function placeNodesWithNetworkSimplex(
  input: LayeredPhaseInput,
  order: LayerOrder,
): NodePlacement {
  const base = placeNodesInLayers(input, order);
  const horizontal = input.direction === "left" || input.direction === "right";
  const anchors = endpointAnchors(input, order);
  const nodes: SimplexNode[] = [];
  const nodeById = new Map<string, SimplexNode>();
  for (const layer of order.layers) {
    for (const id of layer) {
      const node = makeNode(id, nodes.length);
      nodes.push(node);
      nodeById.set(id, node);
    }
  }
  const edges: SimplexEdge[] = [];
  for (const layer of order.layers) {
    for (let index = 1; index < layer.length; index++) {
      const upperId = layer[index - 1]!;
      const lowerId = layer[index]!;
      addEdge(
        edges,
        nodeById.get(upperId)!,
        nodeById.get(lowerId)!,
        Math.ceil(crossSize(input, upperId) + nodeNodeSpacing(input, upperId, lowerId)),
        0,
      );
    }
  }
  for (const graphEdge of input.graph.edges) {
    if (graphEdge.sourceId === graphEdge.targetId) continue;
    const source = nodeById.get(graphEdge.sourceId);
    const target = nodeById.get(graphEdge.targetId);
    if (!source || !target) continue;
    const dummy = makeNode(`edge:${graphEdge.id}`, nodes.length);
    nodes.push(dummy);
    const sourceOffset = anchors.get(`${graphEdge.id}:${graphEdge.sourceId}`) ?? 0;
    const targetOffset = anchors.get(`${graphEdge.id}:${graphEdge.targetId}`) ?? 0;
    const priority = Math.max(
      1,
      Number(input.edgeSettings?.(graphEdge)?.["priority.straightness"] ?? 1),
    );
    const sourceDummy = graphEdge.sourceId.startsWith("__layout_dummy:");
    const targetDummy = graphEdge.targetId.startsWith("__layout_dummy:");
    const typeWeight = sourceDummy && targetDummy ? 32 : sourceDummy || targetDummy ? 8 : 4;
    addEdge(edges, dummy, source, Math.max(0, targetOffset - sourceOffset), priority * typeWeight);
    addEdge(edges, dummy, target, Math.max(0, sourceOffset - targetOffset), priority * typeWeight);
  }
  runNetworkSimplex(
    nodes,
    edges,
    Number(input.settings.thoroughness ?? 7) * nodes.length,
    undefined,
    false,
  );

  const minimum = Math.min(...[...nodeById.values()].map((node) => node.layer));
  const crossPadding =
    input.direction === "left" || input.direction === "right"
      ? input.padding.top
      : input.padding.left;
  const rectByNodeId = new Map<string, EntityRect>();
  for (const [id, rect] of base.rectByNodeId) {
    const cross = (nodeById.get(id)?.layer ?? 0) - minimum + crossPadding;
    rectByNodeId.set(
      id,
      input.direction === "left" || input.direction === "right"
        ? { ...rect, y: cross }
        : { ...rect, x: cross },
    );
  }

  if (
    input.graph.edges.some(
      (edge) => Number(input.edgeSettings?.(edge)?.["priority.straightness"] ?? 1) > 1,
    )
  ) {
    const horizontal = input.direction === "left" || input.direction === "right";
    const crossStart = (rect: EntityRect) => (horizontal ? rect.y : rect.x);
    const setCrossStart = (rect: EntityRect, value: number): EntityRect =>
      horizontal ? { ...rect, y: value } : { ...rect, x: value };
    for (let pass = 0; pass < 2; pass++) {
      for (const layer of order.layers) {
        for (const [index, id] of layer.entries()) {
          const rect = rectByNodeId.get(id);
          if (!rect) continue;
          const weightedTargets: Array<{ value: number; weight: number }> = [];
          for (const edge of input.graph.edges) {
            if (edge.sourceId !== id && edge.targetId !== id) continue;
            const otherId = edge.sourceId === id ? edge.targetId : edge.sourceId;
            const otherRect = rectByNodeId.get(otherId);
            if (!otherRect) continue;
            const ownAnchor = anchors.get(`${edge.id}:${id}`) ?? 0;
            const otherAnchor = anchors.get(`${edge.id}:${otherId}`) ?? 0;
            weightedTargets.push({
              value: crossStart(otherRect) + otherAnchor - ownAnchor,
              weight: Math.max(
                1,
                Number(input.edgeSettings?.(edge)?.["priority.straightness"] ?? 1),
              ),
            });
          }
          if (weightedTargets.length === 0) continue;
          weightedTargets.sort((left, right) => left.value - right.value);
          const totalWeight = weightedTargets.reduce((sum, target) => sum + target.weight, 0);
          let cumulative = 0;
          let lowerMedian = weightedTargets[0]!.value;
          let upperMedian = weightedTargets.at(-1)!.value;
          let lowerMedianFound = false;
          for (const target of weightedTargets) {
            cumulative += target.weight;
            if (cumulative >= totalWeight / 2 && !lowerMedianFound) {
              lowerMedian = target.value;
              lowerMedianFound = true;
            }
            if (cumulative > totalWeight / 2) {
              upperMedian = target.value;
              break;
            }
          }
          const upperId = layer[index - 1];
          const lowerId = layer[index + 1];
          const upperRect = upperId ? rectByNodeId.get(upperId) : undefined;
          const lowerRect = lowerId ? rectByNodeId.get(lowerId) : undefined;
          const minimum = upperRect
            ? crossStart(upperRect) +
              (horizontal ? upperRect.height : upperRect.width) +
              nodeNodeSpacing(input, upperId!, id)
            : Number.NEGATIVE_INFINITY;
          const maximum = lowerRect
            ? crossStart(lowerRect) -
              (horizontal ? rect.height : rect.width) -
              nodeNodeSpacing(input, id, lowerId!)
            : Number.POSITIVE_INFINITY;
          const median = input.graph.edges.some((edge) => edge.sourceId === id)
            ? upperMedian
            : lowerMedian;
          rectByNodeId.set(id, setCrossStart(rect, Math.max(minimum, Math.min(maximum, median))));
        }
      }
    }
    const minimumCross = Math.min(...[...rectByNodeId.values()].map(crossStart));
    const desiredMinimum = horizontal ? input.padding.top : input.padding.left;
    for (const [id, rect] of rectByNodeId) {
      rectByNodeId.set(id, setCrossStart(rect, crossStart(rect) + desiredMinimum - minimumCross));
    }
  }

  for (const node of input.graph.nodes) {
    const flexibility = String(
      input.nodeSettings?.(node)?.["nodePlacement.networkSimplex.nodeFlexibility"] ??
        input.settings["nodePlacement.networkSimplex.nodeFlexibility.default"] ??
        "NONE",
    );
    if (flexibility === "NONE") continue;
    const constraints = String(input.nodeSettings?.(node)?.portConstraints ?? "UNDEFINED");
    if (constraints === "FIXED_RATIO" || constraints === "FIXED_POS") continue;
    const rect = rectByNodeId.get(node.id);
    if (!rect) continue;
    const desired = (node.ports ?? []).flatMap((port) => {
      const connected = input.graph.edges.find(
        (edge) =>
          (edge.sourceId === node.id && edge.sourcePort === port.name) ||
          (edge.targetId === node.id && edge.targetPort === port.name),
      );
      if (!connected) return [];
      const oppositeId = connected.sourceId === node.id ? connected.targetId : connected.sourceId;
      const oppositeRect = rectByNodeId.get(oppositeId);
      if (!oppositeRect) return [];
      const portSize = horizontal ? (port.height ?? 8) : (port.width ?? 8);
      const center = horizontal
        ? oppositeRect.y + oppositeRect.height / 2
        : oppositeRect.x + oppositeRect.width / 2;
      return [{ port, center, portSize }];
    });
    if (desired.length === 0) continue;
    const minimumCenter = Math.min(...desired.map((entry) => entry.center));
    const maximumCenter = Math.max(...desired.map((entry) => entry.center));
    const endSize = Math.max(...desired.map((entry) => entry.portSize));
    const requiredSize = maximumCenter - minimumCenter + endSize;
    const mayResize =
      flexibility === "NODE_SIZE" || flexibility === "NODE_SIZE_WHERE_SPACE_PERMITS";
    const currentCrossSize = horizontal ? rect.height : rect.width;
    if (!mayResize && requiredSize > currentCrossSize) {
      const count = desired.length;
      for (const [index, { port, portSize }] of desired.entries()) {
        const center =
          portSize / 2 +
          ((index + 1) * (currentCrossSize - count * portSize)) / (count + 1) +
          index * portSize;
        const axis = Math.round(center - portSize / 2);
        setFlexiblePortPosition(
          port,
          horizontal ? (port.x ?? 0) : axis,
          horizontal ? axis : (port.y ?? 0),
        );
      }
      rectByNodeId.set(
        node.id,
        horizontal ? { ...rect, y: rect.y + 1 } : { ...rect, x: rect.x + 1 },
      );
      continue;
    }
    const resultSize = mayResize ? Math.max(currentCrossSize, requiredSize) : currentCrossSize;
    const crossStart =
      requiredSize <= currentCrossSize
        ? horizontal
          ? rect.y
          : rect.x
        : minimumCenter - endSize / 2;
    rectByNodeId.set(
      node.id,
      horizontal
        ? { ...rect, y: crossStart, height: resultSize }
        : { ...rect, x: crossStart, width: resultSize },
    );
    for (const { port, center, portSize } of desired) {
      const axis = center - crossStart - portSize / 2;
      setFlexiblePortPosition(
        port,
        horizontal ? (port.x ?? 0) : axis,
        horizontal ? axis : (port.y ?? 0),
      );
    }
  }
  let flexiblePortFlowOffset = 0;
  for (const [layerIndex, layer] of order.layers.entries()) {
    if (flexiblePortFlowOffset > 0) {
      for (const id of layer) {
        const rect = rectByNodeId.get(id);
        if (!rect) continue;
        rectByNodeId.set(
          id,
          horizontal
            ? { ...rect, x: rect.x + flexiblePortFlowOffset }
            : { ...rect, y: rect.y + flexiblePortFlowOffset },
        );
      }
    }
    if (layerIndex === order.layers.length - 1) continue;
    flexiblePortFlowOffset += Math.max(
      0,
      ...layer.map((id) => {
        const node = input.graph.nodes.find((candidate) => candidate.id === id);
        const flexibility = String(
          (node && input.nodeSettings?.(node)?.["nodePlacement.networkSimplex.nodeFlexibility"]) ??
            input.settings["nodePlacement.networkSimplex.nodeFlexibility.default"] ??
            "NONE",
        );
        if (flexibility !== "PORT_POSITION") return 0;
        return Math.max(
          0,
          ...(node?.ports ?? []).map(
            (port) => (horizontal ? (port.width ?? 8) : (port.height ?? 8)) + 2,
          ),
        );
      }),
    );
  }
  return { rectByNodeId };
}
