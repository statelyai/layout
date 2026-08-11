/*******************************************************************************
 * Derived from Eclipse Layout Kernel's Brandes-Koepf node placer.
 * Copyright (c) 2015 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/

import type { EntityRect } from "@statelyai/graph";
import { placeNodesInLayers } from "./strategies";
import type { LayerOrder, LayeredPhaseInput, NodePlacement } from "./types";
import { nodeNodeSpacing } from "./spacing";

type HDirection = "LEFT" | "RIGHT";
type VDirection = "UP" | "DOWN";

interface Alignment {
  hdir: HDirection;
  vdir: VDirection;
  root: Map<string, string>;
  align: Map<string, string>;
  innerShift: Map<string, number>;
  blockSize: Map<string, number>;
  sink: Map<string, string>;
  shift: Map<string, number>;
  y: Map<string, number>;
}

interface Neighbor {
  id: string;
  edgeId: string;
}

function actualCrossSize(input: LayeredPhaseInput, id: string): number {
  const size = input.sizes.get(id);
  return input.direction === "left" || input.direction === "right"
    ? (size?.height ?? 0)
    : (size?.width ?? 0);
}

function anchorCrossSize(input: LayeredPhaseInput, id: string): number {
  return id.startsWith("__layout_dummy:wrap:") ? 0 : actualCrossSize(input, id);
}

function crossSize(input: LayeredPhaseInput, id: string): number {
  const value = actualCrossSize(input, id);
  if (id.startsWith("__layout_breaking:")) return value;
  if (value !== 0 || (!id.startsWith("__layout_dummy:") && !id.startsWith("__layout_breaking:"))) {
    return value;
  }
  return Math.max(
    1,
    ...input.graph.edges
      .filter((edge) => edge.sourceId === id || edge.targetId === id)
      .map((edge) => Number(input.edgeSettings?.(edge)?.["edge.thickness"] ?? 1)),
  );
}

function buildNeighbors(input: LayeredPhaseInput, order: LayerOrder) {
  const layerIndex = new Map<string, number>();
  const nodeIndex = new Map<string, number>();
  order.layers.forEach((layer, layerNo) =>
    layer.forEach((id, index) => {
      layerIndex.set(id, layerNo);
      nodeIndex.set(id, index);
    }),
  );
  const left = new Map<string, Neighbor[]>();
  const right = new Map<string, Neighbor[]>();
  const anchor = new Map<string, number>();
  const edgeIdByNodePair = new Map<string, string>();
  const edgeModelOrder = new Map(input.graph.edges.map((edge, index) => [edge.id, index]));
  for (const id of layerIndex.keys()) {
    left.set(id, []);
    right.set(id, []);
  }
  for (const edge of input.graph.edges) {
    const forwardPair = `${edge.sourceId}\0${edge.targetId}`;
    const reversePair = `${edge.targetId}\0${edge.sourceId}`;
    if (!edgeIdByNodePair.has(forwardPair)) edgeIdByNodePair.set(forwardPair, edge.id);
    if (!edgeIdByNodePair.has(reversePair)) edgeIdByNodePair.set(reversePair, edge.id);
    const sourceLayer = layerIndex.get(edge.sourceId);
    const targetLayer = layerIndex.get(edge.targetId);
    if (sourceLayer === undefined || targetLayer === undefined || sourceLayer === targetLayer)
      continue;
    const lower = sourceLayer < targetLayer ? edge.sourceId : edge.targetId;
    const upper = sourceLayer < targetLayer ? edge.targetId : edge.sourceId;
    right.get(lower)?.push({ id: upper, edgeId: edge.id });
    left.get(upper)?.push({ id: lower, edgeId: edge.id });
  }
  for (const neighbors of [...left.values(), ...right.values()]) {
    neighbors.sort((a, b) => (nodeIndex.get(a.id) ?? 0) - (nodeIndex.get(b.id) ?? 0));
  }
  const useLayerOrderPorts =
    (input.settings["layerUnzipping.strategy"] ?? "NONE") === "ALTERNATING";
  for (const [id, entries] of right) {
    const sweptOrder = order.outputPortOrderByNodeId?.get(id);
    const interactiveVerticalLongEdgeSource =
      input.direction !== "left" &&
      input.direction !== "right" &&
      input.settings["crossingMinimization.strategy"] === "INTERACTIVE" &&
      entries.some((entry) => entry.id.startsWith("__layout_dummy:"));
    const portOrder =
      sweptOrder !== undefined
        ? [...entries].sort(
            (leftEntry, rightEntry) =>
              sweptOrder.indexOf(leftEntry.edgeId) - sweptOrder.indexOf(rightEntry.edgeId),
          )
        : interactiveVerticalLongEdgeSource
          ? [...entries].sort(
              (leftEntry, rightEntry) =>
                (nodeIndex.get(rightEntry.id) ?? 0) - (nodeIndex.get(leftEntry.id) ?? 0),
            )
          : useLayerOrderPorts || entries.some((entry) => entry.id.startsWith("__layout_dummy:"))
            ? entries
            : [...entries].sort(
                (leftEntry, rightEntry) =>
                  (edgeModelOrder.get(leftEntry.edgeId) ?? 0) -
                  (edgeModelOrder.get(rightEntry.edgeId) ?? 0),
              );
    portOrder.forEach((entry, index) => {
      anchor.set(
        `${entry.edgeId}:${id}`,
        (anchorCrossSize(input, id) * (index + 1)) / (entries.length + 1),
      );
    });
  }
  for (const [id, entries] of left) {
    const sweptOrder = order.inputPortOrderByNodeId?.get(id);
    const portOrder =
      sweptOrder !== undefined
        ? [...entries].sort(
            (leftEntry, rightEntry) =>
              sweptOrder.indexOf(rightEntry.edgeId) - sweptOrder.indexOf(leftEntry.edgeId),
          )
        : useLayerOrderPorts || entries.some((entry) => entry.id.startsWith("__layout_dummy:"))
          ? entries
          : [...entries].sort(
              (leftEntry, rightEntry) =>
                (edgeModelOrder.get(rightEntry.edgeId) ?? 0) -
                (edgeModelOrder.get(leftEntry.edgeId) ?? 0),
            );
    portOrder.forEach((entry, index) => {
      anchor.set(
        `${entry.edgeId}:${id}`,
        (anchorCrossSize(input, id) * (index + 1)) / (entries.length + 1),
      );
    });
  }
  return { layerIndex, nodeIndex, left, right, anchor, edgeIdByNodePair };
}

function makeAlignment(hdir: HDirection, vdir: VDirection): Alignment {
  return {
    hdir,
    vdir,
    root: new Map(),
    align: new Map(),
    innerShift: new Map(),
    blockSize: new Map(),
    sink: new Map(),
    shift: new Map(),
    y: new Map(),
  };
}

function markConflicts(
  order: LayerOrder,
  neighbors: ReturnType<typeof buildNeighbors>,
): Set<string> {
  const marked = new Set<string>();
  if (order.layers.length < 3) return marked;
  const isInner = (id: string): boolean =>
    id.startsWith("__layout_dummy:") &&
    (neighbors.left.get(id) ?? []).some((neighbor) => neighbor.id.startsWith("__layout_dummy:"));
  for (let previousLayerNo = 1; previousLayerNo + 1 < order.layers.length; previousLayerNo++) {
    const previousLayer = order.layers[previousLayerNo]!;
    const currentLayer = order.layers[previousLayerNo + 1]!;
    let lowerBound = 0;
    let scan = 0;
    for (let currentIndex = 0; currentIndex < currentLayer.length; currentIndex++) {
      const id = currentLayer[currentIndex]!;
      const inner = isInner(id);
      if (currentIndex !== currentLayer.length - 1 && !inner) continue;
      const upperBound = inner
        ? (neighbors.nodeIndex.get(neighbors.left.get(id)?.[0]?.id ?? "") ??
          previousLayer.length - 1)
        : previousLayer.length - 1;
      while (scan <= currentIndex) {
        const scannedId = currentLayer[scan++]!;
        if (isInner(scannedId)) continue;
        for (const neighbor of neighbors.left.get(scannedId) ?? []) {
          const index = neighbors.nodeIndex.get(neighbor.id) ?? 0;
          if (index < lowerBound || index > upperBound) marked.add(neighbor.edgeId);
        }
      }
      lowerBound = upperBound;
    }
  }
  return marked;
}

function alignBlocks(
  input: LayeredPhaseInput,
  order: LayerOrder,
  bal: Alignment,
  neighbors: ReturnType<typeof buildNeighbors>,
  markedEdges: ReadonlySet<string>,
): void {
  for (const layer of order.layers) {
    for (const id of layer) {
      bal.root.set(id, id);
      bal.align.set(id, id);
      bal.innerShift.set(id, 0);
    }
  }
  const layers = bal.hdir === "LEFT" ? [...order.layers].reverse() : order.layers;
  for (const originalLayer of layers) {
    let r = bal.vdir === "UP" ? Number.POSITIVE_INFINITY : -1;
    const layer = bal.vdir === "UP" ? [...originalLayer].reverse() : originalLayer;
    for (const id of layer) {
      const adjacent = (bal.hdir === "LEFT" ? neighbors.right : neighbors.left).get(id) ?? [];
      const low = Math.floor((adjacent.length + 1) / 2) - 1;
      const high = Math.ceil((adjacent.length + 1) / 2) - 1;
      const indices =
        bal.vdir === "UP"
          ? Array.from({ length: Math.max(0, high - low + 1) }, (_, i) => high - i)
          : Array.from({ length: Math.max(0, high - low + 1) }, (_, i) => low + i);
      for (const median of indices) {
        if (bal.align.get(id) !== id) break;
        const neighbor = adjacent[median];
        if (neighbor === undefined) continue;
        if (markedEdges.has(neighbor.edgeId)) continue;
        const index = neighbors.nodeIndex.get(neighbor.id) ?? 0;
        if ((bal.vdir === "UP" && r > index) || (bal.vdir === "DOWN" && r < index)) {
          bal.align.set(neighbor.id, id);
          bal.root.set(id, bal.root.get(neighbor.id) ?? neighbor.id);
          bal.align.set(id, bal.root.get(id) ?? id);
          r = index;
        }
      }
    }
  }

  const roots = new Set(bal.root.values());
  for (const root of roots) {
    let above = 0;
    let below = crossSize(input, root);
    bal.innerShift.set(root, 0);
    let current = root;
    let next = bal.align.get(current) ?? root;
    while (next !== root) {
      const edgeId = neighbors.edgeIdByNodePair.get(`${current}\0${next}`);
      const currentAnchor = edgeId
        ? (neighbors.anchor.get(`${edgeId}:${current}`) ?? anchorCrossSize(input, current) / 2)
        : anchorCrossSize(input, current) / 2;
      const nextAnchor = edgeId
        ? (neighbors.anchor.get(`${edgeId}:${next}`) ?? anchorCrossSize(input, next) / 2)
        : anchorCrossSize(input, next) / 2;
      const nextShift = (bal.innerShift.get(current) ?? 0) + currentAnchor - nextAnchor;
      bal.innerShift.set(next, nextShift);
      above = Math.max(above, -nextShift);
      below = Math.max(below, nextShift + crossSize(input, next));
      current = next;
      next = bal.align.get(current) ?? root;
    }
    current = root;
    do {
      bal.innerShift.set(current, (bal.innerShift.get(current) ?? 0) + above);
      current = bal.align.get(current) ?? root;
    } while (current !== root);
    bal.blockSize.set(root, above + below);
  }
}

function compact(
  input: LayeredPhaseInput,
  order: LayerOrder,
  bal: Alignment,
  neighbors: ReturnType<typeof buildNeighbors>,
): void {
  for (const layer of order.layers) {
    for (const id of layer) {
      bal.sink.set(id, id);
      bal.shift.set(id, bal.vdir === "UP" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);
    }
  }
  const classEdges = new Map<string, Array<{ target: string; separation: number }>>();
  const classIndegree = new Map<string, number>();
  const addClassEdge = (source: string, target: string, separation: number): void => {
    const edges = classEdges.get(source) ?? [];
    edges.push({ target, separation });
    classEdges.set(source, edges);
    if (!classEdges.has(target)) classEdges.set(target, []);
    classIndegree.set(source, classIndegree.get(source) ?? 0);
    classIndegree.set(target, (classIndegree.get(target) ?? 0) + 1);
  };

  const placeBlock = (root: string): void => {
    if (bal.y.has(root)) return;
    bal.y.set(root, 0);
    let assigned = false;
    let current = root;
    do {
      const layerNo = neighbors.layerIndex.get(current) ?? 0;
      const layer = order.layers[layerNo] ?? [];
      const index = neighbors.nodeIndex.get(current) ?? 0;
      const neighbor = bal.vdir === "UP" ? layer[index + 1] : layer[index - 1];
      if (neighbor !== undefined) {
        const neighborRoot = bal.root.get(neighbor) ?? neighbor;
        placeBlock(neighborRoot);
        if (bal.sink.get(root) === root)
          bal.sink.set(root, bal.sink.get(neighborRoot) ?? neighborRoot);
        const rootSink = bal.sink.get(root) ?? root;
        const neighborSink = bal.sink.get(neighborRoot) ?? neighborRoot;
        const spacing = nodeNodeSpacing(input, current, neighbor);
        if (rootSink === neighborSink) {
          const candidate =
            bal.vdir === "UP"
              ? (bal.y.get(neighborRoot) ?? 0) +
                (bal.innerShift.get(neighbor) ?? 0) -
                spacing -
                crossSize(input, current) -
                (bal.innerShift.get(current) ?? 0)
              : (bal.y.get(neighborRoot) ?? 0) +
                (bal.innerShift.get(neighbor) ?? 0) +
                crossSize(input, neighbor) +
                spacing -
                (bal.innerShift.get(current) ?? 0);
          bal.y.set(
            root,
            assigned
              ? bal.vdir === "UP"
                ? Math.min(bal.y.get(root) ?? 0, candidate)
                : Math.max(bal.y.get(root) ?? 0, candidate)
              : candidate,
          );
          assigned = true;
        } else {
          // ELK deliberately uses the global node-node spacing when it builds
          // the class graph. Type-specific spacing only applies within a class.
          const classSpacing = input.spacing.node;
          const separation =
            bal.vdir === "UP"
              ? (bal.y.get(root) ?? 0) +
                (bal.innerShift.get(current) ?? 0) +
                crossSize(input, current) +
                classSpacing -
                (bal.y.get(neighborRoot) ?? 0) -
                (bal.innerShift.get(neighbor) ?? 0)
              : (bal.y.get(root) ?? 0) +
                (bal.innerShift.get(current) ?? 0) -
                (bal.y.get(neighborRoot) ?? 0) -
                (bal.innerShift.get(neighbor) ?? 0) -
                crossSize(input, neighbor) -
                classSpacing;
          addClassEdge(rootSink, neighborSink, separation);
        }
      }
      current = bal.align.get(current) ?? root;
    } while (current !== root);
  };

  const layers = bal.hdir === "LEFT" ? [...order.layers].reverse() : order.layers;
  for (const originalLayer of layers) {
    const layer = bal.vdir === "UP" ? [...originalLayer].reverse() : originalLayer;
    for (const id of layer) if (bal.root.get(id) === id) placeBlock(id);
  }
  const classShift = new Map<string, number>();
  const queue = [...classEdges.keys()].filter((id) => (classIndegree.get(id) ?? 0) === 0);
  for (let index = 0; index < queue.length; index++) {
    const source = queue[index]!;
    const sourceShift = classShift.get(source) ?? 0;
    classShift.set(source, sourceShift);
    for (const edge of classEdges.get(source) ?? []) {
      const candidate = sourceShift + edge.separation;
      const previous = classShift.get(edge.target);
      classShift.set(
        edge.target,
        previous === undefined
          ? candidate
          : bal.vdir === "DOWN"
            ? Math.min(previous, candidate)
            : Math.max(previous, candidate),
      );
      const indegree = (classIndegree.get(edge.target) ?? 1) - 1;
      classIndegree.set(edge.target, indegree);
      if (indegree === 0) queue.push(edge.target);
    }
  }
  for (const [id, shift] of classShift) bal.shift.set(id, shift);
  const rootPositions = new Map(bal.y);
  for (const layer of layers) {
    for (const id of layer) {
      const root = bal.root.get(id) ?? id;
      let value = rootPositions.get(root) ?? 0;
      const sinkShift = bal.shift.get(bal.sink.get(root) ?? root);
      if (sinkShift !== undefined && Number.isFinite(sinkShift)) value += sinkShift;
      bal.y.set(id, value + (bal.innerShift.get(id) ?? 0));
    }
  }
}

function extent(input: LayeredPhaseInput, bal: Alignment): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const [id, value] of bal.y) {
    min = Math.min(min, value);
    max = Math.max(max, value + crossSize(input, id));
  }
  return [min, max];
}

function preservesLayerOrder(
  input: LayeredPhaseInput,
  order: LayerOrder,
  positions: ReadonlyMap<string, number>,
): boolean {
  for (const layer of order.layers) {
    let previousEnd = Number.NEGATIVE_INFINITY;
    for (const id of layer) {
      const start = positions.get(id) ?? 0;
      const end = start + crossSize(input, id);
      if (start <= previousEnd || end <= previousEnd) return false;
      previousEnd = end;
    }
  }
  return true;
}

function improveEdgeStraightness(
  input: LayeredPhaseInput,
  order: LayerOrder,
  bal: Alignment,
  neighbors: ReturnType<typeof buildNeighbors>,
): void {
  if (input.settings["nodePlacement.bk.edgeStraightening"] !== "IMPROVE_STRAIGHTNESS") {
    return;
  }
  const lockedRoots = new Set<string>();
  const nodesByRoot = new Map<string, string[]>();
  for (const id of neighbors.layerIndex.keys()) {
    const root = bal.root.get(id) ?? id;
    const nodes = nodesByRoot.get(root) ?? [];
    nodes.push(id);
    nodesByRoot.set(root, nodes);
  }
  const canShift = (root: string, delta: number): boolean =>
    (nodesByRoot.get(root) ?? []).every((id) => {
      const candidate = (bal.y.get(id) ?? 0) + delta;
      const end = candidate + crossSize(input, id);
      const layer = order.layers[neighbors.layerIndex.get(id) ?? 0] ?? [];
      return layer.every((otherId) => {
        if ((bal.root.get(otherId) ?? otherId) === root) return true;
        const other = bal.y.get(otherId) ?? 0;
        const spacing = nodeNodeSpacing(input, id, otherId);
        return end + spacing <= other || other + crossSize(input, otherId) + spacing <= candidate;
      });
    });
  const layers = bal.hdir === "LEFT" ? [...order.layers].reverse() : order.layers;
  for (const layer of layers) {
    const nodes = bal.vdir === "UP" ? [...layer].reverse() : layer;
    for (const [traversalIndex, id] of nodes.entries()) {
      if (traversalIndex === 0) continue;
      const root = bal.root.get(id) ?? id;
      if (lockedRoots.has(root) || root !== id) continue;
      const candidateEdges = input.graph.edges.filter((edge) =>
        bal.hdir === "RIGHT" ? edge.targetId === id : edge.sourceId === id,
      );
      const edge = candidateEdges.find((candidate) => {
        const otherId = candidate.sourceId === id ? candidate.targetId : candidate.sourceId;
        return !lockedRoots.has(bal.root.get(otherId) ?? otherId);
      });
      if (!edge) continue;
      const otherId = edge.sourceId === id ? edge.targetId : edge.sourceId;
      const currentAnchor = neighbors.anchor.get(`${edge.id}:${id}`) ?? crossSize(input, id) / 2;
      const otherAnchor =
        neighbors.anchor.get(`${edge.id}:${otherId}`) ?? crossSize(input, otherId) / 2;
      const desired = (bal.y.get(otherId) ?? 0) + otherAnchor - currentAnchor;
      const delta = desired - (bal.y.get(id) ?? 0);
      if (
        ((bal.vdir === "DOWN" && delta > 0) || (bal.vdir === "UP" && delta < 0)) &&
        canShift(root, delta)
      ) {
        for (const blockNode of nodesByRoot.get(root) ?? []) {
          bal.y.set(blockNode, (bal.y.get(blockNode) ?? 0) + delta);
        }
        lockedRoots.add(root);
        lockedRoots.add(bal.root.get(otherId) ?? otherId);
      }
    }
  }
}

/** ELK-compatible Brandes-Koepf placement for implicit center ports. */
export function placeNodesWithBrandesKoepf(
  input: LayeredPhaseInput,
  order: LayerOrder,
): NodePlacement {
  const base = placeNodesInLayers(input, order);
  const neighbors = buildNeighbors(input, order);
  const markedEdges = markConflicts(order, neighbors);
  const fixed = String(input.settings["nodePlacement.bk.fixedAlignment"] ?? "NONE");
  const requested: Array<[HDirection, VDirection]> =
    fixed === "LEFTDOWN"
      ? [["LEFT", "DOWN"]]
      : fixed === "LEFTUP"
        ? [["LEFT", "UP"]]
        : fixed === "RIGHTDOWN"
          ? [["RIGHT", "DOWN"]]
          : fixed === "RIGHTUP"
            ? [["RIGHT", "UP"]]
            : [
                ["RIGHT", "DOWN"],
                ["RIGHT", "UP"],
                ["LEFT", "DOWN"],
                ["LEFT", "UP"],
              ];
  const layouts = requested.map(([hdir, vdir]) => {
    const layout = makeAlignment(hdir, vdir);
    alignBlocks(input, order, layout, neighbors, markedEdges);
    compact(input, order, layout, neighbors);
    improveEdgeStraightness(input, order, layout, neighbors);
    return layout;
  });
  const smallestFeasibleLayout = (): Alignment => {
    let chosen: Alignment | undefined;
    for (const layout of layouts) {
      if (!preservesLayerOrder(input, order, layout.y)) continue;
      if (chosen === undefined) {
        chosen = layout;
        continue;
      }
      const [min, max] = extent(input, layout);
      const [chosenMin, chosenMax] = extent(input, chosen);
      if (max - min < chosenMax - chosenMin) chosen = layout;
    }
    return chosen ?? layouts[0]!;
  };

  let positions: Map<string, number>;
  const favorStraight =
    input.settings["nodePlacement.favorStraightEdges"] === undefined
      ? (input.settings.edgeRouting ?? "ORTHOGONAL") === "ORTHOGONAL"
      : Boolean(input.settings["nodePlacement.favorStraightEdges"]);
  if (layouts.length === 4 && (fixed === "BALANCED" || (fixed === "NONE" && !favorStraight))) {
    const extents = layouts.map((layout) => extent(input, layout));
    let smallest = 0;
    for (let i = 1; i < layouts.length; i++) {
      if (extents[i]![1] - extents[i]![0] < extents[smallest]![1] - extents[smallest]![0])
        smallest = i;
    }
    const shifts = layouts.map((layout, index) =>
      layout.vdir === "DOWN"
        ? extents[smallest]![0] - extents[index]![0]
        : extents[smallest]![1] - extents[index]![1],
    );
    const balanced = new Map<string, number>();
    for (const id of neighbors.layerIndex.keys()) {
      const values = layouts
        .map((layout, index) => (layout.y.get(id) ?? 0) + shifts[index]!)
        .sort((a, b) => a - b);
      balanced.set(id, (values[1]! + values[2]!) / 2);
    }
    positions = preservesLayerOrder(input, order, balanced) ? balanced : smallestFeasibleLayout().y;
  } else {
    positions = smallestFeasibleLayout().y;
  }
  const minimum = Math.min(...positions.values());
  const crossPadding =
    input.direction === "left" || input.direction === "right"
      ? input.padding.top
      : input.padding.left;
  const rectByNodeId = new Map<string, EntityRect>();
  for (const [id, rect] of base.rectByNodeId) {
    const cross = (positions.get(id) ?? 0) - minimum + crossPadding;
    rectByNodeId.set(
      id,
      input.direction === "left" || input.direction === "right"
        ? { ...rect, y: cross }
        : { ...rect, x: cross },
    );
  }
  return { rectByNodeId };
}
