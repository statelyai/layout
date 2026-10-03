/*******************************************************************************
 * Derived from Eclipse Layout Kernel's Brandes-Koepf node placer.
 * Copyright (c) 2015 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/

import { getCrossingUnits } from "./crossing-constraints";
import type { EntityRect, GraphEdge } from "@statelyai/graph";
import { placeNodesInLayers, placePorts } from "./strategies";
import type { LayerOrder, LayeredPhaseInput, NodePlacement } from "./types";
import { nodeNodeSpacing } from "./spacing";
import { prepareLoopEnvelopes, preparedLoopEnvelopes, recordLoopEnvelopes } from "./loop-envelopes";

import { recordRoutingCoordinates } from "./routing-coordinates";

const beforeMargin = (input: LayeredPhaseInput, id: string) =>
  preparedLoopEnvelopes(input)?.get(id)?.before ?? 0;
const afterMargin = (input: LayeredPhaseInput, id: string) =>
  preparedLoopEnvelopes(input)?.get(id)?.after ?? 0;

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
  if (
    id.startsWith("__layout_breaking:") ||
    id.startsWith("__layout_dummy:inverted:") ||
    id.startsWith("__layout_dummy:north-south:")
  )
    return value;
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
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(input.graph.edges.map((edge) => [edge.id, edge]));
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
  const hasCenteredPorts = (id: string): boolean => {
    const node = nodeById.get(id);
    return (
      input.settings.mergeEdges === true ||
      (node !== undefined && input.nodeSettings?.(node)?.hypernode === true)
    );
  };
  const portAnchor = (
    id: string,
    index: number,
    count: number,
    side: "north" | "south" | "west" | "east",
  ): number => {
    const size = anchorCrossSize(input, id);
    if (hasCenteredPorts(id)) return size / 2;
    const node = nodeById.get(id);
    const settings = node === undefined ? undefined : input.nodeSettings?.(node);
    const constraints = settings?.portConstraints;
    if (constraints === "FIXED_RATIO" || constraints === "FIXED_POS") return 0;
    const alignment =
      settings?.[`portAlignment.${side}`] ??
      settings?.["portAlignment.default"] ??
      (String(settings?.["nodeSize.options"] ?? "")
        .split(/[\s,;]+/)
        .includes("PORTS_OVERHANG")
        ? "CENTER"
        : undefined);
    const spacing = Number(input.settings["spacing.portPort"] ?? 10);
    const surrounding = (
      id.startsWith("__layout_dummy:") ? {} : (input.settings["spacing.portsSurrounding"] ?? {})
    ) as Partial<Record<"top" | "right" | "bottom" | "left", number>>;
    const startValue = side === "north" || side === "south" ? surrounding.left : surrounding.top;
    const endValue = side === "north" || side === "south" ? surrounding.right : surrounding.bottom;
    const start = Math.max(0, Number(startValue ?? 0) - (Number(startValue ?? 0) > 0 ? 1 : 0));
    const end = Math.max(0, Number(endValue ?? 0) - (Number(endValue ?? 0) > 0 ? 1 : 0));
    const available = Math.max(0, size - start - end);
    if (alignment === "BEGIN") return start + index * spacing;
    if (alignment === "END") return start + available - (count - index - 1) * spacing;
    if (alignment === "CENTER")
      return start + (available - (count - 1) * spacing) / 2 + index * spacing;
    if (alignment === "JUSTIFIED")
      return count === 1 ? start + available / 2 : start + (index * available) / (count - 1);
    return start + (available * (index + 1)) / (count + 1);
  };
  const explicitPortAnchor = (id: string, edgeId: string): number | undefined => {
    const node = nodeById.get(id);
    const edge = edgeById.get(edgeId);
    if (!node || !edge) return undefined;
    const portName = edge.sourceId === id ? edge.sourcePort : edge.targetPort;
    if (portName === undefined) return undefined;
    const port = node.ports?.find((candidate) => candidate.name === portName);
    if (!port) return undefined;
    const size = input.sizes.get(id) ?? { width: 0, height: 0 };
    const placed = placePorts(
      node.ports,
      { x: 0, y: 0, ...size },
      input.direction,
      (candidate) => input.portSettings?.(candidate, node),
      { ...input.settings, ...input.nodeSettings?.(node) },
    )?.find((candidate) => candidate.name === portName);
    if (!placed) return undefined;
    const anchor = input.portSettings?.(port, node)?.["port.anchor"] as
      | { x?: number; y?: number }
      | undefined;
    const constraints = input.nodeSettings?.(node)?.portConstraints;
    const sideEntries = right.get(id)?.some((entry) => entry.edgeId === edgeId)
      ? right.get(id)!
      : (left.get(id) ?? []);
    const singlePhysicalPort =
      node.ports?.filter((candidate) => candidate.direction === port.direction).length === 1 &&
      sideEntries.every((entry) => {
        const connected = edgeById.get(entry.edgeId)!;
        return (
          (connected.sourceId === id ? connected.sourcePort : connected.targetPort) === portName
        );
      });
    // A fan-out on one physical port has one anchor, irrespective of edge count.
    if (
      anchor === undefined &&
      constraints !== "FIXED_RATIO" &&
      constraints !== "FIXED_POS" &&
      !singlePhysicalPort
    ) {
      return undefined;
    }
    if (input.direction === "left" || input.direction === "right") {
      const y = placed.y ?? 0;
      const height = placed.height ?? 0;
      const defaultAnchor = y >= size.height ? height : y + height <= 0 ? 0 : height / 2;
      return y + (anchor?.y ?? defaultAnchor);
    }
    const x = placed.x ?? 0;
    const width = placed.width ?? 0;
    const defaultAnchor = x >= size.width ? width : x + width <= 0 ? 0 : width / 2;
    return x + (anchor?.x ?? defaultAnchor);
  };
  const afterSide =
    input.direction === "right"
      ? "east"
      : input.direction === "left"
        ? "west"
        : input.direction === "down"
          ? "south"
          : "north";
  const beforeSide =
    input.direction === "right"
      ? "west"
      : input.direction === "left"
        ? "east"
        : input.direction === "down"
          ? "north"
          : "south";
  const customPortAnchors =
    input.nodeSettings !== undefined ||
    input.settings.mergeEdges === true ||
    input.settings["spacing.portPort"] !== undefined ||
    input.settings["spacing.portsSurrounding"] !== undefined ||
    input.graph.nodes.some((node) => (node.ports?.length ?? 0) > 0);
  const neighborAnchor = (
    id: string,
    edgeId: string,
    index: number,
    count: number,
    side: "north" | "south" | "west" | "east",
  ): number =>
    !customPortAnchors
      ? (anchorCrossSize(input, id) * (index + 1)) / (count + 1)
      : (explicitPortAnchor(id, edgeId) ?? portAnchor(id, index, count, side));
  for (const [id, entries] of right) {
    const sweptOrder = order.outputPortOrderByNodeId?.get(id);
    const interactiveForwardLongEdgeSource =
      input.direction !== "left" &&
      input.settings["crossingMinimization.strategy"] === "INTERACTIVE" &&
      entries.some((entry) => entry.id.startsWith("__layout_dummy:"));
    const portOrder =
      sweptOrder !== undefined
        ? [...entries].sort(
            (leftEntry, rightEntry) =>
              sweptOrder.indexOf(leftEntry.edgeId) - sweptOrder.indexOf(rightEntry.edgeId),
          )
        : interactiveForwardLongEdgeSource
          ? [...entries].sort((leftEntry, rightEntry) => {
              const leftDummy = leftEntry.id.startsWith("__layout_dummy:");
              const rightDummy = rightEntry.id.startsWith("__layout_dummy:");
              return (
                Number(leftDummy) - Number(rightDummy) ||
                (nodeIndex.get(leftEntry.id) ?? 0) - (nodeIndex.get(rightEntry.id) ?? 0)
              );
            })
          : useLayerOrderPorts || entries.some((entry) => entry.id.startsWith("__layout_dummy:"))
            ? entries
            : [...entries].sort(
                (leftEntry, rightEntry) =>
                  (edgeModelOrder.get(leftEntry.edgeId) ?? 0) -
                  (edgeModelOrder.get(rightEntry.edgeId) ?? 0),
              );
    // ELK finds the first connecting edge by walking the source's port list.
    // Parallel edges must follow the selected port order, not root edge order.
    const firstByNeighbor = new Set<string>();
    for (const entry of portOrder) {
      if (firstByNeighbor.has(entry.id)) continue;
      firstByNeighbor.add(entry.id);
      edgeIdByNodePair.set(`${id}\0${entry.id}`, entry.edgeId);
    }
    portOrder.forEach((entry, index) => {
      anchor.set(
        `${entry.edgeId}:${id}`,
        neighborAnchor(id, entry.edgeId, index, entries.length, afterSide),
      );
    });
  }
  for (const [id, entries] of left) {
    const sweptOrder = order.inputPortOrderByNodeId?.get(id);
    const interactiveForwardTargetOrder =
      (input.direction === "up" || input.direction === "right") &&
      input.settings["crossingMinimization.strategy"] === "INTERACTIVE";
    const portOrder =
      sweptOrder !== undefined
        ? [...entries].sort(
            (leftEntry, rightEntry) =>
              sweptOrder.indexOf(rightEntry.edgeId) - sweptOrder.indexOf(leftEntry.edgeId),
          )
        : interactiveForwardTargetOrder
          ? [...entries].sort((leftEntry, rightEntry) => {
              const leftDummy = leftEntry.id.startsWith("__layout_dummy:");
              const rightDummy = rightEntry.id.startsWith("__layout_dummy:");
              return (
                Number(leftDummy) - Number(rightDummy) ||
                (edgeModelOrder.get(leftEntry.edgeId) ?? 0) -
                  (edgeModelOrder.get(rightEntry.edgeId) ?? 0)
              );
            })
          : useLayerOrderPorts || entries.some((entry) => entry.id.startsWith("__layout_dummy:"))
            ? entries
            : [...entries].sort(
                (leftEntry, rightEntry) =>
                  (edgeModelOrder.get(rightEntry.edgeId) ?? 0) -
                  (edgeModelOrder.get(leftEntry.edgeId) ?? 0),
              );
    // getEdge(current, next) walks current's clockwise ports. The reverse
    // sweep must choose from the target's order, independently of the source.
    const firstByNeighbor = new Set<string>();
    for (const entry of [...portOrder].reverse()) {
      if (firstByNeighbor.has(entry.id)) continue;
      firstByNeighbor.add(entry.id);
      edgeIdByNodePair.set(`${id}\0${entry.id}`, entry.edgeId);
    }
    portOrder.forEach((entry, index) => {
      anchor.set(
        `${entry.edgeId}:${id}`,
        neighborAnchor(id, entry.edgeId, index, entries.length, beforeSide),
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
    let above = beforeMargin(input, root);
    let below = crossSize(input, root) + afterMargin(input, root);
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
      above = Math.max(above, beforeMargin(input, next) - nextShift);
      below = Math.max(below, nextShift + crossSize(input, next) + afterMargin(input, next));
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

  const threshold = createStraighteningThreshold(input, order, bal, neighbors);
  const placeBlock = (root: string): void => {
    if (bal.y.has(root)) return;
    bal.y.set(root, 0);
    let assigned = false;
    let bound = bal.vdir === "UP" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    let current = root;
    do {
      const layerNo = neighbors.layerIndex.get(current) ?? 0;
      const layer = order.layers[layerNo] ?? [];
      const index = neighbors.nodeIndex.get(current) ?? 0;
      const neighbor = bal.vdir === "UP" ? layer[index + 1] : layer[index - 1];
      if (neighbor !== undefined) {
        const neighborRoot = bal.root.get(neighbor) ?? neighbor;
        placeBlock(neighborRoot);
        bound = threshold.calculate(bound, root, current);
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
                beforeMargin(input, neighbor) -
                afterMargin(input, current) -
                spacing -
                crossSize(input, current) -
                (bal.innerShift.get(current) ?? 0)
              : (bal.y.get(neighborRoot) ?? 0) +
                (bal.innerShift.get(neighbor) ?? 0) +
                crossSize(input, neighbor) +
                afterMargin(input, neighbor) +
                beforeMargin(input, current) +
                spacing -
                (bal.innerShift.get(current) ?? 0);
          bal.y.set(
            root,
            assigned
              ? bal.vdir === "UP"
                ? Math.min(bal.y.get(root) ?? 0, candidate, bound)
                : Math.max(bal.y.get(root) ?? 0, candidate, bound)
              : bal.vdir === "UP"
                ? Math.min(candidate, bound)
                : Math.max(candidate, bound),
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
                afterMargin(input, current) +
                beforeMargin(input, neighbor) +
                classSpacing -
                (bal.y.get(neighborRoot) ?? 0) -
                (bal.innerShift.get(neighbor) ?? 0)
              : (bal.y.get(root) ?? 0) +
                (bal.innerShift.get(current) ?? 0) -
                beforeMargin(input, current) -
                afterMargin(input, neighbor) -
                (bal.y.get(neighborRoot) ?? 0) -
                (bal.innerShift.get(neighbor) ?? 0) -
                crossSize(input, neighbor) -
                classSpacing;
          addClassEdge(rootSink, neighborSink, separation);
        }
      } else {
        bound = threshold.calculate(bound, root, current);
      }
      current = bal.align.get(current) ?? root;
    } while (current !== root);
    threshold.finish(root);
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
  threshold.postProcess();
}

function extent(input: LayeredPhaseInput, bal: Alignment): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const [id, value] of bal.y) {
    min = Math.min(min, value - beforeMargin(input, id));
    max = Math.max(max, value + crossSize(input, id) + afterMargin(input, id));
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
      const position = positions.get(id) ?? 0;
      const start = position - beforeMargin(input, id);
      const end = position + crossSize(input, id) + afterMargin(input, id);
      if (start <= previousEnd || end <= previousEnd) return false;
      previousEnd = end;
    }
  }
  return true;
}

/** ELK's compaction thresholds and deferred straightening share block state. */
function createStraighteningThreshold(
  input: LayeredPhaseInput,
  order: LayerOrder,
  bal: Alignment,
  neighbors: ReturnType<typeof buildNeighbors>,
) {
  const enabled =
    (input.settings["nodePlacement.bk.edgeStraightening"] ?? "IMPROVE_STRAIGHTNESS") ===
    "IMPROVE_STRAIGHTNESS";
  const invalid = bal.vdir === "UP" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const finished = new Set<string>();
  const used = new Set<string>();
  const blocks = new Map<string, string[]>();
  for (const id of neighbors.layerIndex.keys()) {
    const root = bal.root.get(id) ?? id;
    blocks.set(root, [...(blocks.get(root) ?? []), id]);
  }
  const longEdges = getCrossingUnits(input)?.longEdgeNodes;
  type Pending = { free: string; isRoot: boolean; edge?: GraphEdge; hasEdges?: boolean };
  const queue: Pending[] = [],
    stack: Pending[] = [];
  const rootOf = (id: string) => bal.root.get(id) ?? id;
  const pick = (pending: Pending): Pending => {
    const incoming = pending.isRoot ? bal.hdir === "RIGHT" : bal.hdir === "LEFT";
    const ports = (incoming ? order.inputPortOrderByNodeId : order.outputPortOrderByNodeId)?.get(
      pending.free,
    );
    // Feedback segments retain model direction; BK traverses their layer direction.
    const edges = input.graph.edges
      .filter((edge) => {
        const reversed =
          (neighbors.layerIndex.get(edge.sourceId) ?? 0) >
          (neighbors.layerIndex.get(edge.targetId) ?? 0);
        return (incoming !== reversed ? edge.targetId : edge.sourceId) === pending.free;
      })
      .sort((a, b) => (ports ? ports.indexOf(a.id) - ports.indexOf(b.id) : 0));
    const onlyDummies = (blocks.get(rootOf(pending.free)) ?? []).every(
      (id) =>
        longEdges?.has(id) ??
        (id.startsWith("__layout_dummy:") && !id.startsWith("__layout_dummy:label:")),
    );
    pending.hasEdges = false;
    pending.edge = undefined;
    for (const edge of edges) {
      if (
        !onlyDummies &&
        edge.sourceId !== edge.targetId &&
        neighbors.layerIndex.get(edge.sourceId) === neighbors.layerIndex.get(edge.targetId)
      )
        continue;
      if (used.has(rootOf(pending.free))) continue;
      pending.hasEdges = true;
      const other = edge.sourceId === pending.free ? edge.targetId : edge.sourceId;
      if (finished.has(rootOf(other))) {
        pending.edge = edge;
        return pending;
      }
    }
    return pending;
  };
  const anchor = (edge: GraphEdge, id: string) =>
    neighbors.anchor.get(`${edge.id}:${id}`) ?? crossSize(input, id) / 2;
  const bound = (free: string, isRoot: boolean): number => {
    const pending = pick({ free, isRoot });
    if (!pending.edge) {
      if (pending.hasEdges) queue.push(pending);
      return invalid;
    }
    const edge = pending.edge;
    const other = edge.sourceId === free ? edge.targetId : edge.sourceId;
    const threshold =
      (bal.y.get(rootOf(other)) ?? 0) +
      (bal.innerShift.get(other) ?? 0) +
      anchor(edge, other) -
      (bal.innerShift.get(free) ?? 0) -
      anchor(edge, free);
    used.add(rootOf(edge.sourceId));
    used.add(rootOf(edge.targetId));
    return threshold;
  };
  const calculate = (old: number, root: string, current: string): number => {
    if (!enabled) return invalid;
    const isRoot = root === current,
      isLast = bal.align.get(current) === root;
    if (!isRoot && !isLast) return old;
    let value = old;
    if (isRoot) value = bound(root, true);
    if (!Number.isFinite(value) && isLast) value = bound(current, false);
    return value;
  };
  const process = (pending: Pending): boolean => {
    const edge = pending.edge!;
    const free = pending.free;
    const other = edge.sourceId === free ? edge.targetId : edge.sourceId;
    const delta =
      (bal.y.get(other) ?? 0) + anchor(edge, other) - (bal.y.get(free) ?? 0) - anchor(edge, free);
    if (!Number.isFinite(delta) || delta === 0) return false;
    let available = Math.abs(delta);
    for (const id of blocks.get(rootOf(free)) ?? []) {
      const layer = order.layers[neighbors.layerIndex.get(id) ?? 0] ?? [];
      const index = neighbors.nodeIndex.get(id) ?? 0;
      const adjacent = layer[index + (delta < 0 ? -1 : 1)];
      if (adjacent === undefined) continue;
      const gap =
        delta < 0
          ? (bal.y.get(id) ?? 0) - (bal.y.get(adjacent) ?? 0) - crossSize(input, adjacent)
          : (bal.y.get(adjacent) ?? 0) - (bal.y.get(id) ?? 0) - crossSize(input, id);
      const margins =
        delta < 0
          ? beforeMargin(input, id) + afterMargin(input, adjacent)
          : afterMargin(input, id) + beforeMargin(input, adjacent);
      available = Math.min(available, gap - margins - nodeNodeSpacing(input, id, adjacent));
    }
    for (const id of blocks.get(rootOf(free)) ?? [])
      bal.y.set(id, (bal.y.get(id) ?? 0) + (delta < 0 ? -available : available));
    return available > 0;
  };
  return {
    calculate,
    finish: (root: string) => finished.add(root),
    postProcess: () => {
      if (!enabled) return;
      for (const pending of queue) {
        pick(pending);
        if (!pending.edge) continue;
        if (!process(pending)) stack.push(pending);
      }
      while (stack.length) process(stack.pop()!);
    },
  };
}

/** ELK-compatible Brandes-Koepf placement with port-aware compaction. */
export function placeNodesWithBrandesKoepf(
  input: LayeredPhaseInput,
  order: LayerOrder,
): NodePlacement {
  const envelopes = prepareLoopEnvelopes(input);
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
  const minimum = Math.min(...[...positions].map(([id, value]) => value - beforeMargin(input, id)));
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
  const placement = { rectByNodeId };
  recordRoutingCoordinates(placement, {
    rectByNodeId: new Map(
      [...rectByNodeId].map(([id, rect]) => [
        id,
        input.direction === "left" || input.direction === "right"
          ? { ...rect, y: positions.get(id) ?? 0 }
          : { ...rect, x: positions.get(id) ?? 0 },
      ]),
    ),
  });
  recordLoopEnvelopes(placement, new Set(envelopes.keys()));
  return placement;
}
