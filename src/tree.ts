/*******************************************************************************
 * Copyright (c) 2009, 2017 Kiel University and others.
 * Derived from ELK v0.11.0 DFSTreeifyer, NodePlacer and EadesRadial.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { Graph, VisualGraph } from "@statelyai/graph";
import { LayoutError } from "./errors";
import {
  adjacency,
  components,
  finishProvider,
  graphProviderCapabilities,
  nonnegative,
  providerGraph,
  type GraphProviderOptions,
} from "./internal/graph-provider";
import type { LayoutAlgorithm, LayoutDirection } from "./types";

export interface TreeLayoutOptions extends GraphProviderOptions {
  direction?: LayoutDirection;
  /** Separation between consecutive levels. */
  layerSpacing?: number;
  rootId?: string;
}
export interface RadialLayoutOptions extends GraphProviderOptions {
  radius?: number;
  rootId?: string;
  /** Angular offset in radians. */
  rotation?: number;
}

interface TreeNode {
  id: string;
  children: TreeNode[];
  depth: number;
  width: number;
  height: number;
  span: number;
  leaves: number;
}

interface GraphIndex {
  nodes: ReadonlyMap<string, VisualGraph["nodes"][number]>;
  neighbors: ReadonlyMap<string, readonly string[]>;
  indegree: ReadonlyMap<string, number>;
  outgoingCount: ReadonlyMap<string, number>;
}

function graphIndex(graph: VisualGraph): GraphIndex {
  const indegree = new Map<string, number>();
  const outgoingCount = new Map<string, number>();
  for (const edge of graph.edges) {
    indegree.set(edge.targetId, (indegree.get(edge.targetId) ?? 0) + 1);
    outgoingCount.set(edge.sourceId, (outgoingCount.get(edge.sourceId) ?? 0) + 1);
  }
  return {
    nodes: new Map(graph.nodes.map((node) => [node.id, node])),
    neighbors: adjacency(graph),
    indegree,
    outgoingCount,
  };
}

function spanningTree(
  index: GraphIndex,
  ids: readonly string[],
  rootId: string | undefined,
  radial: boolean,
): { root: TreeNode; order: TreeNode[] } {
  const members = new Set(ids);
  const chosen =
    rootId && members.has(rootId)
      ? rootId
      : (ids.find((id) => (index.indegree.get(id) ?? 0) === 0) ?? ids[0]);
  if (chosen === undefined)
    throw new LayoutError("Cannot root an empty component", "INVALID_GRAPH");
  const makeNode = (id: string, depth: number): TreeNode => {
    const node = index.nodes.get(id);
    return {
      id,
      depth,
      children: [],
      width: node?.width ?? 0,
      height: node?.height ?? 0,
      span: 0,
      leaves: 0,
    };
  };
  if (
    radial &&
    ids.reduce((sum, id) => sum + (index.outgoingCount.get(id) ?? 0), 0) !== ids.length - 1
  ) {
    throw new LayoutError(
      "Radial layout requires a tree in each connected component",
      "GRAPH_NOT_TREE",
    );
  }
  const root = makeNode(chosen, 0);
  const order = [root];
  const seen = new Set([chosen]);
  const stack = [{ node: root, next: 0 }];
  while (stack.length) {
    const frame = stack[stack.length - 1]!;
    const next = index.neighbors.get(frame.node.id)?.[frame.next++];
    if (next === undefined) {
      stack.pop();
      continue;
    }
    if (seen.has(next)) continue;
    seen.add(next);
    const child = makeNode(next, frame.node.depth + 1);
    frame.node.children.push(child);
    order.push(child);
    stack.push({ node: child, next: 0 });
  }
  for (let index = order.length - 1; index >= 0; index--) {
    const node = order[index]!;
    node.leaves = Math.max(
      1,
      node.children.reduce((sum, child) => sum + child.leaves, 0),
    );
  }
  return { root, order };
}

