/*******************************************************************************
 * Copyright (c) 2010, 2020 Kiel University and others.
 * Adapted from ELK HierarchicalPortConstraintProcessor and
 * HierarchicalPortDummySizeProcessor in elkjs 0.11.1.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { inheritCycleRandom } from "./cycle-random";
import type { GraphEdge, GraphNode } from "@statelyai/graph";
import { attachExternalPortDummy, externalPortDummyOf } from "./external-port-dummy";
import type { AcyclicOrientation, LayerAssignment, LayeredPhaseInput, LayerOrder } from "./types";

export interface HierarchicalPortReplacement {
  original: GraphNode;
  helper: GraphNode;
  side: "NORTH" | "SOUTH";
}
export interface HierarchicalPortPreparation {
  input: LayeredPhaseInput;
  assignment: LayerAssignment & { layerCount?: number };
  replacements: ReadonlyMap<string, HierarchicalPortReplacement>;
  originals: ReadonlyMap<string, GraphNode>;
}
const sides = {
  right: { before: "WEST", after: "EAST", north: "NORTH", south: "SOUTH" },
  left: { before: "EAST", after: "WEST", north: "NORTH", south: "SOUTH" },
  down: { before: "NORTH", after: "SOUTH", north: "WEST", south: "EAST" },
  up: { before: "SOUTH", after: "NORTH", north: "WEST", south: "EAST" },
} as const;

export function hierarchicalPortSides(input: Pick<LayeredPhaseInput, "direction" | "settings">) {
  return input.direction === "left" && input.settings.directionCongruency === "ROTATION"
    ? { ...sides.left, north: "SOUTH" as const, south: "NORTH" as const }
    : input.direction === "down" && input.settings.directionCongruency === "ROTATION"
      ? { ...sides.down, north: "EAST" as const, south: "WEST" as const }
      : sides[input.direction];
}

/** Introduce one flow-axis helper for each original port and adjacent layer. */
export function prepareHierarchicalPortConstraints(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  assignment: LayerAssignment & { layerCount?: number },
): HierarchicalPortPreparation {
  const replacements = new Map<string, HierarchicalPortReplacement>();
  const originals = new Map<string, GraphNode>();
  const physical = hierarchicalPortSides(input);
  if (
    !["FIXED_SIDE", "FIXED_ORDER", "FIXED_RATIO", "FIXED_POS"].includes(
      String(input.settings.portConstraints),
    )
  )
    return { input, assignment, replacements, originals };
  for (const node of input.graph.nodes) {
    const origin = externalPortDummyOf(node);
    if (origin?.side === physical.north || origin?.side === physical.south)
      originals.set(node.id, node);
  }
  if (!originals.size) return { input, assignment, replacements, originals };
  const byOriginalId = new Map(originals);
  originals.clear();
  for (const id of assignment.seedOrder ?? input.graph.nodes.map((node) => node.id)) {
    const node = byOriginalId.get(id);
    if (node) originals.set(id, node);
  }

  const count = assignment.layerCount ?? Math.max(-1, ...assignment.layerByNodeId.values()) + 1;
  const layers: string[][] = Array.from({ length: count }, () => []);
  const seed = assignment.seedOrder ?? input.graph.nodes.map((node) => node.id);
  for (const id of seed)
    if (!originals.has(id)) layers[assignment.layerByNodeId.get(id) ?? 0]!.push(id);
  const nodes = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const edges = input.graph.edges.map((edge) => ({ ...edge }));
  const additions = new Map<number, string[]>();
  const usedIds = new Set(nodes.keys());
  const helperFor = (original: GraphNode, layer: number): GraphNode => {
    const key = `${original.id}:flow:${layer}`;
    let record = replacements.get(key);
    if (record) return record.helper;
    let id = key;
    while (usedIds.has(id)) id += ":helper";
    usedIds.add(id);
    const origin = externalPortDummyOf(original)!;
    const helper = attachExternalPortDummy(
      {
        ...original,
        id,
        width: 0,
        height: 0,
        ports: [
          {
            name: `${id}:in`,
            direction: "in" as const,
            data: undefined,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
          },
          {
            name: `${id}:out`,
            direction: "out" as const,
            data: undefined,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
          },
        ],
      },
      origin,
    );
    record = { original, helper, side: origin.side === physical.north ? "NORTH" : "SOUTH" };
    replacements.set(key, record);
    additions.set(layer, [...(additions.get(layer) ?? []), id]);
    return helper;
  };
  const source = (edge: GraphEdge) =>
    orientation.reversedEdgeIds.has(edge.id) ? edge.targetId : edge.sourceId;
  const target = (edge: GraphEdge) =>
    orientation.reversedEdgeIds.has(edge.id) ? edge.sourceId : edge.targetId;
  for (let layer = 0; layer < layers.length; layer++)
    for (const id of layers[layer]!) {
      for (const edge of edges.filter((edge) => target(edge) === id)) {
        const original = originals.get(source(edge));
        if (!original) continue;
        const helper = helperFor(original, layer - 1);
        if (orientation.reversedEdgeIds.has(edge.id)) {
          edge.targetId = helper.id;
          edge.targetPort = helper.ports![1]!.name;
        } else {
          edge.sourceId = helper.id;
          edge.sourcePort = helper.ports![1]!.name;
        }
      }
      for (const edge of edges.filter((edge) => source(edge) === id)) {
        const original = originals.get(target(edge));
        if (!original) continue;
        const helper = helperFor(original, layer + 1);
        if (orientation.reversedEdgeIds.has(edge.id)) {
          edge.sourceId = helper.id;
          edge.sourcePort = helper.ports![0]!.name;
        } else {
          edge.targetId = helper.id;
          edge.targetPort = helper.ports![0]!.name;
        }
      }
    }
  // The worker inserts the leading layer while iterating the original
  // replacement buckets. Later bucket indices address that mutated layer list.
  const preparedLayers = layers.map((layer) => [...layer]);
  for (let index = -1; index <= count; index++) {
    const added = additions.get(index);
    if (!added?.length) continue;
    if (index === -1) preparedLayers.unshift([...added]);
    else if (index === count) preparedLayers.push([...added]);
    else preparedLayers[index]!.push(...added);
  }
  const layerByNodeId = new Map(
    preparedLayers.flatMap((layer, i) => layer.map((id) => [id, i] as const)),
  );
  const helpers = [...replacements.values()].map((record) => record.helper);
  const helperIds = new Set(helpers.map((node) => node.id));
  const sizes = new Map(input.sizes);
  for (const id of originals.keys()) sizes.delete(id);
  for (const helper of helpers) sizes.set(helper.id, { width: 0, height: 0 });
  const prepared: LayeredPhaseInput = inheritCycleRandom(input, {
    ...input,
    sizes,
    graph: {
      ...input.graph,
      nodes: [...input.graph.nodes.filter((node) => !originals.has(node.id)), ...helpers],
      edges,
    },
    nodeSettings: (node) =>
      helperIds.has(node.id)
        ? { ...input.nodeSettings?.(node), portConstraints: "FIXED_POS", alignment: "CENTER" }
        : input.nodeSettings?.(node),
    portSettings: (port, node) =>
      helperIds.has(node.id)
        ? { "port.side": port.direction === "out" ? physical.after : physical.before }
        : input.portSettings?.(port, node),
  });
  return {
    input: prepared,
    assignment: {
      ...assignment,
      layerCount: preparedLayers.length,
      layerByNodeId,
      seedOrder: preparedLayers.flat(),
    },
    replacements,
    originals,
  };
}

