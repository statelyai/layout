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
  const originalEdgeBySegmentId = new Map<string, GraphEdge>();
  const usedNodeIds = new Set(nodes.map((node) => node.id));

  for (const edge of input.graph.edges) {
    const sourceLayer = layerByNodeId.get(edge.sourceId) ?? 0;
    const targetLayer = layerByNodeId.get(edge.targetId) ?? 0;
    const span = Math.abs(targetLayer - sourceLayer);
    if (span <= 1 || edge.sourceId === edge.targetId) {
      edges.push(edge);
      originalEdgeBySegmentId.set(edge.id, edge);
      if (orientation.reversedEdgeIds.has(edge.id)) reversedEdgeIds.add(edge.id);
      segmentIdsByEdgeId.set(edge.id, [edge.id]);
      continue;
    }

    const step = targetLayer > sourceLayer ? 1 : -1;
    const chain = [edge.sourceId];
    for (let layer = sourceLayer + step; layer !== targetLayer; layer += step) {
      const id = uniqueDummyId(usedNodeIds, edge.id, layer);
      nodes.push({ type: "node", id, data: undefined, width: 0, height: 0 });
      sizes.set(id, { width: 0, height: 0 });
      layerByNodeId.set(id, layer);
      chain.push(id);
    }
    chain.push(edge.targetId);

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
    },
    orientation: { reversedEdgeIds },
    assignment: { layerByNodeId },
    segmentIdsByEdgeId,
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
  const pointsByEdgeId = new Map<string, readonly Point[]>();
  for (const [edgeId, segmentIds] of segmentIdsByEdgeId) {
    const points: Point[] = [];
    for (const segmentId of segmentIds) {
      appendPoints(points, routes.pointsByEdgeId.get(segmentId) ?? [], preserveInternalDuplicates);
    }
    pointsByEdgeId.set(edgeId, points);
  }
  return { pointsByEdgeId };
}
