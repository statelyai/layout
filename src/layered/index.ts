import type { Graph, GraphNode, VisualGraph, VisualNode } from "@statelyai/graph";
import { UnsupportedLayoutError } from "../errors";
import type { LayoutAlgorithm, LayoutExecutionContext } from "../types";
import {
  assignLayersByLongestPath,
  assignLayersByLongestPathToSink,
  assignLayersByBreadthFirstModelOrder,
  assignLayersByDepthFirstModelOrder,
  assignLayersInteractively,
  assignLayersWithCoffmanGraham,
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
  minimizeCrossingsWithBarycenter,
  minimizeCrossingsWithMedian,
  minimizeCrossingsInteractively,
  minimizeCrossingsWithModelOrder,
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
import { placeNodesWithBrandesKoepf } from "./bk-node-placement";
import { placeNodesWithLinearSegments } from "./linear-segments-node-placement";
import { placeNodesWithNetworkSimplex } from "./network-simplex-node-placement";

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
export { fromElkLayeredOptionId, toElkLayeredOptions } from "./elk-options";
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
  const orientation = measure("cycle-breaking", () => cycleBreaker(input));
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
  const assignment = measure("layer-assignment", () => layerAssigner(input, orientation));
  const expanded = measure("long-edge-splitting", () =>
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
  const order = measure("crossing-minimization", () =>
    crossingMinimizer(expanded.input, expanded.orientation, expanded.assignment),
  );
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
  const edgeRouting = options.settings?.edgeRouting ?? "ORTHOGONAL";
  const edgeRouter =
    options.strategies?.routeEdges ??
    (edgeRouting === "POLYLINE"
      ? routeEdgesWithPolylines
      : edgeRouting === "SPLINES"
        ? routeEdgesWithSplines
        : routeEdgesOrthogonally);
  const expandedRoutes = measure("edge-routing", () =>
    edgeRouter(expanded.input, expanded.orientation, placement),
  );
  const routes = measure("long-edge-joining", () =>
    joinLongEdgeRoutes(expandedRoutes, expanded.segmentIdsByEdgeId, true),
  );

  const nodes = graph.nodes.map((node): VisualNode<N, P> => {
    const rect = placement.rectByNodeId.get(node.id);
    if (!rect) {
      throw new Error(`Node placement missing for ${node.id}`);
    }
    const ports = placePorts(node.ports, rect, direction);
    return {
      ...node,
      ...rect,
      ...(ports === undefined ? {} : { ports }),
    } as VisualNode<N, P>;
  });
  const edges = graph.edges.map((edge) => {
    const points = [...(routes.pointsByEdgeId.get(edge.id) ?? [])];
    const midpoint = getPolylineMidpoint(points);
    const width = edge.width ?? 0;
    const height = edge.height ?? 0;
    return {
      ...edge,
      x: midpoint.x - width / 2,
      y: midpoint.y - height / 2,
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