/** ELK assigns successive double-spacing lane widths after crossing order is known. */
export function sizeHierarchicalPortDummies(
  input: LayeredPhaseInput,
  order: LayerOrder,
  preparation: HierarchicalPortPreparation,
): LayeredPhaseInput {
  if (!preparation.replacements.size) return input;
  const byId = new Map(
    [...preparation.replacements.values()].map((record) => [record.helper.id, record]),
  );
  const horizontal = input.direction === "right" || input.direction === "left";
  const delta = 2 * Number(input.settings["spacing.edgeEdgeBetweenLayers"] ?? 10);
  const sizes = new Map(input.sizes);
  const resized = new Map<string, GraphNode>();
  for (const layer of order.layers)
    for (const side of ["NORTH", "SOUTH"] as const) {
      const ids = layer.filter((id) => byId.get(id)?.side === side);
      for (const [index, id] of ids.entries()) {
        const width = delta * (side === "NORTH" ? index : ids.length - 1 - index);
        const node = input.graph.nodes.find((node) => node.id === id)!;
        const size = horizontal ? { width, height: 0 } : { width: 0, height: width };
        sizes.set(id, size);
        resized.set(id, {
          ...node,
          ...size,
          ports: node.ports?.map((port) => ({
            ...port,
            x: horizontal
              ? input.portSettings?.(port, node)?.["port.side"] === "EAST"
                ? width
                : 0
              : 0,
            y: !horizontal
              ? input.portSettings?.(port, node)?.["port.side"] === "SOUTH"
                ? width
                : 0
              : 0,
          })),
        });
      }
    }
  return inheritCycleRandom(input, {
    ...input,
    sizes,
    graph: { ...input.graph, nodes: input.graph.nodes.map((node) => resized.get(node.id) ?? node) },
  });
}
