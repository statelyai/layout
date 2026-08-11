/*******************************************************************************
 * Derived from Eclipse Layout Kernel's breaking-point wrapping processors.
 * Copyright (c) 2016 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/

import type { GraphEdge, GraphNode } from "@statelyai/graph";
import type { LongEdgeExpansion } from "./long-edges";
import type { AcyclicOrientation, LayerAssignment, LayerOrder, LayeredPhaseInput } from "./types";

interface BreakingPointInfo {
  originalEdgeId: string;
  cutIndex: number;
  startId: string;
  endId: string;
  nodeStartEdgeId: string;
  startEndEdgeId: string;
}

export interface BreakingPointPreparation {
  input: LayeredPhaseInput;
  orientation: AcyclicOrientation;
  assignment: LayerAssignment;
  infos: readonly BreakingPointInfo[];
  piecesByOriginalEdgeId: ReadonlyMap<string, readonly { edgeId: string; reversed: boolean }[]>;
}

export interface FoldedBreakingPoints {
  expansion: LongEdgeExpansion;
  order: LayerOrder;
  routePiecesByOriginalEdgeId: ReadonlyMap<
    string,
    readonly { edgeIds: readonly string[]; reversed: boolean }[]
  >;
}

function breakingNode(id: string): GraphNode {
  return { type: "node", id, data: undefined, width: 0, height: 0 };
}

/** ELK BreakingPointInserter for an already chosen set of cut indexes. */
export function insertMultiEdgeBreakingPoints(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  assignment: LayerAssignment,
  cuts: readonly number[],
): BreakingPointPreparation {
  const sortedCuts = [...cuts].sort((left, right) => left - right);
  const nodes = [...input.graph.nodes] as GraphNode[];
  const edges: GraphEdge[] = [];
  const sizes = new Map(input.sizes);
  const layerByNodeId = new Map<string, number>();
  const infos: BreakingPointInfo[] = [];
  const piecesByOriginalEdgeId = new Map<
    string,
    readonly { edgeId: string; reversed: boolean }[]
  >();
  const originalEdgeBySegmentId = new Map<string, GraphEdge>();

  for (const node of input.graph.nodes) {
    const originalLayer = assignment.layerByNodeId.get(node.id) ?? 0;
    const insertedLayers = 2 * sortedCuts.filter((cut) => cut <= originalLayer).length;
    layerByNodeId.set(node.id, originalLayer + insertedLayers);
  }

  for (const [modelOrder, edge] of input.graph.edges.entries()) {
    const sourceLayer = assignment.layerByNodeId.get(edge.sourceId) ?? 0;
    const targetLayer = assignment.layerByNodeId.get(edge.targetId) ?? 0;
    const crossedCuts = sortedCuts.filter(
      (cut) =>
        Math.min(sourceLayer, targetLayer) < cut && cut <= Math.max(sourceLayer, targetLayer),
    );
    if (crossedCuts.length === 0 || sourceLayer >= targetLayer) {
      edges.push(edge);
      originalEdgeBySegmentId.set(edge.id, edge);
      piecesByOriginalEdgeId.set(edge.id, [{ edgeId: edge.id, reversed: false }]);
      continue;
    }

    let currentSourceId = edge.sourceId;
    let currentSourcePort = edge.sourcePort;
    const pieces: Array<{ edgeId: string; reversed: boolean }> = [];
    for (const cut of crossedCuts) {
      const cutIndex = sortedCuts.indexOf(cut);
      const startId = `__layout_breaking:${edge.id}:${cut}:start`;
      const endId = `__layout_breaking:${edge.id}:${cut}:end`;
      nodes.push(breakingNode(startId), breakingNode(endId));
      sizes.set(startId, { width: 0, height: 0 });
      sizes.set(endId, { width: 0, height: 0 });
      layerByNodeId.set(startId, cut + 2 * cutIndex);
      layerByNodeId.set(endId, cut + 2 * cutIndex + 1);
      const nodeStartEdgeId = `${edge.id}::wrap:${cut}:start`;
      const startEndEdgeId = `${edge.id}::wrap:${cut}:return`;
      const nodeStart: GraphEdge = {
        ...edge,
        id: nodeStartEdgeId,
        sourceId: currentSourceId,
        targetId: startId,
        sourcePort: currentSourcePort,
        targetPort: undefined,
        width: 0,
        height: 0,
        points: undefined,
      };
      const startEnd: GraphEdge = {
        ...edge,
        id: startEndEdgeId,
        sourceId: startId,
        targetId: endId,
        sourcePort: undefined,
        targetPort: undefined,
        width: 0,
        height: 0,
        points: undefined,
      };
      edges.push(nodeStart, startEnd);
      originalEdgeBySegmentId.set(nodeStartEdgeId, edge);
      originalEdgeBySegmentId.set(startEndEdgeId, edge);
      pieces.push(
        { edgeId: nodeStartEdgeId, reversed: false },
        { edgeId: startEndEdgeId, reversed: true },
      );
      infos.push({
        originalEdgeId: edge.id,
        cutIndex,
        startId,
        endId,
        nodeStartEdgeId,
        startEndEdgeId,
      });
      currentSourceId = endId;
      currentSourcePort = undefined;
    }
    const remainingEdgeId = `${edge.id}::wrap:remaining`;
    const remaining: GraphEdge = {
      ...edge,
      id: remainingEdgeId,
      sourceId: currentSourceId,
      sourcePort: currentSourcePort,
      points: undefined,
    };
    edges.push(remaining);
    originalEdgeBySegmentId.set(remainingEdgeId, edge);
    pieces.push({ edgeId: remainingEdgeId, reversed: false });
    piecesByOriginalEdgeId.set(edge.id, pieces);
    void modelOrder;
  }

  const graph = { ...input.graph, nodes, edges } as LayeredPhaseInput["graph"];
  const reversedEdgeIds = new Set<string>();
  for (const edge of edges) {
    const original = originalEdgeBySegmentId.get(edge.id);
    if (original && orientation.reversedEdgeIds.has(original.id)) reversedEdgeIds.add(edge.id);
  }
  return {
    input: {
      ...input,
      graph,
      sizes,
      edgeSettings: (edge) => input.edgeSettings?.(originalEdgeBySegmentId.get(edge.id) ?? edge),
    },
    orientation: { reversedEdgeIds },
    assignment: { layerByNodeId },
    infos,
    piecesByOriginalEdgeId,
  };
}

