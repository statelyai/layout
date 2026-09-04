import type { Graph, GraphEdge, GraphNode, Point, VisualGraph, VisualNode } from "@statelyai/graph";
import { UnsupportedLayoutError } from "../errors";
import type { LayoutAlgorithm, LayoutExecutionContext } from "../types";
import {
  assignLayersByLongestPath,
  assignLayersByLongestPathToSink,
  assignLayersByBreadthFirstModelOrder,
  assignLayersByDepthFirstModelOrder,
  assignLayersInteractively,
  assignLayersWithCoffmanGraham,
  applyLayerConstraints,
  applyLayerConstraintOrientation,
  applyPartitionOrientation,
  applyPartitions,
  applyLayerConstraintOrder,
  applyLayerUnzipping,
  applyGreedySwitch,
  applyDirectionCongruency,
  applyForcedModelOrder,
  applyPostCompaction,
  applySemiInteractiveOrder,
  breakCyclesByModelOrder,
  breakCyclesByStronglyConnectedConnectivity,
  breakCyclesByStronglyConnectedNodeType,
  breakCyclesGreedily,
  breakCyclesGreedilyByModelOrder,
  breakCyclesInteractively,
  breakCyclesWithModelOrderDepthFirstSearch,
  breakCyclesWithModelOrderBreadthFirstSearch,
  breakCyclesWithDepthFirstSearch,
  getPolylineMidpoint,
  getOrientedPortDirection,
  minimizeCrossingsWithBarycenter,
  minimizeCrossingsWithMedian,
  minimizeCrossingsInteractively,
  minimizeCrossingsWithModelOrder,
  normalizePlacementForPortExtents,
  placeNodesInLayers,
  placeNodesInteractively,
  placePorts,
  routeEdgesOrthogonally,
  routeEdgesWithPolylines,
  routeEdgesWithSplines,
} from "./strategies";
import type { LayeredLayoutOptions, LayeredPhaseInput, NodeSize } from "./types";
import { assignLayersWithNetworkSimplex } from "./network-simplex";
import { assignLayersWithMinWidth } from "./min-width";
import { assignLayersWithStretchWidth } from "./stretch-width";
import { joinLongEdgeRoutes, splitLongEdges } from "./long-edges";
import { unzipLayersAlternating } from "./layer-unzipping";
import { placeNodesWithBrandesKoepf } from "./bk-node-placement";
import { placeNodesWithLinearSegments } from "./linear-segments-node-placement";
import { placeNodesWithNetworkSimplex } from "./network-simplex-node-placement";
import { applyHighDegreeNodeTreatment } from "./high-degree";
import { applyNodePromotion } from "./node-promotion";
import {
  foldMultiEdgeBreakingPoints,
  insertMultiEdgeBreakingPoints,
  joinFoldedMultiEdgeRoutes,
} from "./multi-edge-wrapping";

export type {
  AcyclicOrientation,
  CrossingMinimizer,
  CycleBreaker,
  EdgeRouter,
  EdgeRoutes,
  LayerAssigner,
  LayerAssignment,
  LayeredLayoutOptions,
  LayeredPhaseInput,
  LayeredSpacing,
  LayeredStrategies,
  LayoutPadding,
  LayerOrder,
  NodePlacement,
  NodePlacer,
  NodeSize,
} from "./types";

export {
  assignLayersByLongestPath,
  assignLayersByLongestPathToSink,
  assignLayersByBreadthFirstModelOrder,
  assignLayersByDepthFirstModelOrder,
  assignLayersInteractively,
  assignLayersWithCoffmanGraham,
  breakCyclesByModelOrder,
  breakCyclesByStronglyConnectedConnectivity,
  breakCyclesByStronglyConnectedNodeType,
  breakCyclesWithDepthFirstSearch,
  breakCyclesGreedily,
  breakCyclesGreedilyByModelOrder,
  breakCyclesInteractively,
  breakCyclesWithModelOrderDepthFirstSearch,
  breakCyclesWithModelOrderBreadthFirstSearch,
  minimizeCrossingsWithBarycenter,
  minimizeCrossingsWithMedian,
  minimizeCrossingsInteractively,
  minimizeCrossingsWithModelOrder,
  placeNodesInLayers,
  placeNodesInteractively,
  routeEdgesOrthogonally,
  routeEdgesWithPolylines,
  routeEdgesWithSplines,
} from "./strategies";
export { assignLayersWithNetworkSimplex } from "./network-simplex";
export { assignLayersWithMinWidth } from "./min-width";
export { assignLayersWithStretchWidth } from "./stretch-width";
export { placeNodesWithBrandesKoepf } from "./bk-node-placement";
export { placeNodesWithLinearSegments } from "./linear-segments-node-placement";
export { placeNodesWithNetworkSimplex } from "./network-simplex-node-placement";
export {
  elkLayeredEnumValues,
  elkLayeredOptionDefinitions,
  fromElkLayeredOptionId,
  toElkLayeredOptions,
} from "./elk-options";
export type {
  CycleBreakingStrategy,
  CrossingMinimizationStrategy,
  EdgeRoutingStyle,
  ElkLayeredOptionId,
  ElkLayeredOptionName,
  ElkLayeredOptionValueByName,
  LayeredAdvancedOptions,
  LayeringStrategy,
  NodePlacementStrategy,
} from "./elk-options";

const DEFAULT_NODE_SIZE: NodeSize = { width: 0, height: 0 };

function adjustUnzippedSinkRoutes<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  routes: ReadonlyMap<string, readonly Point[]>,
  direction: "up" | "down" | "left" | "right",
  edgeNodeSpacing: number,
  edgeEdgeSpacing: number,
): ReadonlyMap<string, readonly Point[]> {
  const horizontal = direction === "left" || direction === "right";
  const flow = (point: Point): number => (horizontal ? point.x : point.y);
  const cross = (point: Point): number => (horizontal ? point.y : point.x);
  const result = new Map(routes);
  const incomingByTarget = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    const incoming = incomingByTarget.get(edge.targetId) ?? [];
    incoming.push(edge);
    incomingByTarget.set(edge.targetId, incoming);
  }
  for (const incoming of incomingByTarget.values()) {
    if (incoming.length < 3) continue;
    const routed = incoming.flatMap((edge) => {
      const points = result.get(edge.id);
      return points && points.length >= 2 ? [{ edge, start: points[0]!, end: points.at(-1)! }] : [];
    });
    if (!routed.some(({ start, end }) => Math.abs(cross(start) - cross(end)) < 1e-9)) continue;
    const before = routed
      .filter(({ start, end }) => cross(start) < cross(end) - 1e-9)
      .sort((left, right) => cross(left.start) - cross(right.start));
    const after = routed
      .filter(({ start, end }) => cross(start) > cross(end) + 1e-9)
      .sort((left, right) => cross(left.start) - cross(right.start));
    const rewrite = (
      candidates: typeof before,
      distance: (index: number, count: number) => number,
    ): void => {
      for (const [index, { edge, start, end }] of candidates.entries()) {
        const sign = flow(end) >= flow(start) ? 1 : -1;
        const desired =
          flow(end) -
          sign * (edgeNodeSpacing + distance(index, candidates.length) * edgeEdgeSpacing);
        const minimum = flow(start) + sign * edgeNodeSpacing;
        const track = sign > 0 ? Math.max(minimum, desired) : Math.min(minimum, desired);
        result.set(
          edge.id,
          horizontal
            ? [start, { x: track, y: start.y }, { x: track, y: end.y }, end]
            : [start, { x: start.x, y: track }, { x: end.x, y: track }, end],
        );
      }
    };
    rewrite(before, (index) => index + 1);
    rewrite(after, (index, count) => count - 1 - index);
  }
  return result;
}

function getNodeSize(node: GraphNode, options: LayeredLayoutOptions): NodeSize {
  const measured = options.measure?.(node);
  if (measured) return measured;
  return {
    width: node.width !== undefined && node.width >= 0 ? node.width : DEFAULT_NODE_SIZE.width,
    height: node.height !== undefined && node.height >= 0 ? node.height : DEFAULT_NODE_SIZE.height,
  };
}

function hasNestedNodes(graph: Graph): boolean {
  return graph.nodes.some((node) => node.parentId != null);
}

function runWrappedPathPipeline<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
): VisualGraph<N, E, G, P> | undefined {
  const strategy = options.settings?.["wrapping.strategy"] ?? "OFF";
  const improveMultiEdgeCuts = options.settings?.["wrapping.multiEdge.improveCuts"] ?? true;
  const multiEdgeDistancePenalty = Number(
    options.settings?.["wrapping.multiEdge.distancePenalty"] ?? 2,
  );
  const improveWrappedEdges = options.settings?.["wrapping.multiEdge.improveWrappedEdges"] ?? true;
  // A path has one edge spanning every candidate cut, so all three multi-edge
  // refinements are mathematically neutral. General graphs use them below.
  void improveMultiEdgeCuts;
  void multiEdgeDistancePenalty;
  void improveWrappedEdges;
  const direction = options.direction ?? graph.direction ?? "right";
  if (strategy === "OFF" || direction !== "right" || graph.nodes.length < 2) return undefined;
  if (graph.edges.length !== graph.nodes.length - 1) return undefined;
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  const edgeByPair = new Map<string, (typeof graph.edges)[number]>();
  for (const edge of graph.edges) {
    if (edge.sourceId === edge.targetId) return undefined;
    outgoing.get(edge.sourceId)?.push(edge.targetId);
    indegree.set(edge.targetId, (indegree.get(edge.targetId) ?? 0) + 1);
    edgeByPair.set(`${edge.sourceId}\0${edge.targetId}`, edge);
  }
  const source = graph.nodes.find((node) => indegree.get(node.id) === 0);
  if (!source) return undefined;
  const orderedIds: string[] = [];
  let currentId: string | undefined = source.id;
  const seen = new Set<string>();
  while (currentId !== undefined && !seen.has(currentId)) {
    seen.add(currentId);
    orderedIds.push(currentId);
    const targets: string[] = outgoing.get(currentId) ?? [];
    if (targets.length > 1) return undefined;
    currentId = targets[0];
  }
  if (orderedIds.length !== graph.nodes.length) return undefined;

  const sizes = new Map(graph.nodes.map((node) => [node.id, getNodeSize(node, options)]));
  const maximumWidth = Math.max(...[...sizes.values()].map((size) => size.width));
  const maximumHeight = Math.max(...[...sizes.values()].map((size) => size.height));
  if (
    [...sizes.values()].some((size) => size.width !== maximumWidth || size.height !== maximumHeight)
  ) {
    return undefined;
  }
  const aspectRatio = Number(options.settings?.aspectRatio ?? 1.6);
  const correctionFactor = Number(options.settings?.["wrapping.correctionFactor"] ?? 1);
  const layerSpacing = options.spacing?.layer ?? options.settings?.["spacing.baseValue"] ?? 20;
  const nodeSpacing = options.spacing?.node ?? options.settings?.["spacing.baseValue"] ?? 20;
  const additionalSpacing = Number(options.settings?.["wrapping.additionalEdgeSpacing"] ?? 10);
  const estimatedRowStep = maximumHeight + nodeSpacing + 1 + additionalSpacing * 2;
  const automaticColumns = Math.min(
    orderedIds.length,
    Math.max(1, Math.ceil(Math.sqrt(orderedIds.length * aspectRatio * correctionFactor))),
  );
  const cuttingStrategy = String(options.settings?.["wrapping.cutting.strategy"] ?? "MSD");
  const initialRows = Math.ceil(orderedIds.length / automaticColumns);
  const freedom = Math.max(0, Number(options.settings?.["wrapping.cutting.msd.freedom"] ?? 1));
  let automaticRows = initialRows;
  if (cuttingStrategy === "MSD") {
    let bestScore = Number.POSITIVE_INFINITY;
    for (
      let rows = Math.max(1, initialRows - freedom);
      rows <= Math.min(orderedIds.length, initialRows + freedom);
      rows++
    ) {
      const score = Math.max(
        Math.ceil(orderedIds.length / rows) * (maximumWidth + layerSpacing),
        aspectRatio * correctionFactor * rows * estimatedRowStep,
      );
      if (score < bestScore) {
        bestScore = score;
        automaticRows = rows;
      }
    }
  }
  let cuts =
    cuttingStrategy === "MANUAL" && Array.isArray(options.settings?.["wrapping.cutting.cuts"])
      ? (options.settings["wrapping.cutting.cuts"] as unknown[])
          .map(Number)
          .filter((cut) => Number.isInteger(cut) && cut > 0 && cut < orderedIds.length)
          .sort((left, right) => left - right)
      : Array.from({ length: Math.max(0, automaticRows - 1) }, (_, index) =>
          cuttingStrategy === "ARD"
            ? Math.round(((index + 1) * orderedIds.length) / automaticRows)
            : Math.min(
                orderedIds.length - 1,
                (index + 1) * Math.ceil(orderedIds.length / automaticRows),
              ),
        );
  cuts = [...new Set(cuts)];
  const forbidden = new Set(
    Array.isArray(options.settings?.["wrapping.validify.forbiddenIndices"])
      ? (options.settings["wrapping.validify.forbiddenIndices"] as unknown[]).map(Number)
      : [],
  );
  const validify = String(options.settings?.["wrapping.validify.strategy"] ?? "GREEDY");
  if (validify !== "NO" && forbidden.size > 0) {
    const adjusted: number[] = [];
    let offset = 0;
    for (const desired of cuts) {
      const current = desired + offset;
      let upper = current;
      while (upper < orderedIds.length && forbidden.has(upper)) upper++;
      let selected = upper;
      if (validify === "LOOK_BACK") {
        let lower = current;
        while (lower > 0 && forbidden.has(lower)) lower--;
        if (current - lower <= upper - current && lower > (adjusted.at(-1) ?? 0)) selected = lower;
      }
      if (selected >= orderedIds.length) break;
      if (selected > (adjusted.at(-1) ?? 0)) adjusted.push(selected);
      offset += selected - current;
    }
    cuts = adjusted;
  }
  if (cuts.length === 0) return undefined;
  const boundaries = [0, ...cuts, orderedIds.length];
  const rowByIndex = new Map<number, { row: number; column: number }>();
  for (let row = 0; row + 1 < boundaries.length; row++) {
    for (let index = boundaries[row]!; index < boundaries[row + 1]!; index++) {
      rowByIndex.set(index, { row, column: index - boundaries[row]! });
    }
  }
  const padding =
    typeof options.padding === "number"
      ? {
          top: options.padding,
          right: options.padding,
          bottom: options.padding,
          left: options.padding,
        }
      : {
          top: options.padding?.top ?? 12,
          right: options.padding?.right ?? 12,
          bottom: options.padding?.bottom ?? 12,
          left: options.padding?.left ?? 12,
        };
  const structuralMargin = strategy === "MULTI_EDGE" ? 30 : 10;
  const rowStep = estimatedRowStep;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const visualNodeById = new Map<string, VisualNode<N, P>>();
  for (const [index, id] of orderedIds.entries()) {
    const node = nodeById.get(id)!;
    const size = sizes.get(id)!;
    const cell = rowByIndex.get(index) ?? { row: 0, column: index };
    visualNodeById.set(id, {
      ...node,
      x: padding.left + structuralMargin + cell.column * (maximumWidth + layerSpacing),
      y: padding.top + cell.row * rowStep,
      ...size,
    } as VisualNode<N, P>);
  }
  const visualEdgeById = new Map<string, VisualGraph<N, E, G, P>["edges"][number]>();
  for (let index = 0; index + 1 < orderedIds.length; index++) {
    const sourceId = orderedIds[index]!;
    const targetId = orderedIds[index + 1]!;
    const edge = edgeByPair.get(`${sourceId}\0${targetId}`)!;
    const sourceNode = visualNodeById.get(sourceId)!;
    const targetNode = visualNodeById.get(targetId)!;
    const start = {
      x: (sourceNode.x ?? 0) + (sourceNode.width ?? 0),
      y: (sourceNode.y ?? 0) + (sourceNode.height ?? 0) / 2,
    };
    const end = {
      x: targetNode.x ?? 0,
      y: (targetNode.y ?? 0) + (targetNode.height ?? 0) / 2,
    };
    const wraps = cuts.includes(index + 1);
    const points = wraps
      ? [
          start,
          { x: start.x + structuralMargin, y: start.y },
          {
            x: start.x + structuralMargin,
            y: start.y + nodeSpacing + additionalSpacing,
          },
          { x: padding.left, y: start.y + nodeSpacing + additionalSpacing },
          { x: padding.left, y: end.y },
          end,
        ]
      : [start, end];
    visualEdgeById.set(edge.id, {
      ...edge,
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
      width: edge.width ?? 0,
      height: edge.height ?? 0,
      points,
      routing: "orthogonal",
    });
  }
  return {
    ...graph,
    direction,
    nodes: graph.nodes.map((node) => visualNodeById.get(node.id)!),
    edges: graph.edges.map((edge) => visualEdgeById.get(edge.id)!),
  } as VisualGraph<N, E, G, P>;
}

