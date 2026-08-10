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
        Math.ceil(crossSize(input, upperId) + input.spacing.node),
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
  return { rectByNodeId };
}
