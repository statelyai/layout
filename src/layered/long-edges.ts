import { inheritCycleRandom } from "./cycle-random";
import type { GraphEdge, GraphNode, Point } from "@statelyai/graph";
import type {
  AcyclicOrientation,
  EdgeRoutes,
  LayerAssignment,
  LayeredPhaseInput,
  NodeSize,
} from "./types";
import { uniformCubicSplineToBezier } from "./spline-bezier";

export interface LongEdgeExpansion {
  input: LayeredPhaseInput;
  orientation: AcyclicOrientation;
  assignment: LayerAssignment;
  segmentIdsByEdgeId: ReadonlyMap<string, readonly string[]>;
  labelDummyIdByEdgeId: ReadonlyMap<string, string>;
  /** Physical incoming adjacency after cycle reversal and long-edge retargeting. */
  incomingEdgeOrderByNodeId?: ReadonlyMap<string, readonly string[]>;
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
  const originalNodeIds = new Set(usedNodeIds);

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

  const incomingEdgeOrderByNodeId = new Map<string, string[]>();
  const orientedSource = (edge: GraphEdge) =>
    orientation.reversedEdgeIds.has(edge.id) ? edge.targetId : edge.sourceId;
  const orientedTarget = (edge: GraphEdge) =>
    orientation.reversedEdgeIds.has(edge.id) ? edge.sourceId : edge.targetId;
  const appendIncoming = (edge: GraphEdge) => {
    const target = orientedTarget(edge);
    incomingEdgeOrderByNodeId.set(target, [
      ...(incomingEdgeOrderByNodeId.get(target) ?? []),
      edge.id,
    ]);
  };
  for (const edge of input.graph.edges)
    if (!orientation.reversedEdgeIds.has(edge.id)) appendIncoming(edge);
  for (const id of orientation.reversedEdgeIds) {
    const edge = input.graph.edges.find((candidate) => candidate.id === id);
    if (edge) appendIncoming(edge);
  }
  // Upstream walks source layers, nodes, then their existing ports. Splitting
  // retargets the last chain segment, appending it to its physical target port.
  const sourceNodes = [...input.graph.nodes].sort(
    (a, b) => (assignment.layerByNodeId.get(a.id) ?? 0) - (assignment.layerByNodeId.get(b.id) ?? 0),
  );
  for (const node of sourceNodes) {
    const outgoing = input.graph.edges.filter((edge) => orientedSource(edge) === node.id);
    const portIndex = (edge: GraphEdge) =>
      node.ports?.findIndex(
        (port) =>
          port.name ===
          (orientation.reversedEdgeIds.has(edge.id) ? edge.targetPort : edge.sourcePort),
      ) ?? -1;
    outgoing.sort(
      (a, b) =>
        portIndex(a) - portIndex(b) ||
        Number(orientation.reversedEdgeIds.has(a.id)) -
          Number(orientation.reversedEdgeIds.has(b.id)),
    );
    for (const edge of outgoing) {
      if ((segmentIdsByEdgeId.get(edge.id)?.length ?? 0) < 2) continue;
      const target = orientedTarget(edge);
      incomingEdgeOrderByNodeId.set(
        target,
        incomingEdgeOrderByNodeId.get(target)!.filter((id) => id !== edge.id),
      );
      appendIncoming(edge);
    }
  }