function runWrappedMultiEdgePipeline<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
): VisualGraph<N, E, G, P> | undefined {
  if (
    (options.settings?.["wrapping.strategy"] ?? "OFF") !== "MULTI_EDGE" ||
    (options.direction ?? graph.direction ?? "right") !== "right" ||
    graph.nodes.length < 2
  ) {
    return undefined;
  }
  const nodeIndex = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    if (
      !nodeIndex.has(edge.sourceId) ||
      !nodeIndex.has(edge.targetId) ||
      edge.sourceId === edge.targetId
    )
      return undefined;
    outgoing.get(edge.sourceId)!.push(edge.targetId);
    incoming.get(edge.targetId)!.push(edge.sourceId);
    indegree.set(edge.targetId, (indegree.get(edge.targetId) ?? 0) + 1);
  }
  const queue = graph.nodes
    .filter((node) => indegree.get(node.id) === 0)
    .sort((left, right) => nodeIndex.get(left.id)! - nodeIndex.get(right.id)!)
    .map((node) => node.id);
  const rank = new Map(graph.nodes.map((node) => [node.id, 0]));
  const topological: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topological.push(id);
    for (const targetId of outgoing.get(id) ?? []) {
      rank.set(targetId, Math.max(rank.get(targetId) ?? 0, (rank.get(id) ?? 0) + 1));
      indegree.set(targetId, (indegree.get(targetId) ?? 1) - 1);
      if (indegree.get(targetId) === 0) {
        queue.push(targetId);
        queue.sort((left, right) => nodeIndex.get(left)! - nodeIndex.get(right)!);
      }
    }
  }
  if (topological.length !== graph.nodes.length) return undefined;
  const maximumRank = Math.max(...rank.values());
  const nodeIdByRank = new Map<string | number, string>();
  for (const [id, value] of rank) {
    if (nodeIdByRank.has(value)) return undefined;
    nodeIdByRank.set(value, id);
  }
  if (nodeIdByRank.size !== maximumRank + 1) return undefined;
  const orderedIds = Array.from({ length: maximumRank + 1 }, (_, index) =>
    nodeIdByRank.get(index)!,
  );
  const sizes = new Map(graph.nodes.map((node) => [node.id, getNodeSize(node, options)]));
  const layerSpacing = options.spacing?.layer ?? options.settings?.["spacing.baseValue"] ?? 20;
  const nodeSpacing = options.spacing?.node ?? options.settings?.["spacing.baseValue"] ?? 20;
  const widths = orderedIds.map((id) => sizes.get(id)!.width + layerSpacing);
  const heights = orderedIds.map((id) => sizes.get(id)!.height + nodeSpacing);
  const aspectRatio = Number(options.settings?.aspectRatio ?? 1.6);
  const correctionFactor = Number(options.settings?.["wrapping.correctionFactor"] ?? 1);
  const desiredAspectRatio = aspectRatio * correctionFactor;
  const rowCount = Math.max(
    1,
    Math.min(
      orderedIds.length,
      Math.round(
        Math.sqrt(
          widths.reduce((sum, width) => sum + width, 0) /
            (desiredAspectRatio * Math.max(...heights)),
        ),
      ),
    ),
  );
  const cuttingStrategy = String(options.settings?.["wrapping.cutting.strategy"] ?? "MSD");
  let cuts: number[];
  if (cuttingStrategy === "MANUAL" && Array.isArray(options.settings?.["wrapping.cutting.cuts"])) {
    cuts = (options.settings["wrapping.cutting.cuts"] as unknown[])
      .map(Number)
      .filter((cut) => Number.isInteger(cut) && cut > 0 && cut < orderedIds.length)
      .sort((left, right) => left - right);
  } else if (cuttingStrategy === "ARD") {
    cuts = Array.from({ length: rowCount - 1 }, (_, index) =>
      Math.round(((index + 1) * orderedIds.length) / rowCount),
    );
  } else {
    const freedom = Math.max(0, Number(options.settings?.["wrapping.cutting.msd.freedom"] ?? 1));
    const prefixWidths: number[] = [];
    widths.reduce((sum, width, index) => (prefixWidths[index] = sum + width), 0);
    const totalWidth = prefixWidths.at(-1)!;
    let bestScale = Number.NEGATIVE_INFINITY;
    cuts = [];
    for (
      let cutCount = Math.max(0, rowCount - 1 - freedom);
      cutCount <= Math.min(orderedIds.length - 1, rowCount - 1 + freedom);
      cutCount++
    ) {
      const rowWidth = totalWidth / (cutCount + 1);
      const candidate: number[] = [];
      let sumSoFar = 0;
      let lastCutWidth = 0;
      let maximumWidth = Number.NEGATIVE_INFINITY;
      let totalHeight = 0;
      let rowHeight = heights[0]!;
      if (cutCount === 0) {
        maximumWidth = totalWidth;
        totalHeight = Math.max(...heights);
      } else {
        for (let index = 1; index < orderedIds.length; index++) {
          if (prefixWidths[index - 1]! - sumSoFar >= rowWidth) {
            candidate.push(index);
            maximumWidth = Math.max(maximumWidth, prefixWidths[index - 1]! - lastCutWidth);
            totalHeight += rowHeight;
            sumSoFar += prefixWidths[index - 1]! - sumSoFar;
            lastCutWidth = prefixWidths[index - 1]!;
            rowHeight = heights[index]!;
          }
          rowHeight = Math.max(rowHeight, heights[index]!);
        }
        totalHeight += rowHeight;
      }
      const scale = Math.min(1 / maximumWidth, 1 / desiredAspectRatio / totalHeight);
      if (scale > bestScale) {
        bestScale = scale;
        cuts = candidate;
      }
    }
  }
  cuts = [...new Set(cuts)];
  if (options.settings?.["wrapping.multiEdge.improveCuts"] ?? true) {
    const spans = Array.from({ length: orderedIds.length + 1 }, () => 0);
    for (const edge of graph.edges) {
      const sourceRank = rank.get(edge.sourceId)!;
      const targetRank = rank.get(edge.targetId)!;
      for (let index = sourceRank + 1; index <= targetRank; index++) spans[index]!++;
    }
    const distancePenalty = Number(options.settings?.["wrapping.multiEdge.distancePenalty"] ?? 2);
    type Cut = {
      index: number;
      newIndex: number;
      assigned: boolean;
      previous?: Cut;
      next?: Cut;
    };
    const candidates: Cut[] = cuts.map((index) => ({ index, newIndex: index, assigned: false }));
    for (let index = 0; index < candidates.length; index++) {
      candidates[index]!.previous = candidates[index - 1];
      candidates[index]!.next = candidates[index + 1];
    }
    const nextUnassigned = (candidate: Cut | undefined): Cut | undefined => {
      while (candidate?.assigned) candidate = candidate.next;
      return candidate;
    };
    const improved: number[] = [];
    for (let iteration = 0; iteration < candidates.length; iteration++) {
      let left: Cut | undefined;
      let right = nextUnassigned(candidates[0]);
      let best: { candidate: Cut; index: number; score: number } | undefined;
      for (let index = 1; index < orderedIds.length; index++) {
        const rightDistance = right
          ? Math.abs(right.index - index)
          : Math.abs(index - left!.index) + 1;
        const leftDistance = left ? Math.abs(index - left.index) : rightDistance + 1;
        const candidate = leftDistance < rightDistance ? left! : right!;
        const distance = Math.min(leftDistance, rightDistance);
        const score = spans[index]! + Math.pow(distance, distancePenalty);
        if (!best || score < best.score) best = { candidate, index, score };
        if (right && index === right.index) {
          left = right;
          right = nextUnassigned(right.next);
        }
      }
      if (!best) break;
      const offset = best.index - best.candidate.index;
      best.candidate.newIndex = best.index;
      best.candidate.assigned = true;
      improved.push(best.index);
      let previous = best.candidate.previous;
      while (previous && !previous.assigned) {
        previous.index += offset;
        previous = previous.previous;
      }
      let next = best.candidate.next;
      while (next && !next.assigned) {
        next.index += offset;
        next = next.next;
      }
    }
    cuts = improved.sort((left, right) => left - right);
  }
  const forbidden = new Set(
    Array.isArray(options.settings?.["wrapping.validify.forbiddenIndices"])
      ? (options.settings["wrapping.validify.forbiddenIndices"] as unknown[]).map(Number)
      : [],
  );
  const validify = String(options.settings?.["wrapping.validify.strategy"] ?? "NO");
  if (options.settings?.["wrapping.validify.strategy"] !== undefined && validify !== "NO") {
    cuts = cuts.flatMap((cut, cutIndex) => {
      const allowed = (index: number) => {
        if (forbidden.size > 0) return !forbidden.has(index);
        const targetId = orderedIds[index];
        if (!targetId) return false;
        const pairs = new Set(
          (incoming.get(targetId) ?? []).map((sourceId) => `${sourceId}\0${targetId}`),
        );
        return pairs.size <= 1;
      };
      if (allowed(cut)) return [cut];
      if (validify === "LOOK_BACK") {
        for (let index = cut - 1; index > (cuts[cutIndex - 1] ?? 0); index--)
          if (allowed(index)) return [index];
      }
      for (let index = cut + 1; index < orderedIds.length; index++)
        if (allowed(index)) return [index];
      return [];
    });
  }
  cuts = [...new Set(cuts)].sort((left, right) => left - right);
  if (cuts.length === 0) return undefined;

  const wrappedPadding =
    typeof options.padding === "number"
      ? {
          top: options.padding,
          right: options.padding,
          bottom: options.padding,
          left: options.padding,
        }
      : {
          top: options.padding?.top ?? 12,
          right: options.padding?.right ?? 12,
          bottom: options.padding?.bottom ?? 12,
          left: options.padding?.left ?? 12,
        };
  const phaseInput: LayeredPhaseInput = {
    graph: graph as Graph<unknown, unknown, unknown, unknown>,
    sizes,
    direction: "right",
    spacing: { node: nodeSpacing, layer: layerSpacing },
    padding: wrappedPadding,
    constrainedLayerByNodeId: new Map(),
    settings: options.settings ?? {},
    ...(options.nodeSettings === undefined ? {} : { nodeSettings: options.nodeSettings }),
    ...(options.edgeSettings === undefined ? {} : { edgeSettings: options.edgeSettings }),
    ...(options.portSettings === undefined ? {} : { portSettings: options.portSettings }),
  };
  const prepared = insertMultiEdgeBreakingPoints(
    phaseInput,
    { reversedEdgeIds: new Set() },
    { layerByNodeId: rank },
    cuts,
  );
  const brokenExpansion = splitLongEdges(prepared.input, prepared.orientation, prepared.assignment);
  const crossingStrategy = options.settings?.["crossingMinimization.strategy"] ?? "LAYER_SWEEP";
  const crossingMinimizer =
    crossingStrategy === "MEDIAN_LAYER_SWEEP"
      ? minimizeCrossingsWithMedian(options.crossingSweeps)
      : crossingStrategy === "INTERACTIVE"
        ? minimizeCrossingsInteractively
        : crossingStrategy === "NONE"
          ? minimizeCrossingsWithModelOrder
          : minimizeCrossingsWithBarycenter(options.crossingSweeps);
  const crossedOrder = applyLayerConstraintOrder(
    brokenExpansion.input,
    applyGreedySwitch(
      brokenExpansion.input,
      brokenExpansion.orientation,
      applySemiInteractiveOrder(
        brokenExpansion.input,
        applyForcedModelOrder(
          brokenExpansion.input,
          brokenExpansion.orientation,
          crossingMinimizer(
            brokenExpansion.input,
            brokenExpansion.orientation,
            brokenExpansion.assignment,
          ),
        ),
      ),
    ),
  );
  const folded = foldMultiEdgeBreakingPoints(brokenExpansion, crossedOrder, prepared);
  const placementStrategy = options.settings?.["nodePlacement.strategy"] ?? "BRANDES_KOEPF";
  const placement =
    placementStrategy === "INTERACTIVE"
      ? placeNodesInteractively(folded.expansion.input, folded.order)
      : placementStrategy === "LINEAR_SEGMENTS"
        ? placeNodesWithLinearSegments(folded.expansion.input, folded.order)
        : placementStrategy === "NETWORK_SIMPLEX"
          ? placeNodesWithNetworkSimplex(folded.expansion.input, folded.order)
          : placementStrategy === "SIMPLE"
            ? placeNodesInLayers(folded.expansion.input, folded.order)
            : placeNodesWithBrandesKoepf(folded.expansion.input, folded.order);
  const routing = options.settings?.edgeRouting ?? "ORTHOGONAL";
  const router =
    routing === "POLYLINE"
      ? routeEdgesWithPolylines
      : routing === "SPLINES"
        ? routeEdgesWithSplines
        : routeEdgesOrthogonally;
  const internalRoutes = router(folded.expansion.input, folded.expansion.orientation, placement);
  const publicPointsByEdgeId = joinFoldedMultiEdgeRoutes(
    graph as Graph<unknown, unknown, unknown, unknown>,
    prepared,
    folded,
    placement,
    internalRoutes,
    routing,
  );
  const visualNodeById = new Map<string, VisualNode<N, P>>();
  for (const node of graph.nodes) {
    const rect = placement.rectByNodeId.get(node.id);
    if (!rect) return undefined;
    visualNodeById.set(node.id, {
      ...node,
      ...rect,
      ports: placePorts(node.ports, rect, "right", (port) => options.portSettings?.(port, node), {
        ...options.settings,
        ...options.nodeSettings?.(node),
      }),
    } as VisualNode<N, P>);
  }
  const visualEdges = graph.edges.map((edge) => {
    const points = publicPointsByEdgeId.get(edge.id) ?? [];
    const first = points[0] ?? { x: 0, y: 0 };
    const last = points.at(-1) ?? first;
    return {
      ...edge,
      x: (first.x + last.x) / 2,
      y: (first.y + last.y) / 2,
      width: edge.width ?? 0,
      height: edge.height ?? 0,
      points,
      routing: routing === "SPLINES" ? ("spline" as const) : ("orthogonal" as const),
    };
  });
  return {
    ...graph,
    direction: "right",
    nodes: graph.nodes.map((node) => visualNodeById.get(node.id)!),
    edges: visualEdges,
  } as VisualGraph<N, E, G, P>;
}

