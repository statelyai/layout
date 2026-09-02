/*******************************************************************************
 * Copyright (c) 2010, 2020 Kiel University and others.
 *
 * Translated from ELK v0.11.0 NetworkSimplexLayerer.java and NetworkSimplex.java.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { GraphEdge } from "@statelyai/graph";
import type { AcyclicOrientation, LayerAssigner, LayeredPhaseInput } from "./types";

export interface SimplexNode {
  id: string;
  order: number;
  layer: number;
  incoming: SimplexEdge[];
  outgoing: SimplexEdge[];
  treeNode: boolean;
}

export interface SimplexEdge {
  id: string;
  order: number;
  source: SimplexNode;
  target: SimplexNode;
  weight: number;
  delta: number;
  treeEdge: boolean;
}

function connectedEdges(node: SimplexNode): SimplexEdge[] {
  return [...node.incoming, ...node.outgoing];
}

function otherNode(edge: SimplexEdge, node: SimplexNode): SimplexNode {
  return edge.source === node ? edge.target : edge.source;
}

function getOrientedEndpoints(
  edge: GraphEdge,
  orientation: AcyclicOrientation,
): readonly [string, string] {
  return orientation.reversedEdgeIds.has(edge.id)
    ? [edge.targetId, edge.sourceId]
    : [edge.sourceId, edge.targetId];
}

function getComponents(input: LayeredPhaseInput, orientation: AcyclicOrientation): string[][] {
  const adjacent = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of input.graph.edges) {
    const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
    if (sourceId === targetId) continue;
    adjacent.get(sourceId)?.push(targetId);
    adjacent.get(targetId)?.push(sourceId);
  }
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const node of input.graph.nodes) {
    if (visited.has(node.id)) continue;
    const component: string[] = [];
    visited.add(node.id);
    const stack: Array<{ id: string; index: number }> = [{ id: node.id, index: 0 }];
    component.push(node.id);
    while (stack.length > 0) {
      const frame = stack.at(-1);
      if (!frame) break;
      const nextId = adjacent.get(frame.id)?.[frame.index++];
      if (nextId === undefined) {
        stack.pop();
      } else if (!visited.has(nextId)) {
        visited.add(nextId);
        component.push(nextId);
        stack.push({ id: nextId, index: 0 });
      }
    }
    if (components.length === 0 || component.length > (components[0]?.length ?? 0)) {
      components.unshift(component);
    } else {
      components.push(component);
    }
  }
  return components;
}

function createSimplexGraph(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  component: readonly string[],
): { nodes: SimplexNode[]; edges: SimplexEdge[] } {
  const memberIds = new Set(component);
  const nodes = component.map((id, order): SimplexNode => ({
    id,
    order,
    layer: 0,
    incoming: [],
    outgoing: [],
    treeNode: false,
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeBySource = new Map(component.map((id) => [id, [] as GraphEdge[]]));
  for (const edge of input.graph.edges) {
    const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
    if (sourceId !== targetId && memberIds.has(sourceId) && memberIds.has(targetId)) {
      edgeBySource.get(sourceId)?.push(edge);
    }
  }
  const edges: SimplexEdge[] = [];
  for (const sourceId of component) {
    for (const graphEdge of edgeBySource.get(sourceId) ?? []) {
      const [orientedSourceId, targetId] = getOrientedEndpoints(graphEdge, orientation);
      const source = nodeById.get(orientedSourceId);
      const target = nodeById.get(targetId);
      if (!source || !target) continue;
      const edge: SimplexEdge = {
        id: graphEdge.id,
        order: edges.length,
        source,
        target,
        weight: Math.max(1, input.edgeSettings?.(graphEdge)?.["priority.shortness"] ?? 1),
        delta: 1,
        treeEdge: false,
      };
      edges.push(edge);
      source.outgoing.push(edge);
      target.incoming.push(edge);
    }
  }
  return { nodes, edges };
}

function assignInitialLayers(nodes: readonly SimplexNode[]): void {
  const remainingIncoming = new Map(nodes.map((node) => [node, node.incoming.length]));
  const queue = nodes.filter((node) => node.incoming.length === 0);
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    for (const edge of node.outgoing) {
      edge.target.layer = Math.max(edge.target.layer, node.layer + edge.delta);
      const remaining = (remainingIncoming.get(edge.target) ?? 1) - 1;
      remainingIncoming.set(edge.target, remaining);
      if (remaining === 0) queue.push(edge.target);
    }
  }
}

function growTightTree(
  nodes: readonly SimplexNode[],
  edges: readonly SimplexEdge[],
): SimplexEdge[] {
  if (nodes.length === 0) return [];
  const treeEdges: SimplexEdge[] = [];
  const visitTight = (start: SimplexNode): number => {
    const visitedEdges = new Set<SimplexEdge>();
    const visit = (node: SimplexNode): number => {
      let count = 1;
      node.treeNode = true;
      for (const edge of connectedEdges(node)) {
        if (visitedEdges.has(edge)) continue;
        visitedEdges.add(edge);
        const opposite = otherNode(edge, node);
        if (edge.treeEdge) {
          count += visit(opposite);
        } else if (!opposite.treeNode && edge.target.layer - edge.source.layer === edge.delta) {
          edge.treeEdge = true;
          treeEdges.push(edge);
          count += visit(opposite);
        }
      }
      return count;
    };
    return visit(start);
  };

  while (visitTight(nodes[0] as SimplexNode) < nodes.length) {
    let minimumSlack = Number.POSITIVE_INFINITY;
    let minimumEdge: SimplexEdge | undefined;
    for (const edge of edges) {
      if (edge.source.treeNode === edge.target.treeNode) continue;
      const slack = edge.target.layer - edge.source.layer - edge.delta;
      if (slack < minimumSlack) {
        minimumSlack = slack;
        minimumEdge = edge;
      }
    }
    if (!minimumEdge) throw new Error("Network simplex could not grow a tight tree");
    const shift = minimumEdge.target.treeNode ? -minimumSlack : minimumSlack;
    for (const node of nodes) if (node.treeNode) node.layer += shift;
  }
  return treeEdges;
}

function getHeadComponent(
  nodes: readonly SimplexNode[],
  treeEdges: ReadonlySet<SimplexEdge>,
  removed: SimplexEdge,
): Set<SimplexNode> {
  const head = new Set<SimplexNode>([removed.target]);
  const stack = [removed.target];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    for (const edge of connectedEdges(node)) {
      if (edge === removed || !treeEdges.has(edge)) continue;
      const opposite = otherNode(edge, node);
      if (!head.has(opposite)) {
        head.add(opposite);
        stack.push(opposite);
      }
    }
  }
  if (!head.has(removed.source)) return head;
  const complement = new Set(nodes.filter((node) => !head.has(node)));
  return complement;
}

function getCutValue(
  nodes: readonly SimplexNode[],
  edges: readonly SimplexEdge[],
  treeEdges: ReadonlySet<SimplexEdge>,
  edge: SimplexEdge,
): number {
  const head = getHeadComponent(nodes, treeEdges, edge);
  let value = 0;
  for (const candidate of edges) {
    const sourceInHead = head.has(candidate.source);
    const targetInHead = head.has(candidate.target);
    if (!sourceInHead && targetInHead) value += candidate.weight;
    else if (sourceInHead && !targetInHead) value -= candidate.weight;
  }
  return value;
}

function normalizeAndBalance(
  nodes: readonly SimplexNode[],
  previousLayerCounts: readonly number[] | undefined,
): number[] {
  const lowest = Math.min(...nodes.map((node) => node.layer));
  const highest = Math.max(...nodes.map((node) => node.layer));
  const filling = Array.from({ length: highest - lowest + 1 }, () => 0);
  for (const node of nodes) {
    node.layer -= lowest;
    filling[node.layer] = (filling[node.layer] ?? 0) + 1;
  }
  for (const [layer, count] of previousLayerCounts?.entries() ?? []) {
    if (layer >= filling.length) break;
    filling[layer] = (filling[layer] ?? 0) + count;
  }

  for (const node of nodes) {
    if (node.incoming.length !== node.outgoing.length) continue;
    const minimumIncoming =
      node.incoming.length === 0
        ? -1
        : Math.min(...node.incoming.map((edge) => edge.target.layer - edge.source.layer));
    const minimumOutgoing =
      node.outgoing.length === 0
        ? -1
        : Math.min(...node.outgoing.map((edge) => edge.target.layer - edge.source.layer));
    let newLayer = node.layer;
    for (
      let layer = node.layer - minimumIncoming + 1;
      layer < node.layer + minimumOutgoing;
      layer++
    ) {
      if ((filling[layer] ?? Infinity) < (filling[newLayer] ?? Infinity)) newLayer = layer;
    }
    if ((filling[newLayer] ?? Infinity) < (filling[node.layer] ?? Infinity)) {
      filling[node.layer] = (filling[node.layer] ?? 1) - 1;
      filling[newLayer] = (filling[newLayer] ?? 0) + 1;
      node.layer = newLayer;
    }
  }
  return filling;
}

export function runNetworkSimplex(
  nodes: SimplexNode[],
  _edges: SimplexEdge[],
  iterationLimit: number,
  previousLayerCounts: readonly number[] | undefined,
  balance = true,
): number[] {
  // ELK reindexes edges by walking each auxiliary node's outgoing list.
  // This order decides deterministic ties in tight-tree growth and pivots.
  const orderedEdges = nodes.flatMap((node) => node.outgoing);
  orderedEdges.forEach((edge, index) => (edge.order = index));
  assignInitialLayers(nodes);
  if (orderedEdges.length > 0) {
    const orderedTreeEdges = growTightTree(nodes, orderedEdges);
    const treeEdges = new Set(orderedTreeEdges);
    for (let iteration = 0; iteration < iterationLimit; iteration++) {
      const leave = orderedTreeEdges.find(
        (edge) => edge.treeEdge && getCutValue(nodes, orderedEdges, treeEdges, edge) < -1e-10,
      );
      if (!leave) break;
      const head = getHeadComponent(nodes, treeEdges, leave);
      let entering: SimplexEdge | undefined;
      let minimumSlack = Number.POSITIVE_INFINITY;
      for (const edge of orderedEdges) {
        if (head.has(edge.source) && !head.has(edge.target)) {
          const slack = edge.target.layer - edge.source.layer - edge.delta;
          if (slack < minimumSlack) {
            minimumSlack = slack;
            entering = edge;
          }
        }
      }
      if (!entering) break;
      leave.treeEdge = false;
      treeEdges.delete(leave);
      entering.treeEdge = true;
      treeEdges.add(entering);
      orderedTreeEdges.splice(orderedTreeEdges.indexOf(leave), 1);
      orderedTreeEdges.push(entering);
      let delta = entering.target.layer - entering.source.layer - entering.delta;
      if (!head.has(entering.target)) delta = -delta;
      for (const node of nodes) if (!head.has(node)) node.layer += delta;
    }
  }
  if (balance) return normalizeAndBalance(nodes, previousLayerCounts);
  const lowest = Math.min(...nodes.map((node) => node.layer));
  const highest = Math.max(...nodes.map((node) => node.layer));
  const filling = Array.from({ length: highest - lowest + 1 }, () => 0);
  for (const node of nodes) {
    node.layer -= lowest;
    filling[node.layer] = (filling[node.layer] ?? 0) + 1;
  }
  return filling;
}

export const assignLayersWithNetworkSimplex: LayerAssigner = (input, orientation) => {
  const components = getComponents(input, orientation);
  const layerByNodeId = new Map<string, number>();
  let previousLayerCounts: number[] | undefined;
  const thoroughness = input.settings.thoroughness ?? 7;
  for (const component of components) {
    const { nodes, edges } = createSimplexGraph(input, orientation, component);
    previousLayerCounts = runNetworkSimplex(
      nodes,
      edges,
      thoroughness * 4 * Math.floor(Math.sqrt(nodes.length)),
      previousLayerCounts,
    );
    for (const node of nodes) layerByNodeId.set(node.id, node.layer);
  }
  return { layerByNodeId };
};
