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

function crossSize(input: LayeredPhaseInput, id: string): number {
  const size = input.sizes.get(id);
  return input.direction === "left" || input.direction === "right"
    ? (size?.height ?? 0)
    : (size?.width ?? 0);
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
  for (const id of layerIndex.keys()) {
    left.set(id, []);
    right.set(id, []);
  }
  for (const edge of input.graph.edges) {
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
  for (const [id, entries] of right) {
    entries.forEach((entry, index) => {
      anchor.set(
        `${entry.edgeId}:${id}`,
        (crossSize(input, id) * (index + 1)) / (entries.length + 1),
      );
    });
  }
  for (const [id, entries] of left) {
    entries.forEach((entry, index) => {
      anchor.set(
        `${entry.edgeId}:${id}`,
        (crossSize(input, id) * (entries.length - index)) / (entries.length + 1),
      );
    });
  }
  return { layerIndex, nodeIndex, left, right, anchor };
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

function alignBlocks(
  input: LayeredPhaseInput,
  order: LayerOrder,
  bal: Alignment,
  neighbors: ReturnType<typeof buildNeighbors>,
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
    let above = crossSize(input, root) / 2;
    let below = crossSize(input, root) / 2;
    bal.innerShift.set(root, 0);
    let current = root;
    let next = bal.align.get(current) ?? root;
    while (next !== root) {
      const edge = input.graph.edges.find(
        (candidate) =>
          (candidate.sourceId === current && candidate.targetId === next) ||
          (candidate.sourceId === next && candidate.targetId === current),
      );
      const currentAnchor = edge
        ? (neighbors.anchor.get(`${edge.id}:${current}`) ?? crossSize(input, current) / 2)
        : crossSize(input, current) / 2;
      const nextAnchor = edge
        ? (neighbors.anchor.get(`${edge.id}:${next}`) ?? crossSize(input, next) / 2)
        : crossSize(input, next) / 2;
      const nextShift = (bal.innerShift.get(current) ?? 0) + currentAnchor - nextAnchor;
      bal.innerShift.set(next, nextShift);
      above = Math.max(above, crossSize(input, next) / 2 - nextShift);
      below = Math.max(below, nextShift + crossSize(input, next) / 2);
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
          const candidate =
            bal.vdir === "UP"
              ? (bal.y.get(root) ?? 0) +
                (bal.innerShift.get(current) ?? 0) +
                crossSize(input, current) +
                spacing -
                (bal.y.get(neighborRoot) ?? 0) -
                (bal.innerShift.get(neighbor) ?? 0)
              : (bal.y.get(root) ?? 0) +
                (bal.innerShift.get(current) ?? 0) -
                (bal.y.get(neighborRoot) ?? 0) -
                (bal.innerShift.get(neighbor) ?? 0) -
                crossSize(input, neighbor) -
                spacing;
          const previous =
            bal.shift.get(neighborSink) ??
            (bal.vdir === "UP" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);
          bal.shift.set(
            neighborSink,
            bal.vdir === "UP" ? Math.max(previous, candidate) : Math.min(previous, candidate),
          );
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

/** ELK-compatible Brandes-Koepf placement for implicit center ports. */
export function placeNodesWithBrandesKoepf(
  input: LayeredPhaseInput,
  order: LayerOrder,
): NodePlacement {
  const base = placeNodesInLayers(input, order);
  const neighbors = buildNeighbors(input, order);
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
    alignBlocks(input, order, layout, neighbors);
    compact(input, order, layout, neighbors);
    return layout;
  });

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
    positions = new Map();
    for (const id of neighbors.layerIndex.keys()) {
      const values = layouts
        .map((layout, index) => (layout.y.get(id) ?? 0) + shifts[index]!)
        .sort((a, b) => a - b);
      positions.set(id, (values[1]! + values[2]!) / 2);
    }
  } else {
    let chosen = layouts[0]!;
    for (const layout of layouts.slice(1)) {
      const [min, max] = extent(input, layout);
      const [chosenMin, chosenMax] = extent(input, chosen);
      if (max - min < chosenMax - chosenMin) chosen = layout;
    }
    positions = chosen.y;
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
