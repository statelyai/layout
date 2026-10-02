/*
 * Copyright (c) 2012, 2017 Kiel University and others.
 * Native adaptation of ELK LabelDummySwitcher (v0.11.0).
 * SPDX-License-Identifier: EPL-2.0
 */
import type { GraphEdge } from "@statelyai/graph";
import type { LayerOrder } from "./types";
import type { LongEdgeExpansion } from "./long-edges";
import type { CenterLabelExpansion } from "./center-labels";
import { inheritCycleRandom } from "./cycle-random";

/** Before placement: move labels along their own proper long-edge chain without changing crossing order. */
export function switchCenterLabelDummies(
  expansion: LongEdgeExpansion,
  labels: CenterLabelExpansion,
  order: LayerOrder,
): { expansion: LongEdgeExpansion; order: LayerOrder } {
  if (!labels.dummyById.size) return { expansion, order };
  const input = expansion.input;
  const horizontal = input.direction === "left" || input.direction === "right";
  const layers = order.layers.map((layer) => [...layer]);
  const layerByNodeId = new Map(expansion.assignment.layerByNodeId);
  const widths = layers.map((layer) =>
    Math.max(
      0,
      ...layer
        .filter((id) => !id.startsWith("__layout_dummy:"))
        .map((id) => {
          const size = input.sizes.get(id);
          return horizontal ? (size?.width ?? 0) : (size?.height ?? 0);
        }),
    ),
  );
  let edges = [...input.graph.edges];
  const alignments = new Map<string, "LEFT" | "RIGHT">();
  const nodeIds = new Set(input.graph.nodes.map((node) => node.id));
  const longDummy = (id: string) =>
    nodeIds.has(id) &&
    id.startsWith("__layout_dummy:") &&
    !labels.dummyById.has(id) &&
    !id.startsWith("__layout_dummy:inverted:") &&
    !id.startsWith("__layout_dummy:north-south:");
  const orientedSource = (edge: GraphEdge) =>
    expansion.orientation.reversedEdgeIds.has(edge.id) ? edge.targetId : edge.sourceId;
  const orientedTarget = (edge: GraphEdge) =>
    expansion.orientation.reversedEdgeIds.has(edge.id) ? edge.sourceId : edge.targetId;
  const infos = layers
    .flatMap((layer) => layer.filter((id) => labels.dummyById.has(id)))
    .map((id) => {
      const label = labels.dummyById.get(id)!;
      const walk = (backward: boolean) => {
        const result: string[] = [],
          seen = new Set([id]);
        let current = id;
        for (;;) {
          const edge = edges.find(
            (edge) => (backward ? orientedTarget(edge) : orientedSource(edge)) === current,
          );
          if (!edge) break;
          current = backward ? orientedSource(edge) : orientedTarget(edge);
          if (!longDummy(current) || seen.has(current)) break;
          seen.add(current);
          result.push(current);
        }
        return backward ? result.reverse() : result;
      };
      const chain = [...walk(true), id, ...walk(false)];
      const strategy = String(
        input.edgeSettings?.(label.edge)?.["edgeLabels.centerLabelPlacementStrategy"] ??
          input.settings["edgeLabels.centerLabelPlacementStrategy"] ??
          "MEDIAN_LAYER",
      );
      return {
        id,
        chain,
        strategy,
        reversed: label.reversed,
        width: horizontal ? input.sizes.get(id)!.width : input.sizes.get(id)!.height,
      };
    });
  type Info = (typeof infos)[number];
  const assign = (info: Info, target: number) => {
    const other = info.chain.find((id) => layerByNodeId.get(id) === target)!;
    if (other !== info.id) {
      const original = layerByNodeId.get(info.id)!;
      const firstSlot = layers[original]!.indexOf(info.id),
        secondSlot = layers[target]!.indexOf(other);
      layers[original]![firstSlot] = other;
      layers[target]![secondSlot] = info.id;
      layerByNodeId.set(info.id, target);
      layerByNodeId.set(other, original);
      edges = edges.map((edge) => {
        const swap = (id: string) => (id === info.id ? other : id === other ? info.id : id);
        const sourceId = swap(edge.sourceId),
          targetId = swap(edge.targetId);
        const reversed = expansion.orientation.reversedEdgeIds.has(edge.id);
        return {
          ...edge,
          sourceId,
          targetId,
          sourcePort:
            sourceId === info.id
              ? reversed
                ? "input"
                : "output"
              : edge.sourceId === info.id
                ? undefined
                : edge.sourcePort,
          targetPort:
            targetId === info.id
              ? reversed
                ? "output"
                : "input"
              : edge.targetId === info.id
                ? undefined
                : edge.targetPort,
        };
      });
    }
    widths[target] = Math.max(widths[target]!, info.width);
  };
  const validLayers = (info: Info) =>
    info.chain.map((id) => layerByNodeId.get(id)!).sort((a, b) => a - b);
  const widest = (valid: number[]) =>
    valid.reduce((best, layer) => (widths[layer]! > widths[best]! ? layer : best), valid[0]!);
  // ELK processes strategies independent of width before width-dependent strategies.
  for (const strategy of [
    "MEDIAN_LAYER",
    "HEAD_LAYER",
    "TAIL_LAYER",
    "CENTER_LAYER",
    "WIDEST_LAYER",
  ]) {
    for (const info of infos.filter((info) => info.strategy === strategy)) {
      const valid = validLayers(info);
      let target = valid[Math.floor((valid.length - 1) / 2)]!;
      if (strategy === "HEAD_LAYER" || strategy === "TAIL_LAYER") {
        const right = (strategy === "HEAD_LAYER") !== info.reversed;
        target = right ? valid.at(-1)! : valid[0]!;
        alignments.set(info.id, right ? "RIGHT" : "LEFT");
      } else if (strategy === "WIDEST_LAYER") target = widest(valid);
      else if (strategy === "CENTER_LAYER") {
        const spacing = Math.max(
          Number(input.settings["spacing.edgeNodeBetweenLayers"] ?? 10) * 2,
          input.spacing.layer,
        );
        let sum = -spacing;
        const sums = valid.map((layer) => {
          sum += widths[layer]! + spacing;
          return sum;
        });
        target = valid[sums.findIndex((value) => value >= sum / 2)]!;
      }
      assign(info, target);
    }
  }
  const pending: Info[] = [];
  for (const info of infos.filter((info) => info.strategy === "SPACE_EFFICIENT_LAYER")) {
    const valid = validLayers(info),
      wide = valid.find((layer) => widths[layer]! >= info.width);
    if (valid.length === 1 || wide !== undefined) assign(info, wide ?? valid[0]!);
    else pending.push(info);
  }
  pending.sort((a, b) => b.width - a.width);
  for (const [index, info] of pending.entries()) {
    const valid = validLayers(info);
    let target = valid[0]!,
      best = 0;
    for (const layer of valid) {
      if (widths[layer]! >= info.width) {
        target = layer;
        break;
      }
      let potential = widths[layer]!;
      // Preserve ELK's last eligible pending-label selection and first-layer tie breaking.
      for (const other of pending.slice(index + 1))
        if (validLayers(other).includes(layer)) potential = Math.max(widths[layer]!, other.width);
      if (potential > best) {
        target = layer;
        best = potential;
      }
    }
    assign(info, target);
  }
  return {
    expansion: {
      ...expansion,
      assignment: { ...expansion.assignment, layerByNodeId },
      input: inheritCycleRandom(input, {
        ...input,
        graph: { ...input.graph, edges },
        nodeSettings: (node) => ({
          ...input.nodeSettings?.(node),
          ...(alignments.has(node.id) ? { alignment: alignments.get(node.id)! } : {}),
        }),
      }),
    },
    order: { ...order, layers },
  };
}
