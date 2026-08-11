import type { GraphEdge, GraphNode, Point } from "@statelyai/graph";
import type {
  AcyclicOrientation,
  EdgeRoutes,
  LayerAssignment,
  LayeredPhaseInput,
  NodeSize,
} from "./types";

export interface LongEdgeExpansion {
  input: LayeredPhaseInput;
  orientation: AcyclicOrientation;
  assignment: LayerAssignment;
  segmentIdsByEdgeId: ReadonlyMap<string, readonly string[]>;
  labelDummyIdByEdgeId: ReadonlyMap<string, string>;
}

function uniqueDummyId(usedIds: Set<string>, edgeId: string, layer: number): string {
  const base = `__layout_dummy:${edgeId}:${layer}`;
  let id = base;
  let suffix = 1;
  while (usedIds.has(id)) id = `${base}:${suffix++}`;
  usedIds.add(id);
  return id;
}

/** ELK LongEdgeSplitter equivalent for flat normal-node graphs. */
export function splitLongEdges(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  assignment: LayerAssignment,
): LongEdgeExpansion {
  const nodes = [...input.graph.nodes] as GraphNode[];
  const edges: GraphEdge[] = [];
  const sizes = new Map<string, NodeSize>(input.sizes);
  const layerByNodeId = new Map(assignment.layerByNodeId);
  const reversedEdgeIds = new Set<string>();
  const segmentIdsByEdgeId = new Map<string, readonly string[]>();
  const labelDummyIdByEdgeId = new Map<string, string>();
  const originalEdgeBySegmentId = new Map<string, GraphEdge>();
  const usedNodeIds = new Set(nodes.map((node) => node.id));

  for (const edge of input.graph.edges) {
    const sourceLayer = layerByNodeId.get(edge.sourceId) ?? 0;
    const targetLayer = layerByNodeId.get(edge.targetId) ?? 0;
    const span = Math.abs(targetLayer - sourceLayer);
    if (
      span <= 1 ||
      edge.sourceId === edge.targetId ||
      (input.settings.feedbackEdges === true && orientation.reversedEdgeIds.has(edge.id))
    ) {
      edges.push(edge);
      originalEdgeBySegmentId.set(edge.id, edge);
      if (orientation.reversedEdgeIds.has(edge.id)) reversedEdgeIds.add(edge.id);
      segmentIdsByEdgeId.set(edge.id, [edge.id]);
      continue;
    }

    const step = targetLayer > sourceLayer ? 1 : -1;
    const chain = [edge.sourceId];
    const dummyIds: string[] = [];
    const dummyLayers: number[] = [];
    for (let layer = sourceLayer + step; layer !== targetLayer; layer += step) {
      const id = uniqueDummyId(usedNodeIds, edge.id, layer);
      nodes.push({ type: "node", id, data: undefined, width: 0, height: 0 });
      sizes.set(id, { width: 0, height: 0 });
      layerByNodeId.set(id, layer);
      chain.push(id);
      dummyIds.push(id);
      dummyLayers.push(layer);
    }
    chain.push(edge.targetId);

    if ((edge.width ?? 0) > 0 || (edge.height ?? 0) > 0) {
      const strategy = String(
        input.edgeSettings?.(edge)?.["edgeLabels.centerLabelPlacementStrategy"] ??
          input.settings["edgeLabels.centerLabelPlacementStrategy"] ??
          "MEDIAN_LAYER",
      );
      const horizontal = input.direction === "left" || input.direction === "right";
      const layerWidth = (layer: number): number =>
        Math.max(
          0,
          ...input.graph.nodes
            .filter((node) => assignment.layerByNodeId.get(node.id) === layer)
            .map((node) => {
              const size = input.sizes.get(node.id);
              return horizontal ? (size?.width ?? 0) : (size?.height ?? 0);
            }),
        );
      let labelIndex = Math.floor((dummyIds.length - 1) / 2);
      if (strategy === "TAIL_LAYER") labelIndex = 0;
      else if (strategy === "HEAD_LAYER") labelIndex = dummyIds.length - 1;
      else if (strategy === "WIDEST_LAYER" || strategy === "SPACE_EFFICIENT_LAYER") {
        labelIndex = 0;
        for (let index = 1; index < dummyLayers.length; index++) {
          if (layerWidth(dummyLayers[index]!) > layerWidth(dummyLayers[labelIndex]!)) {
            labelIndex = index;
          }
        }
      } else if (strategy === "CENTER_LAYER") {
        const spacing = input.spacing.layer;
        const accumulated = dummyLayers.map((_, index) =>
          dummyLayers
            .slice(0, index + 1)
            .reduce((sum, layer) => sum + layerWidth(layer) + spacing, -spacing),
        );
        const half = (accumulated.at(-1) ?? 0) / 2;
        labelIndex = Math.max(
          0,
          accumulated.findIndex((value) => value >= half),
        );
      }
      const labelId = dummyIds[labelIndex]!;
      sizes.set(labelId, { width: edge.width ?? 0, height: edge.height ?? 0 });
      labelDummyIdByEdgeId.set(edge.id, labelId);
    }

    const segmentIds: string[] = [];
    for (let index = 0; index < chain.length - 1; index++) {
      const id = `${edge.id}::segment:${index}`;
      const segment: GraphEdge = {
        ...edge,
        id,
        sourceId: chain[index] as string,
        targetId: chain[index + 1] as string,
        sourcePort: index === 0 ? edge.sourcePort : undefined,
        targetPort: index === chain.length - 2 ? edge.targetPort : undefined,
        points: undefined,
        width: 0,
        height: 0,
      };
      edges.push(segment);
      segmentIds.push(id);
      originalEdgeBySegmentId.set(id, edge);
      if (orientation.reversedEdgeIds.has(edge.id)) reversedEdgeIds.add(id);
    }
    segmentIdsByEdgeId.set(edge.id, segmentIds);
  }

  const graph = { ...input.graph, nodes, edges } as LayeredPhaseInput["graph"];
  return {
    input: {
      ...input,
      graph,
      sizes,
      edgeSettings: (edge) => {
        const original = originalEdgeBySegmentId.get(edge.id) ?? edge;
        return input.edgeSettings?.(original);
      },
      nodeSettings: (node) => {
        const original = input.nodeSettings?.(node);
        const edgeId = [...labelDummyIdByEdgeId].find(([, id]) => id === node.id)?.[0];
        if (!edgeId) return original;
        const edge = input.graph.edges.find((candidate) => candidate.id === edgeId);
        const strategy = String(
          (edge && input.edgeSettings?.(edge)?.["edgeLabels.centerLabelPlacementStrategy"]) ??
            input.settings["edgeLabels.centerLabelPlacementStrategy"] ??
            "MEDIAN_LAYER",
        );
        return {
          ...original,
          ...(strategy === "TAIL_LAYER"
            ? {
                alignment:
                  input.direction === "left" || input.direction === "up" ? "RIGHT" : "LEFT",
              }
            : strategy === "HEAD_LAYER"
              ? {
                  alignment:
                    input.direction === "left" || input.direction === "up" ? "LEFT" : "RIGHT",
                }
              : {}),
        };
      },
    },
    orientation: { reversedEdgeIds },
    assignment: { layerByNodeId },
    segmentIdsByEdgeId,
    labelDummyIdByEdgeId,
  };
}