function runWrappedPipeline<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
): VisualGraph<N, E, G, P> | undefined {
  return runWrappedPathPipeline(graph, options) ?? runWrappedMultiEdgePipeline(graph, options);
}

function runCommentBoxPipeline<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
  context?: LayoutExecutionContext,
): VisualGraph<N, E, G, P> | undefined {
  const commentIds = new Set(
    graph.nodes
      .filter(
        (node) =>
          options.nodeSettings?.(node)?.commentBox === true &&
          graph.edges.filter((edge) => edge.sourceId === node.id || edge.targetId === node.id)
            .length === 1,
      )
      .map((node) => node.id),
  );
  if (commentIds.size === 0) return undefined;
  const ordinaryNodeById = new Map(
    graph.nodes.filter((node) => !commentIds.has(node.id)).map((node) => [node.id, node]),
  );
  const commentsByTargetId = new Map<string, GraphNode[]>();
  for (const commentId of commentIds) {
    const attachment = graph.edges.find(
      (edge) =>
        (edge.sourceId === commentId && ordinaryNodeById.has(edge.targetId)) ||
        (edge.targetId === commentId && ordinaryNodeById.has(edge.sourceId)),
    );
    if (!attachment) continue;
    const targetId = attachment.sourceId === commentId ? attachment.targetId : attachment.sourceId;
    const comments = commentsByTargetId.get(targetId) ?? [];
    const comment = graph.nodes.find((node) => node.id === commentId);
    if (comment) comments.push(comment);
    commentsByTargetId.set(targetId, comments);
  }
  if (commentsByTargetId.size !== 1) return undefined;

  const [targetId, comments] = [...commentsByTargetId][0]!;
  const target = ordinaryNodeById.get(targetId);
  if (!target) return undefined;
  const direction = options.direction ?? graph.direction ?? "right";
  const horizontal = direction === "left" || direction === "right";
  const commentNodeSpacing = Number(options.settings?.["spacing.commentNode"] ?? 10);
  const commentCommentSpacing = Number(options.settings?.["spacing.commentComment"] ?? 10);
  const targetSize = getNodeSize(target, options);
  const commentSizes = comments.map((comment) => getNodeSize(comment, options));
  const beforeIndexes = comments.flatMap((_, index) => (index % 2 === 0 ? [index] : []));
  const afterIndexes = comments.flatMap((_, index) => (index % 2 === 1 ? [index] : []));
  const rowFlowSize = (indexes: readonly number[]) =>
    indexes.reduce(
      (sum, index) => sum + (horizontal ? commentSizes[index]!.width : commentSizes[index]!.height),
      0,
    ) +
    Math.max(0, indexes.length - 1) * commentCommentSpacing;
  const rowCrossSize = (indexes: readonly number[]) =>
    Math.max(
      0,
      ...indexes.map((index) =>
        horizontal ? commentSizes[index]!.height : commentSizes[index]!.width,
      ),
    );
  const beforeFlowSize = rowFlowSize(beforeIndexes);
  const afterFlowSize = rowFlowSize(afterIndexes);
  const beforeCrossSize = rowCrossSize(beforeIndexes);
  const afterCrossSize = rowCrossSize(afterIndexes);
  const targetCrossOffset = beforeCrossSize + (beforeIndexes.length > 0 ? commentNodeSpacing : 0);
  const groupSize = horizontal
    ? {
        width: Math.max(targetSize.width, beforeFlowSize, afterFlowSize),
        height:
          targetCrossOffset +
          targetSize.height +
          (afterIndexes.length > 0 ? commentNodeSpacing : 0) +
          afterCrossSize,
      }
    : {
        width:
          targetCrossOffset +
          targetSize.width +
          (afterIndexes.length > 0 ? commentNodeSpacing : 0) +
          afterCrossSize,
        height: Math.max(targetSize.height, beforeFlowSize, afterFlowSize),
      };
  const baseGraph = {
    ...graph,
    nodes: graph.nodes
      .filter((node) => !commentIds.has(node.id))
      .map((node) => (node.id === targetId ? { ...node, ...groupSize } : node)),
    edges: graph.edges.filter(
      (edge) => !commentIds.has(edge.sourceId) && !commentIds.has(edge.targetId),
    ),
  } as Graph<N, E, G, P>;
  const base = runLayeredPipeline(
    baseGraph,
    {
      ...options,
      measure: (node) =>
        node.id === targetId ? groupSize : (options.measure?.(node) ?? getNodeSize(node, options)),
    },
    context,
  );
  const groupRect = base.nodes.find((node) => node.id === targetId);
  if (!groupRect) return undefined;
  const crossShift =
    targetCrossOffset -
    ((horizontal ? groupSize.height : groupSize.width) -
      (horizontal ? targetSize.height : targetSize.width)) /
      2;
  const visualNodeById = new Map<string, VisualNode<N, P>>();
  for (const node of base.nodes) {
    if (node.id === targetId) continue;
    visualNodeById.set(node.id, {
      ...node,
      x: horizontal ? node.x : (node.x ?? 0) + crossShift,
      y: horizontal ? (node.y ?? 0) + crossShift : node.y,
    });
  }
  const targetFlowInset =
    ((horizontal ? groupSize.width : groupSize.height) -
      (horizontal ? targetSize.width : targetSize.height)) /
    2;
  const targetRect = {
    ...target,
    x: horizontal ? (groupRect.x ?? 0) + targetFlowInset : (groupRect.x ?? 0) + targetCrossOffset,
    y: horizontal ? (groupRect.y ?? 0) + targetCrossOffset : (groupRect.y ?? 0) + targetFlowInset,
    ...targetSize,
  } as VisualNode<N, P>;
  visualNodeById.set(targetId, targetRect);

  for (const [indexes, before] of [
    [beforeIndexes, true],
    [afterIndexes, false],
  ] as const) {
    let flowOffset = ((horizontal ? groupSize.width : groupSize.height) - rowFlowSize(indexes)) / 2;
    for (const index of indexes) {
      const comment = comments[index]!;
      const size = commentSizes[index]!;
      const visual = {
        ...comment,
        x: horizontal
          ? (groupRect.x ?? 0) + flowOffset
          : before
            ? (targetRect.x ?? 0) - commentNodeSpacing - size.width
            : (targetRect.x ?? 0) + (targetRect.width ?? 0) + commentNodeSpacing,
        y: horizontal
          ? before
            ? (targetRect.y ?? 0) - commentNodeSpacing - size.height
            : (targetRect.y ?? 0) + (targetRect.height ?? 0) + commentNodeSpacing
          : (groupRect.y ?? 0) + flowOffset,
        ...size,
      } as VisualNode<N, P>;
      visualNodeById.set(comment.id, visual);
      flowOffset += (horizontal ? size.width : size.height) + commentCommentSpacing;
    }
  }

  const normalEdgeById = new Map(
    base.edges.map((edge) => {
      const points = (edge.points ?? []).map((point) => ({
        x: horizontal ? point.x : point.x + crossShift,
        y: horizontal ? point.y + crossShift : point.y,
      }));
      const endpoint = (source: boolean) => {
        if (horizontal) {
          return {
            x:
              (direction === "right") === source
                ? (targetRect.x ?? 0) + (targetRect.width ?? 0)
                : (targetRect.x ?? 0),
            y: (targetRect.y ?? 0) + (targetRect.height ?? 0) / 2,
          };
        }
        return {
          x: (targetRect.x ?? 0) + (targetRect.width ?? 0) / 2,
          y:
            (direction === "down") === source
              ? (targetRect.y ?? 0) + (targetRect.height ?? 0)
              : (targetRect.y ?? 0),
        };
      };
      if (edge.sourceId === targetId && points.length > 0) points[0] = endpoint(true);
      if (edge.targetId === targetId && points.length > 0)
        points[points.length - 1] = endpoint(false);
      return [
        edge.id,
        {
          ...edge,
          x: horizontal ? edge.x : (edge.x ?? 0) + crossShift,
          y: horizontal ? (edge.y ?? 0) + crossShift : edge.y,
          points,
        },
      ] as const;
    }),
  );
  for (const edge of graph.edges) {
    const commentId = commentIds.has(edge.sourceId)
      ? edge.sourceId
      : commentIds.has(edge.targetId)
        ? edge.targetId
        : undefined;
    if (!commentId) continue;
    const comment = visualNodeById.get(commentId)!;
    const commentIndex = comments.findIndex((candidate) => candidate.id === commentId);
    const sideIndexes = commentIndex % 2 === 0 ? beforeIndexes : afterIndexes;
    const sideRank = sideIndexes.indexOf(commentIndex);
    const targetFlowRatio = (sideRank + 1) / (sideIndexes.length + 1);
    const before = horizontal
      ? (comment.y ?? 0) < (targetRect.y ?? 0)
      : (comment.x ?? 0) < (targetRect.x ?? 0);
    const start = horizontal
      ? {
          x: (comment.x ?? 0) + (comment.width ?? 0) / 2,
          y: before ? (comment.y ?? 0) + (comment.height ?? 0) : (comment.y ?? 0),
        }
      : {
          x: before ? (comment.x ?? 0) + (comment.width ?? 0) : (comment.x ?? 0),
          y: (comment.y ?? 0) + (comment.height ?? 0) / 2,
        };
    const end = horizontal
      ? {
          x: (targetRect.x ?? 0) + (targetRect.width ?? 0) * targetFlowRatio,
          y: before ? (targetRect.y ?? 0) : (targetRect.y ?? 0) + (targetRect.height ?? 0),
        }
      : {
          x: before ? (targetRect.x ?? 0) : (targetRect.x ?? 0) + (targetRect.width ?? 0),
          y: (targetRect.y ?? 0) + (targetRect.height ?? 0) * targetFlowRatio,
        };
    normalEdgeById.set(edge.id, {
      ...edge,
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
      width: edge.width ?? 0,
      height: edge.height ?? 0,
      points: edge.sourceId === commentId ? [start, end] : [end, start],
      routing: "orthogonal",
    });
  }
  return {
    ...graph,
    direction,
    nodes: graph.nodes.map((node) => visualNodeById.get(node.id)!),
    edges: graph.edges.map((edge) => normalEdgeById.get(edge.id)!),
  } as VisualGraph<N, E, G, P>;
}