/** Ordered spanning-tree layout, with subtree spans and level-size separation. */
export function getTreeLayout<N, E, G, P>(
  input: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: TreeLayoutOptions = {},
): VisualGraph<N, E, G, P> {
  const graph = providerGraph(input, options);
  if (options.rootId !== undefined && !graph.nodes.some((node) => node.id === options.rootId))
    throw new LayoutError("Unknown rootId", "INVALID_OPTIONS");
  const spacing = nonnegative(options.spacing, 20, "spacing");
  const layerSpacing = nonnegative(options.layerSpacing, spacing, "layerSpacing");
  const direction = options.direction ?? input.direction ?? "down";
  const vertical = direction === "down" || direction === "up";
  const index = graphIndex(graph);
  const positions = new Map<string, { x: number; y: number }>();
  let componentOffset = 0;
  for (const ids of components(graph)) {
    const { root: tree, order } = spanningTree(index, ids, options.rootId, false);
    const levels: number[] = [];
    for (let index = order.length - 1; index >= 0; index--) {
      const node = order[index]!;
      levels[node.depth] = Math.max(levels[node.depth] ?? 0, vertical ? node.height : node.width);
      const childSpan =
        node.children.reduce((sum, child) => sum + child.span, 0) +
        Math.max(0, node.children.length - 1) * spacing;
      node.span = Math.max(vertical ? node.width : node.height, childSpan);
    }
    const offsets: number[] = [];
    let offset = 0;
    for (const height of levels) {
      offsets.push(offset);
      offset += height + layerSpacing;
    }
    const starts = new Map([[tree.id, 0]]);
    for (const node of order) {
      const start = starts.get(node.id) ?? 0;
      const crossSize = vertical ? node.width : node.height;
      const cross = start + (node.span - crossSize) / 2 + componentOffset;
      const axis = offsets[node.depth] ?? 0;
      positions.set(node.id, vertical ? { x: cross, y: axis } : { x: axis, y: cross });
      const total =
        node.children.reduce((sum, child) => sum + child.span, 0) +
        Math.max(0, node.children.length - 1) * spacing;
      let cursor = start + (node.span - total) / 2;
      for (const child of node.children) {
        starts.set(child.id, cursor);
        cursor += child.span + spacing;
      }
    }
    componentOffset += tree.span + spacing;
  }
  let nodes = graph.nodes.map((node) => ({ ...node, ...positions.get(node.id) }));
  const maxX = Math.max(0, ...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(0, ...nodes.map((node) => node.y + node.height));
  if (direction === "up")
    nodes = nodes.map((node) => ({ ...node, y: maxY - node.y - node.height }));
  if (direction === "left")
    nodes = nodes.map((node) => ({ ...node, x: maxX - node.x - node.width }));
  return finishProvider({ ...graph, direction, nodes }, options, 20);
}

/** Eades tree wedges weighted by descendant leaf count. */
export function getRadialLayout<N, E, G, P>(
  input: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: RadialLayoutOptions = {},
): VisualGraph<N, E, G, P> {
  const graph = providerGraph(input, options);
  if (options.rootId !== undefined && !graph.nodes.some((node) => node.id === options.rootId))
    throw new LayoutError("Unknown rootId", "INVALID_OPTIONS");
  const spacing = nonnegative(options.spacing, 20, "spacing");
  const radius = nonnegative(options.radius, 100, "radius");
  if (!Number.isFinite(options.rotation ?? 0))
    throw new LayoutError("rotation must be finite", "INVALID_OPTIONS");
  const index = graphIndex(graph);
  const positions = new Map<string, { x: number; y: number }>();
  let componentOffset = 0;
  for (const ids of components(graph)) {
    const { root: tree, order } = spanningTree(index, ids, options.rootId, true);
    const local = ids.map((id) => index.nodes.get(id)!);
    const maxSize = Math.max(0, ...local.map((node) => Math.hypot(node.width, node.height)));
    const step = Math.max(radius, maxSize + spacing);
    const wedges = new Map([[tree.id, { start: 0, end: 2 * Math.PI }]]);
    for (const node of order) {
      const { start, end } = wedges.get(node.id)!;
      const angle = (start + end) / 2 + (options.rotation ?? 0);
      positions.set(node.id, {
        x: node.depth * step * Math.cos(angle) - node.width / 2,
        y: node.depth * step * Math.sin(angle) - node.height / 2,
      });
      let cursor = start;
      for (const child of node.children) {
        const wedge = ((end - start) * child.leaves) / node.leaves;
        wedges.set(child.id, { start: cursor, end: cursor + wedge });
        cursor += wedge;
      }
    }
    let expansion = 1;
    for (let i = 0; i < local.length; i++)
      for (let j = i + 1; j < local.length; j++) {
        const a = local[i]!,
          b = local[j]!;
        const pa = positions.get(a.id)!,
          pb = positions.get(b.id)!;
        const dx = Math.abs(pa.x + a.width / 2 - pb.x - b.width / 2);
        const dy = Math.abs(pa.y + a.height / 2 - pb.y - b.height / 2);
        const requiredX = (a.width + b.width) / 2 + spacing;
        const requiredY = (a.height + b.height) / 2 + spacing;
        const factorX = requiredX === 0 ? 0 : dx === 0 ? Infinity : requiredX / dx;
        const factorY = requiredY === 0 ? 0 : dy === 0 ? Infinity : requiredY / dy;
        expansion = Math.max(expansion, Math.min(factorX, factorY));
      }
    for (const node of local) {
      const point = positions.get(node.id)!;
      point.x = (point.x + node.width / 2) * expansion - node.width / 2;
      point.y = (point.y + node.height / 2) * expansion - node.height / 2;
    }
    const minX = Math.min(...local.map((node) => positions.get(node.id)?.x ?? 0));
    const maxX = Math.max(...local.map((node) => (positions.get(node.id)?.x ?? 0) + node.width));
    for (const id of ids) {
      const point = positions.get(id);
      if (point) point.x += componentOffset - minX;
    }
    componentOffset += maxX - minX + spacing;
  }
  return finishProvider(
    { ...graph, nodes: graph.nodes.map((node) => ({ ...node, ...positions.get(node.id) })) },
    options,
    12,
  );
}

export const treeAlgorithm: LayoutAlgorithm<TreeLayoutOptions> = {
  id: "mrtree",
  capabilities: graphProviderCapabilities,
  layout: (graph, options) => getTreeLayout(graph, options),
};
export const radialAlgorithm: LayoutAlgorithm<RadialLayoutOptions> = {
  id: "radial",
  capabilities: graphProviderCapabilities,
  layout: (graph, options) => getRadialLayout(graph, options),
};