  // ELK creates long-edge dummies while walking layers. Thus dummies for an
  // edge whose source is in the next layer can precede later parts of an edge
  // that started in an earlier layer. Preserve that order for crossing ties.
  const maximumLayer = Math.max(0, (assignment.layerCount ?? 1) - 1, ...layerByNodeId.values());
  const nodesByLayer = Array.from({ length: maximumLayer + 1 }, () => [] as string[]);
  for (const node of input.graph.nodes) {
    nodesByLayer[layerByNodeId.get(node.id) ?? 0]?.push(node.id);
  }
  const outgoingBySource = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const outgoing = outgoingBySource.get(edge.sourceId) ?? [];
    outgoing.push(edge);
    outgoingBySource.set(edge.sourceId, outgoing);
  }
  const appendNextLayerDummies = (layer: number, step: 1 | -1): void => {
    for (const sourceId of nodesByLayer[layer] ?? []) {
      for (const edge of outgoingBySource.get(sourceId) ?? []) {
        const targetLayer = layerByNodeId.get(edge.targetId);
        if (
          targetLayer !== layer + step ||
          originalNodeIds.has(edge.targetId) ||
          nodesByLayer[targetLayer]?.includes(edge.targetId)
        ) {
          continue;
        }
        nodesByLayer[targetLayer]?.push(edge.targetId);
      }
    }
  };
  for (let layer = 0; layer < maximumLayer; layer++) appendNextLayerDummies(layer, 1);
  for (let layer = maximumLayer; layer > 0; layer--) appendNextLayerDummies(layer, -1);
  const dummyOrder = new Map<string, number>();
  for (const layer of nodesByLayer) {
    layer.forEach((id, index) => {
      if (!originalNodeIds.has(id)) dummyOrder.set(id, index);
    });
  }
  const orderedNodes = [
    ...input.graph.nodes,
    ...nodes
      .filter((node) => !originalNodeIds.has(node.id))
      .sort(
        (left, right) =>
          (layerByNodeId.get(left.id) ?? 0) - (layerByNodeId.get(right.id) ?? 0) ||
          (dummyOrder.get(left.id) ?? 0) - (dummyOrder.get(right.id) ?? 0),
      ),
  ];
  const graph = { ...input.graph, nodes: orderedNodes, edges } as LayeredPhaseInput["graph"];
  return {
    input: inheritCycleRandom(input, {
      ...input,
      graph,
      modelOrderByEdgeId: new Map(
        edges.map((edge) => {
          const original = originalEdgeBySegmentId.get(edge.id) ?? edge;
          return [
            edge.id,
            input.modelOrderByEdgeId?.get(original.id) ?? input.graph.edges.indexOf(original),
          ];
        }),
      ),
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
    }),
    incomingEdgeOrderByNodeId,
    orientation: { reversedEdgeIds },
    assignment: { ...assignment, layerByNodeId },
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
  convertLongSplines = false,
  longSplineEdgeNodeSpacing = 10,
  preserveOrthogonalCorners = false,
  restoredJunctionCounts?: ReadonlyMap<string, number>,
  reversedSegmentIds?: ReadonlySet<string>,
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
  const outsideFeedbackEdgeIds = new Set<string>();
  for (const [edgeId, segmentIds] of segmentIdsByEdgeId) {
    if (segmentIds.some((segmentId) => routes.outsideFeedbackEdgeIds?.has(segmentId))) {
      outsideFeedbackEdgeIds.add(edgeId);
    }
    if (convertLongSplines && segmentIds.length > 1) {
      const segments = segmentIds
        .map((segmentId) => routes.pointsByEdgeId.get(segmentId) ?? [])
        .filter((points) => points.length >= 2);
      if (segments.length > 1) {
        const source = segments[0]![0]!;
        const target = segments.at(-1)!.at(-1)!;
        const horizontal = Math.abs(target.x - source.x) >= Math.abs(target.y - source.y);
        const flow = (point: Point) => (horizontal ? point.x : point.y);
        const cross = (point: Point) => (horizontal ? point.y : point.x);
        const point = (flowValue: number, crossValue: number): Point =>
          horizontal ? { x: flowValue, y: crossValue } : { x: crossValue, y: flowValue };
        const controlsBySegment = segments.map((segment, index): Point[] => {
          const retained = routes.splineNubControlsByEdgeId?.get(segmentIds[index]!);
          if (retained) return [...retained];
          const start = segment[0]!;
          const end = segment.at(-1)!;
          const center = segment.at(-2) ?? start;
          if (index === 0) {
            const centerFlow = flow(center);
            return [point(centerFlow, cross(end)), point(2 * centerFlow - flow(start), cross(end))];
          }
          if (index === segments.length - 1) {
            const centerFlow = flow(center);
            return [
              point(2 * centerFlow - flow(end), cross(start)),
              point(centerFlow, cross(start)),
            ];
          }
          if (Math.abs(cross(start) - cross(end)) >= 1e-6) {
            const centerFlow = flow(center);
            const sign = Math.sign(flow(end) - flow(start)) || 1;
            return [
              point(centerFlow - sign * longSplineEdgeNodeSpacing, cross(start)),
              point(centerFlow, cross(start)),
              point(centerFlow, cross(end)),
              point(centerFlow + sign * longSplineEdgeNodeSpacing, cross(end)),
            ];
          }
          return [point((flow(start) + flow(end)) / 2, (cross(start) + cross(end)) / 2)];
        });
        const nubControls: Point[] = [{ ...source }];
        let lastControl: Point | undefined;
        let addMidpoint = false;
        for (const controls of controlsBySegment) {
          if (controls.length === 0) continue;
          if (addMidpoint && lastControl) {
            nubControls.push({
              x: (lastControl.x + controls[0]!.x) / 2,
              y: (lastControl.y + controls[0]!.y) / 2,
            });
            addMidpoint = false;
          } else {
            addMidpoint = true;
          }
          nubControls.push(...controls);
          lastControl = controls.at(-1);
        }
        nubControls.push({ ...target });
        pointsByEdgeId.set(edgeId, uniformCubicSplineToBezier(nubControls));
        continue;
      }
    }
    const points: Point[] = [];
    // ELK joins segment bend lists without their dummy anchors. Orthogonal
    // compaction can collapse bends; those original bends still remain public.
    if (!preserveInternalDuplicates && preserveOrthogonalCorners && segmentIds.length > 1) {
      const joined = segmentIds.flatMap((segmentId, segmentIndex) => {
        const segment = routes.pointsByEdgeId.get(segmentId) ?? [];
        return segment.map((point, index) => ({
          point,
          dummyAnchor:
            (index === 0 && segmentIndex !== 0) ||
            (index === segment.length - 1 && segmentIndex !== segmentIds.length - 1),
        }));
      });
      // Native dummy anchors may supply a real corner. Discard only redundant
      // anchors; retain segment bends even when compaction made them collinear.
      for (let index = 1; index + 1 < joined.length;) {
        const first = joined[index - 1]!.point;
        const middle = joined[index]!;
        const last = joined[index + 1]!.point;
        const equal = (a: number, b: number) => Math.abs(a - b) < 1e-9;
        if (
          middle.dummyAnchor &&
          ((equal(first.x, middle.point.x) && equal(middle.point.x, last.x)) ||
            (equal(first.y, middle.point.y) && equal(middle.point.y, last.y)))
        ) {
          joined.splice(index, 1);
          index = Math.max(1, index - 1);
        } else index++;
      }
      points.push(...joined.map(({ point }) => point));
    } else if (!preserveInternalDuplicates && segmentIds.length > 1) {
      const segments = segmentIds.map((segmentId) => routes.pointsByEdgeId.get(segmentId) ?? []);
      const firstPoint = segments[0]?.[0];
      if (firstPoint) points.push(firstPoint);
      for (const segment of segments) points.push(...segment.slice(1, -1));
      const lastPoint = segments.at(-1)?.at(-1);
      if (lastPoint) points.push(lastPoint);
    } else {
      for (const segmentId of segmentIds) {
        appendPoints(
          points,
          routes.pointsByEdgeId.get(segmentId) ?? [],
          preserveInternalDuplicates || segmentIds.length === 1,
        );
      }
    }
    pointsByEdgeId.set(
      edgeId,
      preserveInternalDuplicates || preserveOrthogonalCorners || segmentIds.length === 1
        ? points
        : simplify(points),
    );
  }
  const junctionPointsByEdgeId =
    routes.junctionPointsByEdgeId &&
    new Map(
      [...segmentIdsByEdgeId].map(([edgeId, ids]) => [
        edgeId,
        // ELK restores north/south branches after long-edge joining. Keep
        // those appended junctions after all original routing junctions.
        [
          // Long-edge joining runs before edge-direction restoration. Its
          // junction chain retains physical flow order on reversed edges.
          ...(reversedSegmentIds?.has(ids[0]!) ? [...ids].reverse() : ids).flatMap((id) => {
            const points = routes.junctionPointsByEdgeId?.get(id) ?? [];
            return points.slice(0, points.length - (restoredJunctionCounts?.get(id) ?? 0));
          }),
          ...ids.flatMap((id) => {
            const count = restoredJunctionCounts?.get(id) ?? 0;
            return count ? (routes.junctionPointsByEdgeId?.get(id) ?? []).slice(-count) : [];
          }),
        ],
      ]),
    );
  return {
    pointsByEdgeId,
    outsideFeedbackEdgeIds,
    ...(junctionPointsByEdgeId ? { junctionPointsByEdgeId } : {}),
  };
}