function runSeparatedComponents<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
  context?: LayoutExecutionContext,
): VisualGraph<N, E, G, P> | undefined {
  if (graph.nodes.length < 2) return undefined;

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const neighbors = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    if (!nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId)) continue;
    neighbors.get(edge.sourceId)!.add(edge.targetId);
    neighbors.get(edge.targetId)!.add(edge.sourceId);
  }

  const visited = new Set<string>();
  const componentNodeIds: string[][] = [];
  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue;
    const ids: string[] = [];
    const pending = [node.id];
    visited.add(node.id);
    while (pending.length > 0) {
      const id = pending.pop()!;
      ids.push(id);
      for (const neighbor of neighbors.get(id) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
    componentNodeIds.push(ids);
  }
  if (componentNodeIds.length < 2) return undefined;

  const boundsOf = (result: VisualGraph<N, E, G, P>) => {
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    const include = (x: number, y: number, width = 0, height = 0): void => {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + width);
      bottom = Math.max(bottom, y + height);
    };
    for (const node of result.nodes) {
      include(node.x ?? 0, node.y ?? 0, node.width ?? 0, node.height ?? 0);
      for (const port of node.ports ?? []) {
        include(
          (node.x ?? 0) + (port.x ?? 0),
          (node.y ?? 0) + (port.y ?? 0),
          port.width ?? 0,
          port.height ?? 0,
        );
      }
    }
    for (const edge of result.edges) {
      for (const point of edge.points ?? []) include(point.x, point.y);
      if ((edge.width ?? 0) > 0 || (edge.height ?? 0) > 0) {
        include(edge.x ?? 0, edge.y ?? 0, edge.width ?? 0, edge.height ?? 0);
      }
    }
    return {
      left,
      top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  };

  const components = componentNodeIds.map((ids, modelOrder) => {
    const idSet = new Set(ids);
    const result = runLayeredPipeline(
      {
        ...graph,
        nodes: graph.nodes.filter((node) => idSet.has(node.id)),
        edges: graph.edges.filter((edge) => idSet.has(edge.sourceId) && idSet.has(edge.targetId)),
      },
      {
        ...options,
        padding: 0,
        settings: { ...options.settings, separateConnectedComponents: false },
      },
      context,
    );
    const bounds = boundsOf(result);
    return { result, bounds, modelOrder, area: bounds.width * bounds.height };
  });

  if ((options.settings?.["considerModelOrder.components"] ?? "NONE") === "NONE") {
    components.sort((left, right) => left.area - right.area || left.modelOrder - right.modelOrder);
  }
  const componentSpacing = Number(
    options.settings?.["spacing.componentComponent"] ??
      options.settings?.["spacing.baseValue"] ??
      20,
  );
  const aspectRatio = Number(options.settings?.aspectRatio ?? 1.6);
  const totalArea = components.reduce((sum, component) => sum + component.area, 0);
  const maxRowWidth = Math.max(
    ...components.map((component) => component.bounds.width),
    Math.sqrt(totalArea) * aspectRatio,
  );
  const padding =
    typeof options.padding === "number"
      ? {
          top: options.padding,
          right: options.padding,
          bottom: options.padding,
          left: options.padding,
        }
      : {
          top: options.padding?.top ?? 12,
          right: options.padding?.right ?? 12,
          bottom: options.padding?.bottom ?? 12,
          left: options.padding?.left ?? 12,
        };
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const compactConnectedComponents = options.settings?.["compaction.connectedComponents"] === true;
  const placedShapes: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  const nodeResults = new Map<string, VisualNode<N, P>>();
  const edgeResults = new Map<string, (typeof components)[number]["result"]["edges"][number]>();
  for (const component of components) {
    if (x > 0 && x + component.bounds.width > maxRowWidth) {
      x = 0;
      y += rowHeight + componentSpacing;
      rowHeight = 0;
    }
    let compactedY = y;
    if (compactConnectedComponents && y > 0) {
      let requiredY = 0;
      for (const node of component.result.nodes) {
        const localLeft = x + (node.x ?? 0) - component.bounds.left;
        const localRight = localLeft + (node.width ?? 0);
        const localTop = (node.y ?? 0) - component.bounds.top;
        for (const placed of placedShapes) {
          if (localRight <= placed.left || localLeft >= placed.right) continue;
          requiredY = Math.max(requiredY, placed.bottom + componentSpacing - localTop);
        }
      }
      compactedY = Math.min(y, requiredY);
    }
    const dx = padding.left + x - component.bounds.left;
    const dy = padding.top + compactedY - component.bounds.top;
    for (const node of component.result.nodes) {
      nodeResults.set(node.id, { ...node, x: (node.x ?? 0) + dx, y: (node.y ?? 0) + dy });
      placedShapes.push({
        left: x + (node.x ?? 0) - component.bounds.left,
        right: x + (node.x ?? 0) - component.bounds.left + (node.width ?? 0),
        top: compactedY + (node.y ?? 0) - component.bounds.top,
        bottom: compactedY + (node.y ?? 0) - component.bounds.top + (node.height ?? 0),
      });
    }
    for (const edge of component.result.edges) {
      edgeResults.set(edge.id, {
        ...edge,
        x: (edge.x ?? 0) + dx,
        y: (edge.y ?? 0) + dy,
        points: edge.points?.map((point) => ({ x: point.x + dx, y: point.y + dy })),
      });
    }
    x += component.bounds.width + componentSpacing;
    rowHeight = Math.max(rowHeight, component.bounds.height);
  }

  return {
    ...graph,
    direction: options.direction ?? graph.direction ?? "right",
    nodes: graph.nodes.map((node) => nodeResults.get(node.id)!),
    edges: graph.edges.map((edge) => edgeResults.get(edge.id)!),
  } as VisualGraph<N, E, G, P>;
}

function runCompoundPipeline<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
  context?: LayoutExecutionContext,
): VisualGraph<N, E, G, P> {
  const nodes = graph.nodes.map((node) => ({ ...node })) as VisualNode<N, P>[];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const depth = (node: GraphNode): number => {
    let value = 0;
    let parentId = node.parentId;
    const seen = new Set<string>();
    while (parentId != null && !seen.has(parentId)) {
      seen.add(parentId);
      value++;
      parentId = nodeById.get(parentId)?.parentId;
    }
    return value;
  };
  const parentIds = [
    ...new Set(nodes.flatMap((node) => (node.parentId == null ? [] : [node.parentId]))),
  ].sort((left, right) => depth(nodeById.get(right)!) - depth(nodeById.get(left)!));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, { ...edge }]));
  const padding = typeof options.padding === "number" ? options.padding : 12;

  const layoutSiblings = (parentId: string | null): void => {
    const siblings = nodes.filter((node) => (node.parentId ?? null) === parentId);
    if (siblings.length === 0) return;
    const siblingIds = new Set(siblings.map((node) => node.id));
    const siblingEdges = graph.edges.filter(
      (edge) => siblingIds.has(edge.sourceId) && siblingIds.has(edge.targetId),
    );
    const flatNodes = siblings.map((node) => ({ ...node, parentId: null }));
    const flatGraph = {
      ...graph,
      nodes: flatNodes,
      edges: siblingEdges,
    } as Graph<N, E, G, P>;
    const result = runLayeredPipeline(flatGraph, options, context);
    for (const laidOut of result.nodes) {
      const node = nodeById.get(laidOut.id);
      if (!node) continue;
      Object.assign(node, laidOut, { parentId });
    }
    for (const edge of result.edges) edgeById.set(edge.id, edge);
  };

  for (const parentId of parentIds) {
    layoutSiblings(parentId);
    const parent = nodeById.get(parentId);
    if (!parent) continue;
    const children = nodes.filter((node) => node.parentId === parentId);
    const right = Math.max(0, ...children.map((node) => (node.x ?? 0) + (node.width ?? 0)));
    const bottom = Math.max(0, ...children.map((node) => (node.y ?? 0) + (node.height ?? 0)));
    parent.width = Math.max(parent.width ?? 0, right + padding);
    parent.height = Math.max(parent.height ?? 0, bottom + padding);
  }

  const roots = nodes.filter((node) => node.parentId == null);
  if (roots.length === 1 && parentIds.includes(roots[0]!.id)) {
    Object.assign(roots[0]!, { x: 0, y: 0 });
  } else {
    layoutSiblings(null);
  }

  const absoluteRect = (id: string): { x: number; y: number; width: number; height: number } => {
    const node = nodeById.get(id);
    if (!node) return { x: 0, y: 0, width: 0, height: 0 };
    let x = node.x ?? 0;
    let y = node.y ?? 0;
    let parentId = node.parentId;
    const seen = new Set<string>();
    while (parentId != null && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = nodeById.get(parentId);
      if (!parent) break;
      x += parent.x ?? 0;
      y += parent.y ?? 0;
      parentId = parent.parentId;
    }
    return { x, y, width: node.width ?? 0, height: node.height ?? 0 };
  };
  for (const edge of graph.edges) {
    if (edgeById.get(edge.id)?.points !== undefined) continue;
    const source = absoluteRect(edge.sourceId);
    const target = absoluteRect(edge.targetId);
    const start = { x: source.x + source.width, y: source.y + source.height / 2 };
    const end = { x: target.x, y: target.y + target.height / 2 };
    const track = (start.x + end.x) / 2;
    const points = [start, { x: track, y: start.y }, { x: track, y: end.y }, end];
    edgeById.set(edge.id, {
      ...edge,
      points,
      x: track,
      y: (start.y + end.y) / 2,
      width: edge.width ?? 0,
      height: edge.height ?? 0,
      routing: "orthogonal",
    });
  }

  return {
    ...graph,
    nodes,
    edges: graph.edges.map((edge) => edgeById.get(edge.id) ?? edge),
  } as VisualGraph<N, E, G, P>;
}