function appendPoints(
  target: Point[],
  points: readonly Point[],
  preserveInternalDuplicates: boolean,
): void {
  for (const [index, point] of points.entries()) {
    const previous = target.at(-1);
    if (
      previous?.x === point.x &&
      previous.y === point.y &&
      (!preserveInternalDuplicates || index === 0)
    )
      continue;
    target.push(point);
  }
}

/** ELK LongEdgeJoiner equivalent for public edge routes. */
export function joinLongEdgeRoutes(
  routes: EdgeRoutes,
  segmentIdsByEdgeId: ReadonlyMap<string, readonly string[]>,
  preserveInternalDuplicates = false,
): EdgeRoutes {
  const simplify = (points: readonly Point[]): Point[] => {
    const result: Point[] = [];
    const equal = (left: number, right: number) => Math.abs(left - right) < 1e-9;
    for (const point of points) {
      const previous = result.at(-1);
      if (previous && equal(previous.x, point.x) && equal(previous.y, point.y)) continue;
      result.push(point);
      while (result.length >= 3) {
        const first = result.at(-3)!;
        const middle = result.at(-2)!;
        const last = result.at(-1)!;
        if (
          (equal(first.x, middle.x) && equal(middle.x, last.x)) ||
          (equal(first.y, middle.y) && equal(middle.y, last.y))
        ) {
          result.splice(-2, 1);
        } else break;
      }
    }
    return result;
  };
  const pointsByEdgeId = new Map<string, readonly Point[]>();
  for (const [edgeId, segmentIds] of segmentIdsByEdgeId) {
    const points: Point[] = [];
    for (const segmentId of segmentIds) {
      appendPoints(
        points,
        routes.pointsByEdgeId.get(segmentId) ?? [],
        preserveInternalDuplicates || segmentIds.length === 1,
      );
    }
    pointsByEdgeId.set(
      edgeId,
      preserveInternalDuplicates || segmentIds.length === 1 ? points : simplify(points),
    );
  }
  return { pointsByEdgeId };
}
