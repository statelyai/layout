import type {
  Graph,
  GraphNode,
  VisualGraph,
  VisualNode,
} from '@statelyai/graph';
import { UnsupportedLayoutError } from '../errors';
import type {
  LayoutAlgorithm,
  LayoutExecutionContext,
} from '../types';
import {
  assignLayersByLongestPath,
  breakCyclesWithDepthFirstSearch,
  getPolylineMidpoint,
  minimizeCrossingsWithBarycenter,
  placeNodesInLayers,
  placePorts,
  routeEdgesOrthogonally,
} from './strategies';
import type {
  LayeredLayoutOptions,
  LayeredPhaseInput,
  NodeSize,
} from './types';

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
  LayerOrder,
  NodePlacement,
  NodePlacer,
  NodeSize,
} from './types';

export {
  assignLayersByLongestPath,
  breakCyclesWithDepthFirstSearch,
  minimizeCrossingsWithBarycenter,
  placeNodesInLayers,
  routeEdgesOrthogonally,
} from './strategies';

const DEFAULT_NODE_SIZE: NodeSize = { width: 100, height: 50 };

function getNodeSize(
  node: GraphNode,
  options: LayeredLayoutOptions,
): NodeSize {
  const measured = options.measure?.(node);
  if (measured) return measured;
  return {
    width:
      node.width !== undefined && node.width > 0
        ? node.width
        : DEFAULT_NODE_SIZE.width,
    height:
      node.height !== undefined && node.height > 0
        ? node.height
        : DEFAULT_NODE_SIZE.height,
  };
}

function assertFlatGraph(graph: Graph): void {
  const compoundNodeIds = graph.nodes
    .filter((node) => node.parentId != null)
    .map((node) => node.id);
  if (compoundNodeIds.length > 0) {
    throw new UnsupportedLayoutError(
      `The first layered milestone supports flat graphs only; nested nodes: ${compoundNodeIds.join(', ')}`,
    );
  }
}

function runLayeredPipeline<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
  context?: LayoutExecutionContext,
): VisualGraph<N, E, G, P> {
  assertFlatGraph(graph);
  const direction = options.direction ?? graph.direction ?? 'down';
  const input: LayeredPhaseInput = {
    graph: graph as Graph<unknown, unknown, unknown, unknown>,
    sizes: new Map(
      graph.nodes.map((node) => [node.id, getNodeSize(node, options)]),
    ),
    direction,
    spacing: {
      node: options.spacing?.node ?? 40,
      layer: options.spacing?.layer ?? 60,
    },
  };
  const measure = <T>(id: string, run: () => T): T => {
    context?.throwIfAborted();
    return context ? context.measurePhase(id, run) : run();
  };

  const orientation = measure('cycle-breaking', () =>
    (options.strategies?.breakCycles ?? breakCyclesWithDepthFirstSearch)(input),
  );
  const assignment = measure('layer-assignment', () =>
    (options.strategies?.assignLayers ?? assignLayersByLongestPath)(
      input,
      orientation,
    ),
  );
  const order = measure('crossing-minimization', () =>
    (
      options.strategies?.minimizeCrossings ??
      minimizeCrossingsWithBarycenter(options.crossingSweeps)
    )(input, orientation, assignment),
  );
  const placement = measure('node-placement', () =>
    (options.strategies?.placeNodes ?? placeNodesInLayers)(input, order),
  );
  const routes = measure('edge-routing', () =>
    (options.strategies?.routeEdges ?? routeEdgesOrthogonally)(
      input,
      orientation,
      placement,
    ),
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
      routing: 'orthogonal' as const,
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
  id: 'layered',
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
