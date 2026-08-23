/*******************************************************************************
 * Derived from Eclipse Layout Kernel's linear-segments node placer.
 * Copyright (c) 2010, 2015 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/

import type { EntityRect, GraphEdge } from "@statelyai/graph";
import { placeNodesInLayers } from "./strategies";
import type { LayerOrder, LayeredPhaseInput, NodePlacement } from "./types";
import { nodeNodeSpacing } from "./spacing";

interface Segment {
  ids: string[];
  deflection: number;
  weight: number;
  ref?: Segment;
  lastLayer: number;
  indexInLastLayer: number;
}

function crossSize(input: LayeredPhaseInput, id: string): number {
  const size = input.sizes.get(id);
  const value =
    input.direction === "left" || input.direction === "right"
      ? (size?.height ?? 0)
      : (size?.width ?? 0);
  if (value !== 0 || !id.startsWith("__layout_dummy:")) return value;
  return Math.max(
    1,
    ...input.graph.edges
      .filter((edge) => edge.sourceId === id || edge.targetId === id)
      .map((edge) => Number(input.edgeSettings?.(edge)?.["edge.thickness"] ?? 1)),
  );
}

function anchorCrossSize(input: LayeredPhaseInput, id: string): number {
  return id.startsWith("__layout_dummy:") ? 0 : crossSize(input, id);
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
    const sweptOrder = order.outputPortOrderByNodeId?.get(id);
    edges.sort((a, b) =>
      sweptOrder
        ? sweptOrder.indexOf(a.id) - sweptOrder.indexOf(b.id)
        : (index.get(other(a, id)) ?? 0) - (index.get(other(b, id)) ?? 0),
    );
    edges.forEach((edge, edgeNo) =>
      anchors.set(
        `${edge.id}:${id}`,
        (anchorCrossSize(input, id) * (edgeNo + 1)) / (edges.length + 1),
      ),
    );
  }
  for (const [id, edges] of before) {
    const sweptOrder = order.inputPortOrderByNodeId?.get(id);
    edges.sort((a, b) =>
      sweptOrder
        ? sweptOrder.indexOf(b.id) - sweptOrder.indexOf(a.id)
        : (index.get(other(a, id)) ?? 0) - (index.get(other(b, id)) ?? 0),
    );
    const forward =
      sweptOrder !== undefined ||
      (input.settings["crossingMinimization.strategy"] ?? "LAYER_SWEEP") !== "NONE";
    edges.forEach((edge, edgeNo) =>
      anchors.set(
        `${edge.id}:${id}`,
        (anchorCrossSize(input, id) * (forward ? edgeNo + 1 : edges.length - edgeNo)) /
          (edges.length + 1),
      ),
    );
  }
  return { anchors, layer, index };
}

function region(segment: Segment): Segment {
  let current = segment;
  while (current.ref) current = current.ref;
  return current;
}

/** ELK-compatible force-based linear-segments placement. */
export function placeNodesWithLinearSegments(
  input: LayeredPhaseInput,
  order: LayerOrder,
): NodePlacement {
  const base = placeNodesInLayers(input, order);
  const { anchors, layer } = endpointAnchors(input, order);
  const segmentById = new Map<string, Segment>();
  const segments: Segment[] = [];

  // Normal nodes form singleton segments. Consecutive long-edge dummies form one segment.
  for (const ids of order.layers) {
    for (const id of ids) {
      if (segmentById.has(id)) continue;
      const segment: Segment = {
        ids: [id],
        deflection: 0,
        weight: 0,
        lastLayer: -1,
        indexInLastLayer: -1,
      };
      segmentById.set(id, segment);
      if (id.startsWith("__layout_dummy:")) {
        let current = id;
        while (true) {
          const nextEdge = input.graph.edges.find((edge) => edge.sourceId === current);
          if (!nextEdge) break;
          const next = nextEdge.targetId;
          if (!next.startsWith("__layout_dummy:") || segmentById.has(next)) break;
          segment.ids.push(next);
          segmentById.set(next, segment);
          current = next;
        }
      }
      segments.push(segment);
    }
  }

  // Build ELK's segment dependency graph, splitting a chain when its order changes
  // between consecutive layers and would otherwise introduce a cycle.
  const outgoing = new Map<Segment, Segment[]>(segments.map((segment) => [segment, []]));
  const indegree = new Map<Segment, number>(segments.map((segment) => [segment, 0]));
  const addDependency = (source: Segment, target: Segment) => {
    outgoing.get(source)?.push(target);
    indegree.set(target, (indegree.get(target) ?? 0) + 1);
  };
  const removeDependency = (source: Segment, target: Segment) => {
    const targets = outgoing.get(source);
    const index = targets?.indexOf(target) ?? -1;
    if (index < 0 || !targets) return;
    targets.splice(index, 1);
    indegree.set(target, (indegree.get(target) ?? 1) - 1);
  };
  for (const [layerNo, ids] of order.layers.entries()) {
    let previous: Segment | undefined;
    for (const [indexInLayer, id] of ids.entries()) {
      let current = segmentById.get(id);
      if (!current) continue;
      if (current.indexInLastLayer >= 0) {
        const cycle = ids.slice(indexInLayer + 1).some((laterId) => {
          const later = segmentById.get(laterId);
          return (
            later !== undefined &&
            later.lastLayer === current!.lastLayer &&
            later.indexInLastLayer < current!.indexInLastLayer
          );
        });
        if (cycle) {
          if (previous) removeDependency(previous, current);
          const splitIndex = current.ids.indexOf(id);
          const movedIds = current.ids.splice(splitIndex);
          const split: Segment = {
            ids: movedIds,
            deflection: 0,
            weight: 0,
            lastLayer: -1,
            indexInLastLayer: -1,
          };
          for (const movedId of movedIds) segmentById.set(movedId, split);
          segments.push(split);
          outgoing.set(split, []);
          indegree.set(split, 0);
          if (previous) addDependency(previous, split);
          current = split;
        }
      }
      const nextId = ids[indexInLayer + 1];
      const next = nextId === undefined ? undefined : segmentById.get(nextId);
      if (next) addDependency(current, next);
      current.lastLayer = layerNo;
      current.indexInLastLayer = indexInLayer;
      previous = current;
    }
  }
  const queue = segments.filter((segment) => indegree.get(segment) === 0);
  const sorted: Segment[] = [];
  while (queue.length) {
    const segment = queue.shift()!;
    sorted.push(segment);
    for (const target of outgoing.get(segment) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 0) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  for (const segment of segments) if (!sorted.includes(segment)) sorted.push(segment);

  const y = new Map<string, number>();
  const layerExtent = order.layers.map(() => 0);
  const recent = order.layers.map(() => undefined as string | undefined);
  const edgeSpacing = Number(input.settings["spacing.edgeEdge"] ?? 10);
  for (const segment of sorted) {
    let uppermost = 0;
    for (const id of segment.ids) {
      const layerNo = layer.get(id) ?? 0;
      uppermost = Math.max(
        uppermost,
        (layerExtent[layerNo] ?? 0) +
          (recent[layerNo] === undefined
            ? edgeSpacing
            : nodeNodeSpacing(input, recent[layerNo]!, id)),
      );
    }
    for (const id of segment.ids) {
      const layerNo = layer.get(id) ?? 0;
      y.set(id, uppermost);
      layerExtent[layerNo] = uppermost + crossSize(input, id);
      recent[layerNo] = id;
    }
  }

  const incident = new Map<string, GraphEdge[]>();
  for (const id of layer.keys()) incident.set(id, []);
  for (const edge of input.graph.edges) {
    incident.get(edge.sourceId)?.push(edge);
    incident.get(edge.targetId)?.push(edge);
  }
  const inputPriorityById = new Map<string, number>();
  const outputPriorityById = new Map<string, number>();
  for (const id of layer.keys()) {
    const priorities = (predicate: (edge: GraphEdge) => boolean) =>
      Math.max(
        Number.NEGATIVE_INFINITY,
        ...input.graph.edges
          .filter(predicate)
          .map((edge) => Number(input.edgeSettings?.(edge)?.["priority.straightness"] ?? 0)),
      );
    inputPriorityById.set(
      id,
      priorities((edge) => edge.targetId === id),
    );
    outputPriorityById.set(
      id,
      priorities((edge) => edge.sourceId === id),
    );
  }
  const dampening = Number(
    input.settings["nodePlacement.linearSegments.deflectionDampening"] ?? 0.3,
  );
  const thoroughness = Number(input.settings.thoroughness ?? 7);
  let mode: "FORWARD" | "BACKWARD" | "RUBBER" = "FORWARD";
  let pendulumIterations = 4;
  let finalIterations = 3;
  let ready = false;
  let lastTotal = Number.POSITIVE_INFINITY;
  do {
    const incoming = mode !== "BACKWARD";
    const outgoingEdges = mode !== "FORWARD";
    let total = 0;
    for (const segment of sorted) {
      segment.ref = undefined;
      let totalNodeDeflection = 0;
      let nodeWeight = 0;
      for (const id of segment.ids) {
        let nodeDeflection = 0;
        let edgeWeight = 0;
        const minimumPriority = Math.max(
          incoming
            ? (inputPriorityById.get(id) ?? Number.NEGATIVE_INFINITY)
            : Number.NEGATIVE_INFINITY,
          outgoingEdges
            ? (outputPriorityById.get(id) ?? Number.NEGATIVE_INFINITY)
            : Number.NEGATIVE_INFINITY,
        );
        for (const edge of incident.get(id) ?? []) {
          const source = edge.sourceId === id;
          if ((source && !outgoingEdges) || (!source && !incoming)) continue;
          const other = source ? edge.targetId : edge.sourceId;
          if (segmentById.get(other) === segment) continue;
          const priority = Number(input.edgeSettings?.(edge)?.["priority.straightness"] ?? 0);
          const otherPriority = Math.max(
            inputPriorityById.get(other) ?? Number.NEGATIVE_INFINITY,
            outputPriorityById.get(other) ?? Number.NEGATIVE_INFINITY,
          );
          if (priority < minimumPriority || priority < otherPriority) continue;
          const here =
            (y.get(id) ?? 0) + (anchors.get(`${edge.id}:${id}`) ?? crossSize(input, id) / 2);
          const there =
            (y.get(other) ?? 0) +
            (anchors.get(`${edge.id}:${other}`) ?? crossSize(input, other) / 2);
          nodeDeflection += there - here;
          edgeWeight++;
        }
        if (edgeWeight > 0) {
          totalNodeDeflection += nodeDeflection / edgeWeight;
          nodeWeight++;
        }
      }
      segment.deflection = nodeWeight > 0 ? (dampening * totalNodeDeflection) / nodeWeight : 0;
      segment.weight = nodeWeight;
      total += Math.abs(segment.deflection);
    }

    let merged: boolean;
    do {
      merged = false;
      for (const ids of order.layers) {
        for (let i = 1; i < ids.length; i++) {
          const upperId = ids[i - 1]!;
          const lowerId = ids[i]!;
          const upper = region(segmentById.get(upperId)!);
          const lower = region(segmentById.get(lowerId)!);
          if (upper === lower) continue;
          const upperExtent =
            (y.get(upperId) ?? 0) +
            crossSize(input, upperId) +
            upper.deflection +
            nodeNodeSpacing(input, upperId, lowerId);
          const lowerExtent = (y.get(lowerId) ?? 0) + lower.deflection;
          if (upperExtent > lowerExtent + 0.0001 * nodeNodeSpacing(input, upperId, lowerId)) {
            const weight = upper.weight + lower.weight;
            if (weight > 0) {
              lower.deflection =
                (lower.weight * lower.deflection + upper.weight * upper.deflection) / weight;
              lower.weight = weight;
              upper.ref = lower;
              merged = true;
            }
          }
        }
      }
    } while (merged);
    for (const segment of sorted) {
      const displacement = region(segment).deflection;
      for (const id of segment.ids) y.set(id, (y.get(id) ?? 0) + displacement);
    }

    if (mode !== "RUBBER") {
      pendulumIterations--;
      if (pendulumIterations <= 0 && (total < lastTotal || -pendulumIterations > thoroughness)) {
        mode = "RUBBER";
        lastTotal = Number.POSITIVE_INFINITY;
      } else {
        mode = mode === "FORWARD" ? "BACKWARD" : "FORWARD";
        lastTotal = total;
      }
    } else {
      ready = total >= lastTotal || lastTotal - total < 20 / thoroughness;
      lastTotal = total;
      if (ready) finalIterations--;
    }
  } while (!(ready && finalIterations <= 0));

  // ELK's correction pass snaps a segment to the nearest feasible straight incident edge.
  for (const segment of sorted) {
    let roomAbove = Number.POSITIVE_INFINITY;
    let roomBelow = Number.POSITIVE_INFINITY;
    for (const id of segment.ids) {
      const layerNo = layer.get(id) ?? 0;
      const ids = order.layers[layerNo] ?? [];
      const index = ids.indexOf(id);
      const upper = ids[index - 1];
      const lower = ids[index + 1];
      roomAbove = Math.min(
        roomAbove,
        upper === undefined
          ? (y.get(id) ?? 0)
          : (y.get(id) ?? 0) -
              ((y.get(upper) ?? 0) + crossSize(input, upper) + nodeNodeSpacing(input, id, upper)),
      );
      roomBelow = Math.min(
        roomBelow,
        lower === undefined
          ? 2 * (y.get(id) ?? 0)
          : (y.get(lower) ?? 0) -
              ((y.get(id) ?? 0) + crossSize(input, id) + nodeNodeSpacing(input, id, lower)),
      );
    }
    let displacement = Number.POSITIVE_INFINITY;
    const endpointEdges: Array<[string, readonly GraphEdge[]]> = [
      [
        segment.ids[0]!,
        (incident.get(segment.ids[0]!) ?? []).filter((edge) => edge.targetId === segment.ids[0]),
      ],
      [
        segment.ids.at(-1)!,
        (incident.get(segment.ids.at(-1)!) ?? []).filter(
          (edge) => edge.sourceId === segment.ids.at(-1),
        ),
      ],
    ];
    for (const [id, edges] of endpointEdges) {
      for (const edge of edges) {
        const other = edge.sourceId === id ? edge.targetId : edge.sourceId;
        const delta =
          (y.get(other) ?? 0) +
          (anchors.get(`${edge.id}:${other}`) ?? crossSize(input, other) / 2) -
          (y.get(id) ?? 0) -
          (anchors.get(`${edge.id}:${id}`) ?? crossSize(input, id) / 2);
        if (
          Math.abs(delta) < Math.abs(displacement) &&
          Math.abs(delta) < (delta < 0 ? roomAbove : roomBelow)
        ) {
          displacement = delta;
        }
      }
    }
    if (Number.isFinite(displacement) && displacement !== 0) {
      for (const id of segment.ids) y.set(id, (y.get(id) ?? 0) + displacement);
    }
  }

  const minimum = Math.min(...y.values());
  const crossPadding =
    input.direction === "left" || input.direction === "right"
      ? input.padding.top
      : input.padding.left;
  const rectByNodeId = new Map<string, EntityRect>();
  for (const [id, rect] of base.rectByNodeId) {
    const cross = (y.get(id) ?? 0) - minimum + crossPadding;
    rectByNodeId.set(
      id,
      input.direction === "left" || input.direction === "right"
        ? { ...rect, y: cross }
        : { ...rect, x: cross },
    );
  }
  return { rectByNodeId };
}