function replaceSegment(
  segmentIdsByEdgeId: Map<string, readonly string[]>,
  edgeId: string,
  replacementIds: readonly string[],
): void {
  segmentIdsByEdgeId.set(edgeId, replacementIds);
}

/** ELK BreakingPointProcessor.performWrapping plus CuttingUtils.insertDummies. */
export function foldMultiEdgeBreakingPoints(
  expansion: LongEdgeExpansion,
  order: LayerOrder,
  preparation: BreakingPointPreparation,
): FoldedBreakingPoints {
  const infoByStartId = new Map(preparation.infos.map((info) => [info.startId, info]));
  const infoByEndId = new Map(preparation.infos.map((info) => [info.endId, info]));
  const physicalLayers: string[][] = [[]];
  const nodes = [...expansion.input.graph.nodes] as GraphNode[];
  let edges = [...expansion.input.graph.edges] as GraphEdge[];
  const sizes = new Map(expansion.input.sizes);
  const segmentIdsByEdgeId = new Map(expansion.segmentIdsByEdgeId);
  const originalEdgeByNewId = new Map<string, GraphEdge>();
  const individualSpacingNodeIds = new Set<string>();
  let dummySerial = 0;
  let edgeSerial = 0;
  const insertReturnChains = (ids: readonly string[], rightColumn: number): void => {
    const offset = ids.length;
    for (const endId of [...ids].reverse()) {
      const info = infoByEndId.get(endId)!;
      const expandedIds = segmentIdsByEdgeId.get(info.startEndEdgeId) ?? [info.startEndEdgeId];
      const startEndId = expandedIds[0]!;
      const startEnd = edges.find((edge) => edge.id === startEndId);
      if (!startEnd) continue;
      edges = edges.filter((edge) => edge.id !== startEndId);
      const chain = [info.endId];
      for (let layerNo = 0; layerNo <= rightColumn; layerNo++) {
        const id = `__layout_dummy:wrap:${dummySerial++}`;
        nodes.push({ type: "node", id, data: undefined, width: 0, height: 1 });
        sizes.set(id, { width: 0, height: 1 });
        individualSpacingNodeIds.add(id);
        if (layerNo === 0) {
          physicalLayers[0]!.splice(Math.max(0, physicalLayers[0]!.length - offset), 0, id);
        } else {
          physicalLayers[layerNo] ??= [];
          physicalLayers[layerNo]!.push(id);
        }
        chain.push(id);
      }
      chain.push(info.startId);
      const replacementIds: string[] = [];
      for (let index = 0; index + 1 < chain.length; index++) {
        const id = `${info.startEndEdgeId}::fold:${edgeSerial++}`;
        const replacement: GraphEdge = {
          ...startEnd,
          id,
          sourceId: chain[index]!,
          targetId: chain[index + 1]!,
          sourcePort: undefined,
          targetPort: undefined,
          points: undefined,
          width: 0,
          height: 0,
        };
        edges.push(replacement);
        replacementIds.push(id);
        originalEdgeByNewId.set(id, startEnd);
      }
      replaceSegment(segmentIdsByEdgeId, info.startEndEdgeId, replacementIds);
    }
  };

  let column = 1;
  for (const layer of order.layers) {
    const starts = layer.filter((id) => infoByStartId.has(id));
    const ends = layer.filter((id) => infoByEndId.has(id));
    if (starts.length > 0 && starts.length === layer.length) {
      physicalLayers[column] ??= [];
      physicalLayers[column]!.push(...layer);
      column++;
      continue;
    }
    if (ends.length > 0 && ends.length === layer.length) {
      physicalLayers[0]!.push(...layer);
      insertReturnChains(layer, column - 1);
      column = 1;
      continue;
    }
    physicalLayers[column] ??= [];
    physicalLayers[column]!.push(...layer);
    column++;
  }

  const retainedIds = new Set(physicalLayers.flat());
  const graphNodes = nodes.filter((node) => retainedIds.has(node.id));
  const layerByNodeId = new Map<string, number>();
  physicalLayers.forEach((layer, layerNo) => layer.forEach((id) => layerByNodeId.set(id, layerNo)));
  const graph = {
    ...expansion.input.graph,
    nodes: graphNodes,
    edges,
  } as LayeredPhaseInput["graph"];
  const routePiecesByOriginalEdgeId = new Map<
    string,
    readonly { edgeIds: readonly string[]; reversed: boolean }[]
  >();
  for (const [edgeId, pieces] of preparation.piecesByOriginalEdgeId) {
    routePiecesByOriginalEdgeId.set(
      edgeId,
      pieces.map((piece) => ({
        edgeIds: segmentIdsByEdgeId.get(piece.edgeId) ?? [piece.edgeId],
        reversed: piece.reversed,
      })),
    );
  }
  return {
    expansion: {
      ...expansion,
      input: {
        ...expansion.input,
        graph,
        sizes,
        nodeSettings: (node) => ({
          ...expansion.input.nodeSettings?.(node),
          ...(individualSpacingNodeIds.has(node.id)
            ? {
                "spacing.individual": {
                  "spacing.edgeNode":
                    Number(expansion.input.settings["spacing.edgeNode"] ?? 10) +
                    Number(expansion.input.settings["wrapping.additionalEdgeSpacing"] ?? 10),
                },
              }
            : {}),
        }),
        edgeSettings: (edge) =>
          expansion.input.edgeSettings?.(originalEdgeByNewId.get(edge.id) ?? edge),
      },
      orientation: { reversedEdgeIds: new Set() },
      assignment: { layerByNodeId },
      segmentIdsByEdgeId,
    },
    order: { layers: physicalLayers },
    routePiecesByOriginalEdgeId,
  };
}
