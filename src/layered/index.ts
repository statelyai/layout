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

function assertFlatGraph(graph: Graph): void {
  const compoundNodeIds = graph.nodes
    .filter((node) => node.parentId != null)
    .map((node) => node.id);
  if (compoundNodeIds.length > 0) {
    throw new UnsupportedLayoutError(
      `The first layered milestone supports flat graphs only; nested nodes: ${compoundNodeIds.join(", ")}`,
    );
  }
}

function runLayeredPipeline<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
  context?: LayoutExecutionContext,
): VisualGraph<N, E, G, P> {
  assertFlatGraph(graph);
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
    joinLongEdgeRoutes(expandedRoutes, expanded.segmentIdsByEdgeId, edgeRouting === "SPLINES"),
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
 * This initial vertical slice supports flat graphs, cycles, ports, self-loops,
 * four directions, custom phase strategies, and orthogonal routes.
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
    hierarchy: false,
    ports: true,
  },
  layout(graph, options, context) {
    return runLayeredPipeline(graph, options ?? {}, context);
  },
};