function runLayeredPipeline<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
  context?: LayoutExecutionContext,
): VisualGraph<N, E, G, P> {
  if (options.settings?.noLayout) {
    return {
      ...graph,
      nodes: graph.nodes.map((node) => ({
        ...node,
        x: node.x ?? 0,
        y: node.y ?? 0,
        width: node.width ?? 0,
        height: node.height ?? 0,
      })),
      edges: graph.edges.map((edge) => ({
        ...edge,
        x: edge.x ?? 0,
        y: edge.y ?? 0,
        width: edge.width ?? 0,
        height: edge.height ?? 0,
        points: edge.points ?? [],
        routing: edge.routing ?? "polyline",
      })),
    } as VisualGraph<N, E, G, P>;
  }
  if (hasNestedNodes(graph)) return runCompoundPipeline(graph, options, context);
  const wrapped = runWrappedPipeline(graph, options);
  if (wrapped) return wrapped;
  const comments = runCommentBoxPipeline(graph, options, context);
  if (comments) return comments;
  if (options.settings?.separateConnectedComponents !== false) {
    const separated = runSeparatedComponents(graph, options, context);
    if (separated) return separated;
  }
  const direction = options.direction ?? graph.direction ?? "right";
  const padding =
    typeof options.padding === "number"
      ? {
          top: options.padding,
          right: options.padding,
          bottom: options.padding,
          left: options.padding,
        }
      : {
          top: options.padding?.top ?? 12,
          right: options.padding?.right ?? 12,
          bottom: options.padding?.bottom ?? 12,
          left: options.padding?.left ?? 12,
        };
  const switchedSideByPort = new Map<string, "NORTH" | "SOUTH" | "WEST" | "EAST">();
  const parallelPortIndexByKey = new Map<string, number>();
  const labeledEdgesByPair = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges as GraphEdge[]) {
    const settings = options.edgeSettings?.(edge);
    if (
      edge.sourcePort === undefined ||
      edge.targetPort === undefined ||
      edge.sourceId === edge.targetId ||
      (edge.width ?? 0) <= 0 ||
      (edge.height ?? 0) <= 0 ||
      (settings?.["edgeLabels.placement"] ?? "CENTER") !== "CENTER" ||
      settings?.["edgeLabels.inline"] !== true
    ) {
      continue;
    }
    const key = `${edge.sourceId}\0${edge.targetId}`;
    const pair = labeledEdgesByPair.get(key) ?? [];
    pair.push(edge);
    labeledEdgesByPair.set(key, pair);
  }
  for (const pair of labeledEdgesByPair.values()) {
    if (pair.length < 2) continue;
    for (const [index, edge] of pair.entries()) {
      const portIndex =
        options.settings?.["considerModelOrder.strategy"] === "PREFER_NODES"
          ? index
          : pair.length - index - 1;
      parallelPortIndexByKey.set(`${edge.sourceId}\0${edge.sourcePort}`, portIndex);
      parallelPortIndexByKey.set(`${edge.targetId}\0${edge.targetPort}`, portIndex);
    }
  }
  const input: LayeredPhaseInput = {
    graph: graph as Graph<unknown, unknown, unknown, unknown>,
    sizes: new Map(graph.nodes.map((node) => [node.id, getNodeSize(node, options)])),
    direction,
    spacing: {
      node: options.spacing?.node ?? options.settings?.["spacing.baseValue"] ?? 20,
      layer: options.spacing?.layer ?? options.settings?.["spacing.baseValue"] ?? 20,
    },
    padding,
    constrainedLayerByNodeId: new Map(
      graph.nodes.flatMap((node) => {
        const layer = options.constraints?.layer?.(node);
        return layer === undefined ? [] : [[node.id, layer] as const];
      }),
    ),
    settings: options.settings ?? {},
    ...(options.nodeSettings === undefined ? {} : { nodeSettings: options.nodeSettings }),
    ...(options.edgeSettings === undefined ? {} : { edgeSettings: options.edgeSettings }),
    portSettings: (port, node) => ({
      ...options.portSettings?.(port, node),
      ...(parallelPortIndexByKey.has(`${node.id}\0${port.name}`)
        ? { "port.index": parallelPortIndexByKey.get(`${node.id}\0${port.name}`) }
        : {}),
      ...(switchedSideByPort.has(`${node.id}\0${port.name}`)
        ? { "port.side": switchedSideByPort.get(`${node.id}\0${port.name}`) }
        : {}),
    }),
  };
  const measure = <T>(id: string, run: () => T): T => {
    context?.throwIfAborted();
    return context ? context.measurePhase(id, run) : run();
  };

  const cycleBreakingStrategy = options.settings?.["cycleBreaking.strategy"] ?? "GREEDY";
  const cycleBreaker = (() => {
    if (options.strategies?.breakCycles) return options.strategies.breakCycles;
    if (cycleBreakingStrategy === "GREEDY") return breakCyclesGreedily;
    if (cycleBreakingStrategy === "DEPTH_FIRST") return breakCyclesWithDepthFirstSearch;
    if (cycleBreakingStrategy === "INTERACTIVE") return breakCyclesInteractively;
    if (cycleBreakingStrategy === "MODEL_ORDER") return breakCyclesByModelOrder;
    if (cycleBreakingStrategy === "GREEDY_MODEL_ORDER") {
      return breakCyclesGreedilyByModelOrder;
    }
    if (cycleBreakingStrategy === "DFS_NODE_ORDER") {
      return breakCyclesWithModelOrderDepthFirstSearch;
    }
    if (cycleBreakingStrategy === "BFS_NODE_ORDER") {
      return breakCyclesWithModelOrderBreadthFirstSearch;
    }
    if (cycleBreakingStrategy === "SCC_CONNECTIVITY") {
      return breakCyclesByStronglyConnectedConnectivity;
    }
    if (cycleBreakingStrategy === "SCC_NODE_TYPE") {
      return breakCyclesByStronglyConnectedNodeType;
    }
    throw new UnsupportedLayoutError(
      `Cycle-breaking strategy ${cycleBreakingStrategy} is not implemented yet`,
    );
  })();
  const orientation = measure("cycle-breaking", () =>
    applyPartitionOrientation(input, applyLayerConstraintOrientation(input, cycleBreaker(input))),
  );
  const layeringStrategy = options.settings?.["layering.strategy"] ?? "NETWORK_SIMPLEX";
  const layerAssigner = (() => {
    if (options.strategies?.assignLayers) return options.strategies.assignLayers;
    if (layeringStrategy === "LONGEST_PATH_SOURCE") return assignLayersByLongestPath;
    if (layeringStrategy === "LONGEST_PATH") return assignLayersByLongestPathToSink;
    if (layeringStrategy === "INTERACTIVE") return assignLayersInteractively;
    if (layeringStrategy === "BF_MODEL_ORDER") return assignLayersByBreadthFirstModelOrder;
    if (layeringStrategy === "DF_MODEL_ORDER") return assignLayersByDepthFirstModelOrder;
    if (layeringStrategy === "COFFMAN_GRAHAM") return assignLayersWithCoffmanGraham;
    if (layeringStrategy === "NETWORK_SIMPLEX") return assignLayersWithNetworkSimplex;
    if (layeringStrategy === "MIN_WIDTH") return assignLayersWithMinWidth;
    if (layeringStrategy === "STRETCH_WIDTH") return assignLayersWithStretchWidth;
    throw new UnsupportedLayoutError(
      `Layering strategy ${layeringStrategy} is not implemented yet`,
    );
  })();
  const assignment = measure("layer-assignment", () =>
    applyHighDegreeNodeTreatment(
      input,
      orientation,
      applyNodePromotion(
        input,
        orientation,
        applyPartitions(input, applyLayerConstraints(input, layerAssigner(input, orientation))),
      ),
    ),
  );
  let expanded = measure("long-edge-splitting", () =>
    splitLongEdges(input, orientation, assignment),
  );
  const crossingStrategy = options.settings?.["crossingMinimization.strategy"] ?? "LAYER_SWEEP";
  const crossingMinimizer = (() => {
    if (options.strategies?.minimizeCrossings) return options.strategies.minimizeCrossings;
    if (crossingStrategy === "LAYER_SWEEP") {
      return minimizeCrossingsWithBarycenter(options.crossingSweeps);
    }
    if (crossingStrategy === "MEDIAN_LAYER_SWEEP") {
      return minimizeCrossingsWithMedian(options.crossingSweeps);
    }
    if (crossingStrategy === "INTERACTIVE") return minimizeCrossingsInteractively;
    if (crossingStrategy === "NONE") return minimizeCrossingsWithModelOrder;
    throw new UnsupportedLayoutError(
      `Crossing-minimization strategy ${crossingStrategy} is not implemented`,
    );
  })();
  let order = measure("crossing-minimization", () =>
    applyLayerConstraintOrder(
      expanded.input,
      applyGreedySwitch(
        expanded.input,
        expanded.orientation,
        applySemiInteractiveOrder(
          expanded.input,
          applyForcedModelOrder(
            expanded.input,
            expanded.orientation,
            crossingMinimizer(expanded.input, expanded.orientation, expanded.assignment),
          ),
        ),
      ),
    ),
  );
  const unzippingFanIn =
    graph.edges.length === graph.nodes.length - 1 &&
    graph.nodes.some(
      (node) =>
        graph.edges.filter((edge) => edge.targetId === node.id).length === graph.nodes.length - 1,
    );
  if ((options.settings?.["layerUnzipping.strategy"] ?? "NONE") === "ALTERNATING") {
    if (unzippingFanIn) {
      order = applyLayerUnzipping(expanded.input, order);
    } else {
      const unzipped = measure("layer-unzipping", () => unzipLayersAlternating(expanded, order));
      expanded = unzipped.expansion;
      order = unzipped.order;
    }
  }
  order = applyDirectionCongruency(expanded.input, order);
  const nodePlacementStrategy = options.settings?.["nodePlacement.strategy"] ?? "BRANDES_KOEPF";
  const nodePlacer = (() => {
    if (options.strategies?.placeNodes) return options.strategies.placeNodes;
    if (nodePlacementStrategy === "INTERACTIVE") return placeNodesInteractively;
    if (nodePlacementStrategy === "BRANDES_KOEPF") return placeNodesWithBrandesKoepf;
    if (nodePlacementStrategy === "LINEAR_SEGMENTS") return placeNodesWithLinearSegments;
    if (nodePlacementStrategy === "NETWORK_SIMPLEX") return placeNodesWithNetworkSimplex;
    return placeNodesInLayers;
  })();
  const placement = measure("node-placement", () => nodePlacer(expanded.input, order));
  const mutableRects = placement.rectByNodeId as Map<
    string,
    { x: number; y: number; width: number; height: number }
  >;
  if (
    (expanded.input.settings["layerUnzipping.strategy"] ?? "NONE") === "ALTERNATING" &&
    graph.edges.length === graph.nodes.length - 1 &&
    (direction === "right" || direction === "left")
  ) {
    const originalNodes = graph.nodes;
    const sink = originalNodes.find(
      (node) =>
        graph.edges.filter((edge) => edge.targetId === node.id).length === originalNodes.length - 1,
    );
    if (sink) {
      const sources = originalNodes.filter((node) => node.id !== sink.id);
      const configuredSplits = sources.flatMap((node) => {
        const value = input.nodeSettings?.(node)?.["layerUnzipping.layerSplit"];
        return value === undefined ? [] : [Math.max(1, Number(value))];
      });
      const split = configuredSplits.length > 0 ? Math.min(...configuredSplits) : 2;
      const minimizeEdgeLength = sources.some(
        (node) => input.nodeSettings?.(node)?.["layerUnzipping.minimizeEdgeLength"] === true,
      );
      const sequence = [sources.at(-1)!, ...sources.slice(0, -1)];
      const sourceWidth = Math.max(...sources.map((node) => input.sizes.get(node.id)?.width ?? 0));
      const sourceHeight = Math.max(
        ...sources.map((node) => input.sizes.get(node.id)?.height ?? 0),
      );
      const skipForEdgeLength =
        minimizeEdgeLength &&
        split === 2 &&
        (sourceWidth +
          Math.max(
            2 * Number(input.settings["spacing.edgeNodeBetweenLayers"] ?? 10),
            sources.length * Number(input.settings["spacing.edgeEdgeBetweenLayers"] ?? 10),
            input.spacing.layer,
          )) /
          (sourceHeight +
            Math.max(input.spacing.node, Number(input.settings["spacing.edgeNode"] ?? 10))) >=
          sources.length / 4;
      if (skipForEdgeLength) {
        for (const [index, node] of sequence.entries()) {
          const rect = mutableRects.get(node.id);
          if (!rect) continue;
          mutableRects.set(node.id, {
            ...rect,
            x: input.padding.left,
            y: input.padding.top + index * (sourceHeight + input.spacing.node),
          });
        }
        const sinkRect = mutableRects.get(sink.id);
        if (sinkRect) {
          mutableRects.set(sink.id, {
            ...sinkRect,
            x:
              input.padding.left +
              sourceWidth +
              input.spacing.layer +
              Number(input.settings["spacing.edgeNodeBetweenLayers"] ?? 10),
            y:
              input.padding.top + ((sequence.length - 1) * (sourceHeight + input.spacing.node)) / 2,
          });
        }
      } else {
        const sublayerOffset = Math.ceil((sourceHeight + input.spacing.node + 1) / 2);
        const repeatStep = split * ((sourceHeight + input.spacing.node) / 2) + split - 1;
        let minimumCross = Number.POSITIVE_INFINITY;
        let maximumCross = Number.NEGATIVE_INFINITY;
        for (const [index, node] of sequence.entries()) {
          const sublayer = index % split;
          const position = Math.floor(index / split);
          const rect = mutableRects.get(node.id);
          if (!rect) continue;
          const x = input.padding.left + sublayer * (sourceWidth + input.spacing.layer);
          const y = input.padding.top + sublayer * sublayerOffset + position * repeatStep;
          mutableRects.set(node.id, { ...rect, x, y });
          minimumCross = Math.min(minimumCross, y);
          maximumCross = Math.max(maximumCross, y);
        }
        const sinkRect = mutableRects.get(sink.id);
        if (sinkRect) {
          mutableRects.set(sink.id, {
            ...sinkRect,
            x:
              input.padding.left +
              split * (sourceWidth + input.spacing.layer) +
              Number(input.settings["spacing.edgeNodeBetweenLayers"] ?? 10),
            y: Math.round((minimumCross + maximumCross) / 2),
          });
        }
      }
    }
  }
  for (const node of expanded.input.graph.nodes) {
    if (expanded.input.nodeSettings?.(node)?.hypernode !== true) continue;
    const rect = mutableRects.get(node.id);
    if (!rect) continue;
    const neighbors = expanded.input.graph.edges
      .filter((edge) => edge.targetId === node.id)
      .map((edge) => mutableRects.get(edge.sourceId))
      .filter((candidate) => candidate !== undefined);
    if (neighbors.length === 0) continue;
    const horizontal = direction === "left" || direction === "right";
    const desiredCross = Math.min(
      ...neighbors.map((candidate) => (horizontal ? candidate.y : candidate.x)),
    );
    const delta = desiredCross - (horizontal ? rect.y : rect.x);
    if (Math.abs(delta) < 1e-9) continue;
    const pending = [node.id];
    const shifted = new Set<string>();
    while (pending.length > 0) {
      const id = pending.shift()!;
      if (shifted.has(id)) continue;
      shifted.add(id);
      const current = mutableRects.get(id);
      if (current) {
        mutableRects.set(
          id,
          horizontal ? { ...current, y: current.y + delta } : { ...current, x: current.x + delta },
        );
      }
      for (const edge of expanded.input.graph.edges) {
        if (edge.sourceId === id && edge.targetId !== node.id) pending.push(edge.targetId);
      }
    }
  }
  if (
    expanded.input.settings.directionCongruency === "ROTATION" &&
    (direction === "left" || direction === "down")
  ) {
    const horizontal = direction === "left";
    for (const node of expanded.input.graph.nodes) {
      const incomingDegree = expanded.input.graph.edges.filter(
        (edge) => edge.targetId === node.id && edge.sourceId !== node.id,
      ).length;
      if (incomingDegree < 2) continue;
      const rect = mutableRects.get(node.id);
      if (!rect) continue;
      const crossSize = horizontal ? rect.height : rect.width;
      const correction = crossSize / (incomingDegree + 1);
      mutableRects.set(
        node.id,
        horizontal ? { ...rect, y: rect.y - correction } : { ...rect, x: rect.x - correction },
      );
    }
  }
  {
    const horizontal = direction === "right" || direction === "left";
    for (const edge of graph.edges) {
      if (edge.sourcePort === undefined) continue;
      const source = graph.nodes.find((node) => node.id === edge.sourceId);
      const targetRect = mutableRects.get(edge.targetId);
      const sourceRect = mutableRects.get(edge.sourceId);
      const port = source?.ports?.find((candidate) => candidate.name === edge.sourcePort);
      if (!source || !sourceRect || !targetRect || !port) continue;
      const side = input.portSettings?.(port, source)?.["port.side"];
      if (horizontal && side === "NORTH") {
        mutableRects.set(edge.targetId, {
          ...targetRect,
          y: sourceRect.y - (port.height ?? 0) - targetRect.height,
        });
      } else if (horizontal && side === "SOUTH") {
        mutableRects.set(edge.targetId, {
          ...targetRect,
          y: sourceRect.y + sourceRect.height + (port.height ?? 0),
        });
      } else if (!horizontal && side === "WEST") {
        mutableRects.set(edge.targetId, {
          ...targetRect,
          x: sourceRect.x - (port.width ?? 0) - targetRect.width,
        });
      } else if (!horizontal && side === "EAST") {
        mutableRects.set(edge.targetId, {
          ...targetRect,
          x: sourceRect.x + sourceRect.width + (port.width ?? 0),
        });
      }
    }
  }
  measure("port-margin-normalization", () =>
    normalizePlacementForPortExtents(expanded.input, placement, order, expanded.orientation),
  );
  {
    const horizontal = direction === "left" || direction === "right";
    const crossCenter = (nodeId: string): number => {
      const rect = placement.rectByNodeId.get(nodeId);
      return rect ? (horizontal ? rect.y + rect.height / 2 : rect.x + rect.width / 2) : 0;
    };
    for (const node of graph.nodes) {
      for (const port of node.ports ?? []) {
        const settings = options.portSettings?.(port, node);
        if (settings?.allowNonFlowPortsToSwitchSides !== true) continue;
        const side = settings["port.side"];
        if (
          horizontal ? side !== "NORTH" && side !== "SOUTH" : side !== "WEST" && side !== "EAST"
        ) {
          continue;
        }
        const configuredSide = side as "NORTH" | "SOUTH" | "WEST" | "EAST";
        const outgoing = graph.edges.find(
          (edge) => edge.sourceId === node.id && edge.sourcePort === port.name,
        );
        const incoming = graph.edges.find(
          (edge) => edge.targetId === node.id && edge.targetPort === port.name,
        );
        const peers = outgoing
          ? graph.edges
              .filter((edge) => edge.targetId === outgoing.targetId)
              .map((edge) => edge.sourceId)
          : incoming
            ? graph.edges
                .filter((edge) => edge.sourceId === incoming.sourceId)
                .map((edge) => edge.targetId)
            : [];
        if (peers.length < 2) continue;
        const positions = peers.map(crossCenter);
        const own = crossCenter(node.id);
        const switched = horizontal
          ? own >= Math.max(...positions)
            ? "SOUTH"
            : own <= Math.min(...positions)
              ? "NORTH"
              : configuredSide
          : own >= Math.max(...positions)
            ? "EAST"
            : own <= Math.min(...positions)
              ? "WEST"
              : configuredSide;
        switchedSideByPort.set(`${node.id}\0${port.name}`, switched);
      }
    }
  }
  const edgeRouting = options.settings?.edgeRouting ?? "ORTHOGONAL";
  const edgeRouter =
    options.strategies?.routeEdges ??
    (edgeRouting === "POLYLINE"
      ? routeEdgesWithPolylines
      : edgeRouting === "SPLINES"
        ? routeEdgesWithSplines
        : routeEdgesOrthogonally);
  let expandedRoutes = measure("edge-routing", () =>
    edgeRouter(expanded.input, expanded.orientation, placement),
  );
  measure("post-compaction", () => applyPostCompaction(expanded.input, placement, expandedRoutes));
  const antiparallelLabelPositions = new Map<string, Point>();
  const parallelLabelPositions = new Map<string, Point>();
  const postCompactionNodeCrossDeltas = new Map<string, number>();
  const horizontalAntiparallelFlow = direction === "left" || direction === "right";
  const usesVizInteractivePlacementProfile =
    options.strategies?.routeEdges === undefined &&
    options.settings?.["cycleBreaking.strategy"] === "MODEL_ORDER" &&
    options.settings?.["layering.strategy"] === "INTERACTIVE" &&
    options.settings?.["crossingMinimization.forceNodeModelOrder"] === true &&
    options.settings?.["nodePlacement.strategy"] === "BRANDES_KOEPF" &&
    options.settings?.["nodePlacement.favorStraightEdges"] === true &&
    options.settings?.["compaction.postCompaction.strategy"] === "LEFT" &&
    options.settings?.["compaction.postCompaction.constraints"] === "SCANLINE";
  if (usesVizInteractivePlacementProfile) {
    const neighbors = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
    for (const edge of graph.edges) {
      if (edge.sourceId === edge.targetId) continue;
      neighbors.get(edge.sourceId)?.add(edge.targetId);
      neighbors.get(edge.targetId)?.add(edge.sourceId);
    }
    const visited = new Set<string>();
    for (const node of graph.nodes) {
      if (visited.has(node.id)) continue;
      const component: GraphNode[] = [];
      const pending = [node.id];
      while (pending.length > 0) {
        const id = pending.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const member = graph.nodes.find((candidate) => candidate.id === id);
        if (member) component.push(member);
        for (const neighbor of neighbors.get(id) ?? []) pending.push(neighbor);
      }
      if (component.length < 2) continue;
      const componentIds = new Set(component.map((member) => member.id));
      if (
        !graph.edges.some(
          (edge) =>
            componentIds.has(edge.sourceId) &&
            componentIds.has(edge.targetId) &&
            expanded.orientation.reversedEdgeIds.has(edge.id),
        )
      ) {
        continue;
      }
      const directedPairCounts = new Map<string, number>();
      for (const edge of graph.edges) {
        if (!componentIds.has(edge.sourceId) || !componentIds.has(edge.targetId)) continue;
        const key = `${edge.sourceId}\0${edge.targetId}`;
        directedPairCounts.set(key, (directedPairCounts.get(key) ?? 0) + 1);
      }
      if ([...directedPairCounts.values()].some((count) => count > 1)) continue;
      if (
        component.some((member) => {
          const constraints = options.nodeSettings?.(member)?.portConstraints;
          return constraints !== undefined && constraints !== "UNDEFINED" && constraints !== "FREE";
        })
      ) {
        continue;
      }
      const layerCounts = new Map<number, number>();
      for (const member of component) {
        const layer = expanded.assignment.layerByNodeId.get(member.id);
        if (layer === undefined) continue;
        layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1);
      }
      if ([...layerCounts.values()].some((count) => count !== 1)) continue;
      const rects = component.flatMap((member) => {
        const rect = mutableRects.get(member.id);
        return rect ? [{ member, rect }] : [];
      });
      if (rects.length !== component.length) continue;
      const minimumCross = Math.min(
        ...rects.map(({ rect }) => (horizontalAntiparallelFlow ? rect.y : rect.x)),
      );
      const maximumCross = Math.max(
        ...rects.map(({ rect }) =>
          horizontalAntiparallelFlow ? rect.y + rect.height : rect.x + rect.width,
        ),
      );
      const center = (minimumCross + maximumCross) / 2;
      for (const { member, rect } of rects) {
        const currentCross = horizontalAntiparallelFlow ? rect.y : rect.x;
        const nextCross = horizontalAntiparallelFlow
          ? center - rect.height / 2
          : center - rect.width / 2;
        postCompactionNodeCrossDeltas.set(member.id, nextCross - currentCross);
        mutableRects.set(
          member.id,
          horizontalAntiparallelFlow ? { ...rect, y: nextCross } : { ...rect, x: nextCross },
        );
      }
    }
  }
  {
    const horizontal = horizontalAntiparallelFlow;
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const pairEdges = new Map<string, GraphEdge[]>();
    for (const edge of graph.edges) {
      if (edge.sourceId === edge.targetId || (edge.width ?? 0) <= 0 || (edge.height ?? 0) <= 0) {
        continue;
      }
      const key = [edge.sourceId, edge.targetId].sort().join("\0");
      const pair = pairEdges.get(key) ?? [];
      pair.push(edge);
      pairEdges.set(key, pair);
    }
    for (const pair of pairEdges.values()) {
      if (
        pair.length !== 2 ||
        pair[0]!.sourceId !== pair[1]!.targetId ||
        pair[0]!.targetId !== pair[1]!.sourceId ||
        pair.some((edge) => {
          const settings = options.edgeSettings?.(edge);
          return (
            (settings?.["edgeLabels.placement"] ?? "CENTER") !== "CENTER" ||
            settings?.["edgeLabels.inline"] !== true
          );
        })
      ) {
        continue;
      }
      const firstNode = nodesById.get(pair[0]!.sourceId);
      const secondNode = nodesById.get(pair[0]!.targetId);
      const firstRect = placement.rectByNodeId.get(pair[0]!.sourceId);
      const secondRect = placement.rectByNodeId.get(pair[0]!.targetId);
      if (!firstNode || !secondNode || !firstRect || !secondRect) continue;
      const nonSelfNeighbors = (nodeId: string) =>
        new Set(
          graph.edges.flatMap((edge) =>
            edge.sourceId === edge.targetId
              ? []
              : edge.sourceId === nodeId
                ? [edge.targetId]
                : edge.targetId === nodeId
                  ? [edge.sourceId]
                  : [],
          ),
        );
      const isolatedAntiparallelPair =
        nonSelfNeighbors(firstNode.id).size === 1 && nonSelfNeighbors(secondNode.id).size === 1;
      const hasFlexiblePorts = (node: GraphNode): boolean => {
        const constraints = options.nodeSettings?.(node)?.portConstraints;
        return constraints === undefined || constraints === "UNDEFINED" || constraints === "FREE";
      };
      if (!hasFlexiblePorts(firstNode) || !hasFlexiblePorts(secondNode)) continue;

      const firstBeforeSecond = horizontal
        ? firstRect.x + firstRect.width / 2 < secondRect.x + secondRect.width / 2
        : firstRect.y + firstRect.height / 2 < secondRect.y + secondRect.height / 2;
      const beforeRect = firstBeforeSecond ? firstRect : secondRect;
      const afterRect = firstBeforeSecond ? secondRect : firstRect;
      const forward = pair.find((edge) =>
        firstBeforeSecond
          ? edge.sourceId === pair[0]!.sourceId
          : edge.sourceId === pair[0]!.targetId,
      );
      if (!forward?.sourcePort || !forward.targetPort) continue;

      let cross = Math.min(
        horizontal ? firstRect.y : firstRect.x,
        horizontal ? secondRect.y : secondRect.x,
      );
      const edgeSpacing = Number(options.settings?.["spacing.edgeEdge"] ?? 10);
      for (const edge of pair) {
        const width = edge.width ?? 0;
        const height = edge.height ?? 0;
        antiparallelLabelPositions.set(
          edge.id,
          isolatedAntiparallelPair
            ? horizontal
              ? {
                  x: (beforeRect.x + beforeRect.width + afterRect.x - width) / 2,
                  y: cross,
                }
              : {
                  x: cross,
                  y: (beforeRect.y + beforeRect.height + afterRect.y - height) / 2,
                }
            : horizontal
              ? {
                  x: (beforeRect.x + beforeRect.width + afterRect.x - width) / 2,
                  y:
                    edge === forward
                      ? (firstRect.y +
                          firstRect.height / 2 +
                          secondRect.y +
                          secondRect.height / 2) /
                          2 -
                        height / 2
                      : Math.max(firstRect.y + firstRect.height, secondRect.y + secondRect.height) +
                        edgeSpacing,
                }
              : {
                  x:
                    edge === forward
                      ? (firstRect.x + firstRect.width / 2 + secondRect.x + secondRect.width / 2) /
                          2 -
                        width / 2
                      : Math.max(firstRect.x + firstRect.width, secondRect.x + secondRect.width) +
                        edgeSpacing,
                  y: (beforeRect.y + beforeRect.height + afterRect.y - height) / 2,
                },
        );
        cross += (horizontal ? height : width) + edgeSpacing;
      }

      const forwardLabel = antiparallelLabelPositions.get(forward.id)!;
      const forwardCross = horizontal
        ? Math.round(forwardLabel.y + (forward.height ?? 0) / 2)
        : Math.round(forwardLabel.x + (forward.width ?? 0) / 2);
      const alignPort = (node: GraphNode, portName: string): void => {
        const rect = placement.rectByNodeId.get(node.id);
        const port = node.ports?.find((candidate) => candidate.name === portName);
        if (!rect || !port) return;
        const placedPort = placePorts(
          node.ports,
          rect,
          direction,
          (candidate) => input.portSettings?.(candidate, node),
          { ...options.settings, ...options.nodeSettings?.(node) },
          (candidate) =>
            getOrientedPortDirection(expanded.input, expanded.orientation, node, candidate),
        )?.find((candidate) => candidate.name === portName);
        if (!placedPort) return;
        const localCross = horizontal
          ? (placedPort.y ?? 0) + (placedPort.height ?? 0) / 2
          : (placedPort.x ?? 0) + (placedPort.width ?? 0) / 2;
        const nextCross = forwardCross - localCross;
        const currentCross = horizontal ? rect.y : rect.x;
        postCompactionNodeCrossDeltas.set(
          node.id,
          (postCompactionNodeCrossDeltas.get(node.id) ?? 0) + nextCross - currentCross,
        );
        mutableRects.set(
          node.id,
          horizontal ? { ...rect, y: nextCross } : { ...rect, x: nextCross },
        );
      };
      if (isolatedAntiparallelPair) {
        alignPort(nodesById.get(forward.sourceId)!, forward.sourcePort);
        alignPort(nodesById.get(forward.targetId)!, forward.targetPort);
      }
    }
  }
  if (postCompactionNodeCrossDeltas.size > 0) {
    const pointsByEdgeId = new Map(expandedRoutes.pointsByEdgeId);
    for (const edge of graph.edges) {
      const points = [...(pointsByEdgeId.get(edge.id) ?? [])];
      if (points.length === 0) continue;
      const sourceDelta = postCompactionNodeCrossDeltas.get(edge.sourceId) ?? 0;
      const targetDelta = postCompactionNodeCrossDeltas.get(edge.targetId) ?? 0;
      const shiftEndpoint = (endpointIndex: number, adjacentIndex: number, delta: number): void => {
        if (delta === 0) return;
        const endpoint = points[endpointIndex];
        const adjacent = points[adjacentIndex];
        if (!endpoint) return;
        const originalCross = horizontalAntiparallelFlow ? endpoint.y : endpoint.x;
        points[endpointIndex] = horizontalAntiparallelFlow
          ? { ...endpoint, y: endpoint.y + delta }
          : { ...endpoint, x: endpoint.x + delta };
        if (adjacent && (horizontalAntiparallelFlow ? adjacent.y : adjacent.x) === originalCross) {
          points[adjacentIndex] = horizontalAntiparallelFlow
            ? { ...adjacent, y: adjacent.y + delta }
            : { ...adjacent, x: adjacent.x + delta };
        }
      };
      shiftEndpoint(0, 1, sourceDelta);
      shiftEndpoint(points.length - 1, points.length - 2, targetDelta);
      pointsByEdgeId.set(edge.id, points);
    }
    expandedRoutes = { ...expandedRoutes, pointsByEdgeId };
  }
  let routes = measure("long-edge-joining", () =>
    joinLongEdgeRoutes(
      expandedRoutes,
      expanded.segmentIdsByEdgeId,
      edgeRouting === "SPLINES" || options.settings?.unnecessaryBendpoints === true,
      edgeRouting === "SPLINES",
      Number(options.settings?.["spacing.edgeNodeBetweenLayers"] ?? 10),
    ),
  );
  if (options.settings?.["layering.nodePromotion.strategy"] === "MODEL_ORDER_LEFT_TO_RIGHT") {
    const horizontal = direction === "right" || direction === "left";
    const pointsByEdgeId = new Map(routes.pointsByEdgeId);
    for (const [edgeId, points] of pointsByEdgeId) {
      if (points.length <= 4) continue;
      const start = points[0]!;
      const firstBend = points[1]!;
      const end = points.at(-1)!;
      pointsByEdgeId.set(edgeId, [
        start,
        firstBend,
        horizontal ? { x: firstBend.x, y: end.y } : { x: end.x, y: firstBend.y },
        end,
      ]);
    }
    routes = { ...routes, pointsByEdgeId };
  }
  if (edgeRouting === "ORTHOGONAL") {
    const horizontal = direction === "right" || direction === "left";
    const forwardSign = direction === "right" || direction === "down" ? 1 : -1;
    const mutableRouteMap = routes.pointsByEdgeId as Map<string, readonly Point[]>;
    for (const node of graph.nodes) {
      if (options.nodeSettings?.(node)?.hypernode !== true || !horizontal) continue;
      const incoming = graph.edges.filter((edge) => edge.targetId === node.id);
      const outgoing = graph.edges.filter((edge) => edge.sourceId === node.id);
      const moveForward = Number(incoming.length > 0) <= Number(outgoing.length > 0);
      const incident = moveForward ? outgoing : incoming;
      const candidates = incident.flatMap((edge) => {
        const points = [...(mutableRouteMap.get(edge.id) ?? [])];
        if (points.length < 3) return [];
        const bendIndex = moveForward ? 1 : points.length - 2;
        const secondIndex = moveForward ? 2 : points.length - 3;
        return [{ edge, points, bendIndex, secondIndex }];
      });
      if (candidates.length === 0) continue;
      const signedFlow = (point: Point) =>
        forwardSign * (horizontal ? point.x : point.y) * (moveForward ? 1 : -1);
      const joinFlow = Math.min(
        ...candidates.map(({ points, bendIndex }) => signedFlow(points[bendIndex]!)),
      );
      const bendEdges = candidates.filter(
        ({ points, bendIndex }) => Math.abs(signedFlow(points[bendIndex]!) - joinFlow) < 1e-9,
      );
      const rect = mutableRects.get(node.id);
      if (!rect) continue;
      const join = bendEdges[0]!.points[bendEdges[0]!.bendIndex]!;
      const second = bendEdges[0]!.points[bendEdges[0]!.secondIndex]!;
      const flowCenter = horizontal ? rect.x + rect.width / 2 : rect.y + rect.height / 2;
      const joinCoordinate = horizontal ? join.x : join.y;
      const crossDifference = horizontal
        ? Math.abs(second.y - join.y)
        : Math.abs(second.x - join.x);
      const flowSize = horizontal ? rect.width : rect.height;
      const crossSize = horizontal ? rect.height : rect.width;
      if (
        Math.abs(joinCoordinate - flowCenter) <= flowSize / 2 ||
        crossDifference <= crossSize / 2
      ) {
        continue;
      }
      const delta = joinCoordinate - flowCenter;
      mutableRects.set(
        node.id,
        horizontal ? { ...rect, x: rect.x + delta } : { ...rect, y: rect.y + delta },
      );
      for (const edge of [...incoming, ...outgoing]) {
        const points = [...(mutableRouteMap.get(edge.id) ?? [])];
        const endpointIndex = edge.sourceId === node.id ? 0 : points.length - 1;
        const endpoint = points[endpointIndex];
        if (!endpoint) continue;
        points[endpointIndex] = horizontal
          ? { ...endpoint, x: endpoint.x + delta }
          : { ...endpoint, y: endpoint.y + delta };
        mutableRouteMap.set(edge.id, points);
      }
      const movedRect = mutableRects.get(node.id)!;
      for (const { edge, points: originalPoints, bendIndex, secondIndex } of bendEdges) {
        const points = [...(mutableRouteMap.get(edge.id) ?? originalPoints)];
        const originalBend = originalPoints[bendIndex]!;
        const originalSecond = originalPoints[secondIndex]!;
        points.splice(bendIndex, 1);
        const endpointIndex = moveForward ? 0 : points.length - 1;
        points[endpointIndex] = horizontal
          ? {
              x: movedRect.x + movedRect.width / 2,
              y: originalSecond.y >= originalBend.y ? movedRect.y + movedRect.height : movedRect.y,
            }
          : {
              x: originalSecond.x >= originalBend.x ? movedRect.x + movedRect.width : movedRect.x,
              y: movedRect.y + movedRect.height / 2,
            };
        mutableRouteMap.set(edge.id, points);
      }
    }
  }
  if (
    (options.settings?.["layerUnzipping.strategy"] ?? "NONE") === "ALTERNATING" &&
    !unzippingFanIn &&
    edgeRouting === "ORTHOGONAL"
  ) {
    routes = {
      pointsByEdgeId: adjustUnzippedSinkRoutes(
        graph,
        routes.pointsByEdgeId,
        direction,
        Number(options.settings?.["spacing.edgeNodeBetweenLayers"] ?? 10),
        Number(options.settings?.["spacing.edgeEdgeBetweenLayers"] ?? 10),
      ),
    };
  }

  for (const edge of graph.edges) {
    if (edge.sourcePort === undefined || edge.targetPort !== undefined) continue;
    const source = expanded.input.graph.nodes.find((node) => node.id === edge.sourceId);
    const port = source?.ports?.find((candidate) => candidate.name === edge.sourcePort);
    const targetRect = mutableRects.get(edge.targetId);
    if (!source || !port || !targetRect) continue;
    const settings = expanded.input.portSettings?.(port, source);
    const forwardSide =
      direction === "right"
        ? "EAST"
        : direction === "left"
          ? "WEST"
          : direction === "down"
            ? "SOUTH"
            : "NORTH";
    if (settings?.["port.anchor"] === undefined || settings["port.side"] !== forwardSide) continue;
    const horizontal = direction === "right" || direction === "left";
    const protrusion = horizontal ? (port.width ?? 0) : (port.height ?? 0);
    const delta = (direction === "right" || direction === "down" ? 1 : -1) * protrusion;
    mutableRects.set(
      edge.targetId,
      horizontal
        ? { ...targetRect, x: targetRect.x + delta }
        : { ...targetRect, y: targetRect.y + delta },
    );
    const points = [...(routes.pointsByEdgeId.get(edge.id) ?? [])];
    const end = points.at(-1);
    if (end)
      points[points.length - 1] = horizontal
        ? { ...end, x: end.x + delta }
        : { ...end, y: end.y + delta };
    (routes.pointsByEdgeId as Map<string, readonly Point[]>).set(edge.id, points);
  }
  for (const pair of labeledEdgesByPair.values()) {
    if (pair.length < 2) continue;
    const sourceRect = mutableRects.get(pair[0]!.sourceId);
    const targetRect = mutableRects.get(pair[0]!.targetId);
    if (!sourceRect || !targetRect) continue;
    const horizontal = direction === "left" || direction === "right";
    const beforeRect = horizontal
      ? sourceRect.x <= targetRect.x
        ? sourceRect
        : targetRect
      : sourceRect.y <= targetRect.y
        ? sourceRect
        : targetRect;
    const afterRect = beforeRect === sourceRect ? targetRect : sourceRect;
    const edgeSpacing = Number(options.settings?.["spacing.edgeEdge"] ?? 10);
    let cross = horizontal ? padding.top : padding.left;
    const orderedPair =
      options.settings?.["considerModelOrder.strategy"] === "PREFER_NODES"
        ? pair
        : [...pair].reverse();
    for (const edge of orderedPair) {
      const width = edge.width ?? 0;
      const height = edge.height ?? 0;
      parallelLabelPositions.set(
        edge.id,
        horizontal
          ? {
              x: (beforeRect.x + beforeRect.width + afterRect.x - width) / 2,
              y: cross,
            }
          : {
              x: cross,
              y: (beforeRect.y + beforeRect.height + afterRect.y - height) / 2,
            },
      );
      cross += (horizontal ? height : width) + edgeSpacing;
    }

    const anchorEdge = orderedPair[0]!;
    const anchorLabel = parallelLabelPositions.get(anchorEdge.id)!;
    const desiredCross = Math.round(
      horizontal
        ? anchorLabel.y + (anchorEdge.height ?? 0) / 2
        : anchorLabel.x + (anchorEdge.width ?? 0) / 2,
    );
    const alignEndpoint = (nodeId: string, portName: string): void => {
      const node = graph.nodes.find((candidate) => candidate.id === nodeId);
      const rect = mutableRects.get(nodeId);
      const port = node?.ports?.find((candidate) => candidate.name === portName);
      if (!node || !rect || !port) return;
      const placedPort = placePorts(
        node.ports,
        rect,
        direction,
        (candidate) => input.portSettings?.(candidate, node),
        { ...options.settings, ...options.nodeSettings?.(node) },
        (candidate) =>
          getOrientedPortDirection(expanded.input, expanded.orientation, node, candidate),
      )?.find((candidate) => candidate.name === portName);
      if (!placedPort) return;
      const localCross = horizontal
        ? (placedPort.y ?? 0) + (placedPort.height ?? 0) / 2
        : (placedPort.x ?? 0) + (placedPort.width ?? 0) / 2;
      const currentCross = horizontal ? rect.y : rect.x;
      const nextCross = desiredCross - localCross;
      const delta = nextCross - currentCross;
      mutableRects.set(nodeId, horizontal ? { ...rect, y: nextCross } : { ...rect, x: nextCross });
      for (const edge of graph.edges) {
        const points = [...(routes.pointsByEdgeId.get(edge.id) ?? [])];
        if (points.length === 0) continue;
        const index =
          edge.sourceId === nodeId ? 0 : edge.targetId === nodeId ? points.length - 1 : undefined;
        if (index === undefined) continue;
        const endpoint = points[index]!;
        const originalCross = horizontal ? endpoint.y : endpoint.x;
        points[index] = horizontal
          ? { ...endpoint, y: endpoint.y + delta }
          : { ...endpoint, x: endpoint.x + delta };
        const adjacentIndex = index === 0 ? 1 : points.length - 2;
        const adjacent = points[adjacentIndex];
        if (adjacent && (horizontal ? adjacent.y : adjacent.x) === originalCross) {
          points[adjacentIndex] = horizontal
            ? { ...adjacent, y: adjacent.y + delta }
            : { ...adjacent, x: adjacent.x + delta };
        }
        (routes.pointsByEdgeId as Map<string, readonly Point[]>).set(edge.id, points);
      }
    };
    if (anchorEdge.sourcePort && anchorEdge.targetPort) {
      alignEndpoint(anchorEdge.sourceId, anchorEdge.sourcePort);
      alignEndpoint(anchorEdge.targetId, anchorEdge.targetPort);
    }
  }
  const routedPortAnchors = new Map<string, Point>();
  for (const edge of graph.edges) {
    const points = routes.pointsByEdgeId.get(edge.id);
    const first = points?.[0];
    const last = points?.at(-1);
    if (
      edge.sourcePort !== undefined &&
      first &&
      graph.edges.filter(
        (candidate) =>
          candidate.sourceId === edge.sourceId && candidate.sourcePort === edge.sourcePort,
      ).length === 1
    ) {
      routedPortAnchors.set(`${edge.sourceId}\0${edge.sourcePort}`, first);
    }
    if (
      edge.targetPort !== undefined &&
      last &&
      graph.edges.filter(
        (candidate) =>
          candidate.targetId === edge.targetId && candidate.targetPort === edge.targetPort,
      ).length === 1
    ) {
      routedPortAnchors.set(`${edge.targetId}\0${edge.targetPort}`, last);
    }
  }
  const nodes = graph.nodes.map((node): VisualNode<N, P> => {
    const rect = placement.rectByNodeId.get(node.id);
    if (!rect) {
      throw new Error(`Node placement missing for ${node.id}`);
    }
    let ports = placePorts(
      node.ports,
      rect,
      direction,
      (port) => input.portSettings?.(port, node),
      { ...options.settings, ...options.nodeSettings?.(node) },
      (port) => getOrientedPortDirection(expanded.input, expanded.orientation, node, port),
    );
    if (options.nodeSettings?.(node)?.portConstraints === "FIXED_SIDE") {
      ports = ports?.map((port) => {
        if ((port.width ?? 8) !== 0 || (port.height ?? 8) !== 0) return port;
        const anchor = routedPortAnchors.get(`${node.id}\0${port.name}`);
        if (!anchor || port.x === undefined || port.y === undefined) return port;
        const settings = input.portSettings?.(port, node);
        const configuredAnchor = settings?.["port.anchor"] as
          | { x?: number; y?: number }
          | undefined;
        const width = port.width ?? 0;
        const height = port.height ?? 0;
        const defaultAnchorX = port.x >= rect.width ? width : port.x + width <= 0 ? 0 : width / 2;
        const defaultAnchorY =
          port.y >= rect.height ? height : port.y + height <= 0 ? 0 : height / 2;
        const x = anchor.x - rect.x - (configuredAnchor?.x ?? defaultAnchorX);
        const y = anchor.y - rect.y - (configuredAnchor?.y ?? defaultAnchorY);
        return {
          ...port,
          x: x === 0 && Object.is(port.x, -0) ? port.x : x,
          y: y === 0 && Object.is(port.y, -0) ? port.y : y,
        };
      });
    }
    return {
      ...node,
      ...rect,
      ...(ports === undefined ? {} : { ports }),
    } as VisualNode<N, P>;
  });
  const feedbackNodeRects = graph.nodes.flatMap((node) => {
    const rect = placement.rectByNodeId.get(node.id);
    return rect ? [rect] : [];
  });
  const minimumFeedbackNodeX = Math.min(...feedbackNodeRects.map((rect) => rect.x));
  const maximumFeedbackNodeX = Math.max(...feedbackNodeRects.map((rect) => rect.x + rect.width));
  const minimumFeedbackNodeY = Math.min(...feedbackNodeRects.map((rect) => rect.y));
  const maximumFeedbackNodeY = Math.max(...feedbackNodeRects.map((rect) => rect.y + rect.height));
  const edges = graph.edges.map((edge) => {
    const points = [...(routes.pointsByEdgeId.get(edge.id) ?? [])];
    const midpoint = getPolylineMidpoint(points);
    const width = edge.width ?? 0;
    const height = edge.height ?? 0;
    const edgeSettings = options.edgeSettings?.(edge);
    const labelPlacement = edgeSettings?.["edgeLabels.placement"] ?? "CENTER";
    const inlineLabel = edgeSettings?.["edgeLabels.inline"] === true;
    const firstPoint = points[0] ?? midpoint;
    const lastPoint = points.at(-1) ?? midpoint;
    const labelSpacing = Number(options.settings?.["spacing.edgeLabel"] ?? 2);
    const edgeThickness = Number(edgeSettings?.["edge.thickness"] ?? 1);
    const labelDummyRect = placement.rectByNodeId.get(
      expanded.labelDummyIdByEdgeId.get(edge.id) ?? "",
    );
    const edgeLabelSideSelection = options.settings?.["edgeLabels.sideSelection"] ?? "SMART_DOWN";
    const placeLabelUp =
      edgeLabelSideSelection === "ALWAYS_UP" ||
      edgeLabelSideSelection === "SMART_UP" ||
      edgeLabelSideSelection === "DIRECTION_UP";
    const horizontal = direction === "left" || direction === "right";
    const verticalTrack = horizontal
      ? points.find((point, index) => {
          const next = points[index + 1];
          return next !== undefined && point.x === next.x && point.y !== next.y;
        })
      : undefined;
    const secondPoint = points[1];
    const beforeLastPoint = points.at(-2);
    const flowDelta = horizontal ? lastPoint.x - firstPoint.x : lastPoint.y - firstPoint.y;
    const firstLeadDelta = secondPoint
      ? horizontal
        ? secondPoint.x - firstPoint.x
        : secondPoint.y - firstPoint.y
      : 0;
    const lastLeadDelta = beforeLastPoint
      ? horizontal
        ? lastPoint.x - beforeLastPoint.x
        : lastPoint.y - beforeLastPoint.y
      : 0;
    const outsideFeedback =
      routes.outsideFeedbackEdgeIds?.has(edge.id) === true ||
      (secondPoint !== undefined &&
        beforeLastPoint !== undefined &&
        flowDelta !== 0 &&
        firstLeadDelta * flowDelta < 0 &&
        lastLeadDelta * flowDelta < 0);
    const horizontalFeedbackCandidate = outsideFeedback
      ? points
          .flatMap((point, index) => {
            const next = points[index + 1];
            return next !== undefined &&
              point.y === next.y &&
              (point.y < minimumFeedbackNodeY || point.y > maximumFeedbackNodeY)
              ? [{ start: point, end: next, length: Math.abs(next.x - point.x) }]
              : [];
          })
          .sort((left, right) => right.length - left.length)[0]
      : undefined;
    const verticalFeedbackCandidate = outsideFeedback
      ? points
          .flatMap((point, index) => {
            const next = points[index + 1];
            return next !== undefined &&
              point.x === next.x &&
              (point.x < minimumFeedbackNodeX || point.x > maximumFeedbackNodeX)
              ? [{ start: point, end: next, length: Math.abs(next.y - point.y) }]
              : [];
          })
          .sort((left, right) => right.length - left.length)[0]
      : undefined;
    const sourceNode = graph.nodes.find((node) => node.id === edge.sourceId);
    const targetNode = graph.nodes.find((node) => node.id === edge.targetId);
    const sourcePort = sourceNode?.ports?.find((port) => port.name === edge.sourcePort);
    const targetPort = targetNode?.ports?.find((port) => port.name === edge.targetPort);
    const sourcePortSide =
      sourceNode && sourcePort
        ? options.portSettings?.(sourcePort, sourceNode)?.["port.side"]
        : undefined;
    const targetPortSide =
      sourceNode && targetPort
        ? options.portSettings?.(targetPort, sourceNode)?.["port.side"]
        : undefined;
    const sameSideHorizontalPortSelfLoop =
      edge.sourceId === edge.targetId &&
      (sourcePortSide === "EAST" || sourcePortSide === "WEST") &&
      targetPortSide === sourcePortSide;
    const horizontalFeedbackTrack =
      sameSideHorizontalPortSelfLoop ||
      (horizontalFeedbackCandidate?.length ?? -1) >= (verticalFeedbackCandidate?.length ?? -1)
        ? horizontalFeedbackCandidate
        : undefined;
    const verticalFeedbackTrack = horizontalFeedbackTrack ? undefined : verticalFeedbackCandidate;
    const trackNearTarget =
      verticalTrack !== undefined &&
      Math.abs(lastPoint.x - verticalTrack.x) < Math.abs(verticalTrack.x - firstPoint.x);
    const edgeNodeSpacing = Number(options.settings?.["spacing.edgeNodeBetweenLayers"] ?? 10);
    const labelBeforeTrack = direction === "right" ? trackNearTarget : !trackNearTarget;
    const routeX =
      labelPlacement === "TAIL"
        ? firstPoint.x + labelSpacing
        : labelPlacement === "HEAD"
          ? lastPoint.x - width - labelSpacing
          : inlineLabel && horizontalFeedbackTrack
            ? (horizontalFeedbackTrack.start.x + horizontalFeedbackTrack.end.x - width) / 2
            : inlineLabel && verticalFeedbackTrack
              ? verticalFeedbackTrack.start.x > (minimumFeedbackNodeX + maximumFeedbackNodeX) / 2
                ? verticalFeedbackTrack.start.x + labelSpacing + 1
                : verticalFeedbackTrack.start.x - labelSpacing - width - 1
              : inlineLabel && verticalTrack
                ? labelBeforeTrack
                  ? verticalTrack.x - edgeNodeSpacing - width
                  : verticalTrack.x + edgeNodeSpacing
                : inlineLabel
                  ? horizontal
                    ? Math.floor(midpoint.x - width / 2)
                    : Math.ceil(midpoint.x - width / 2)
                  : midpoint.x - width / 2;
    const routeY =
      labelPlacement === "CENTER" && inlineLabel && horizontalFeedbackTrack
        ? horizontalFeedbackTrack.start.y - height / 2 - 0.5
        : labelPlacement === "CENTER" && inlineLabel && verticalFeedbackTrack
          ? (verticalFeedbackTrack.start.y + verticalFeedbackTrack.end.y - height) / 2
          : labelPlacement === "CENTER" && inlineLabel
            ? midpoint.y - height / 2 - 0.5
            : labelPlacement === "CENTER" && placeLabelUp
              ? midpoint.y - height - labelSpacing - Math.round(edgeThickness / 2)
              : (labelPlacement === "CENTER" ? midpoint.y : (firstPoint.y + lastPoint.y) / 2) +
                labelSpacing +
                Math.round(edgeThickness / 2);
    const sourceRect = placement.rectByNodeId.get(edge.sourceId);
    const targetRect = placement.rectByNodeId.get(edge.targetId);
    const hasFlexiblePorts = (node: GraphNode | undefined): boolean => {
      const constraints = node ? options.nodeSettings?.(node)?.portConstraints : undefined;
      return constraints === undefined || constraints === "UNDEFINED" || constraints === "FREE";
    };
    const flexibleFeedbackLabel =
      labelPlacement === "CENTER" &&
      inlineLabel &&
      expanded.orientation.reversedEdgeIds.has(edge.id) &&
      hasFlexiblePorts(sourceNode) &&
      hasFlexiblePorts(targetNode) &&
      sourceRect !== undefined &&
      targetRect !== undefined;
    const [beforeFlowRect, afterFlowRect] =
      sourceRect && targetRect
        ? horizontal
          ? sourceRect.x <= targetRect.x
            ? [sourceRect, targetRect]
            : [targetRect, sourceRect]
          : sourceRect.y <= targetRect.y
            ? [sourceRect, targetRect]
            : [targetRect, sourceRect]
        : [undefined, undefined];
    const explicitLabelPosition =
      antiparallelLabelPositions.get(edge.id) ?? parallelLabelPositions.get(edge.id);
    const x = explicitLabelPosition
      ? explicitLabelPosition.x
      : flexibleFeedbackLabel
        ? horizontal
          ? (beforeFlowRect!.x + beforeFlowRect!.width + afterFlowRect!.x - width) / 2
          : targetRect.x + (targetRect.width - width) / 2
        : labelPlacement === "CENTER" && horizontal && labelDummyRect
          ? labelDummyRect.x
          : routeX;
    const y = explicitLabelPosition
      ? explicitLabelPosition.y
      : flexibleFeedbackLabel
        ? horizontal
          ? targetRect.y + (targetRect.height - height) / 2
          : (beforeFlowRect!.y + beforeFlowRect!.height + afterFlowRect!.y - height) / 2
        : labelPlacement === "CENTER" && !horizontal && labelDummyRect
          ? labelDummyRect.y
          : routeY;
    return {
      ...edge,
      x,
      y,
      width,
      height,
      points,
      routing:
        edgeRouting === "POLYLINE"
          ? ("polyline" as const)
          : edgeRouting === "SPLINES"
            ? ("splines" as const)
            : ("orthogonal" as const),
    };
  });

  return {
    ...graph,
    direction,
    nodes,
    edges,
  };
}

/**
 * Deterministic native layered layout for an `@statelyai/graph` graph.
 *
 * Supports flat and nested graphs, cycles, ports, self-loops, four directions,
 * custom phase strategies, and all layered edge-routing styles.
 */
export function getLayeredLayout<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions = {},
): VisualGraph<N, E, G, P> {
  return runLayeredPipeline(graph, options);
}

export const layeredAlgorithm: LayoutAlgorithm<LayeredLayoutOptions> = {
  id: "layered",
  capabilities: {
    full: true,
    incremental: false,
    partial: false,
    routeOnly: false,
    hierarchy: true,
    ports: true,
  },
  layout(graph, options, context) {
    return runLayeredPipeline(graph, options ?? {}, context);
  },
};
