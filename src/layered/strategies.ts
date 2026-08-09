import type {
  EntityRect,
  GraphEdge,
  GraphNode,
  GraphPort,
  Point,
} from '@statelyai/graph';
import type {
  AcyclicOrientation,
  CrossingMinimizer,
  CycleBreaker,
  EdgeRouter,
  LayerAssigner,
  LayeredPhaseInput,
  LayerOrder,
  NodePlacer,
} from './types';

function getOrientedEndpoints(
  edge: GraphEdge,
  orientation: AcyclicOrientation,
): readonly [sourceId: string, targetId: string] {
  return orientation.reversedEdgeIds.has(edge.id)
    ? [edge.targetId, edge.sourceId]
    : [edge.sourceId, edge.targetId];
}

export const breakCyclesWithDepthFirstSearch: CycleBreaker = (input) => {
  const outgoing = new Map<string, GraphEdge[]>();
  for (const node of input.graph.nodes) outgoing.set(node.id, []);
  for (const edge of input.graph.edges) {
    outgoing.get(edge.sourceId)?.push(edge);
  }

  const state = new Map<string, 'active' | 'done'>();
  const reversedEdgeIds = new Set<string>();

  for (const node of input.graph.nodes) {
    if (state.get(node.id) !== undefined) continue;
    state.set(node.id, 'active');
    const stack: Array<{ nodeId: string; edgeIndex: number }> = [
      { nodeId: node.id, edgeIndex: 0 },
    ];

    while (stack.length > 0) {
      const frame = stack.at(-1);
      if (!frame) break;
      const edges = outgoing.get(frame.nodeId) ?? [];
      const edge = edges[frame.edgeIndex];
      if (!edge) {
        state.set(frame.nodeId, 'done');
        stack.pop();
        continue;
      }
      frame.edgeIndex++;
      if (edge.sourceId === edge.targetId) continue;
      const targetState = state.get(edge.targetId);
      if (targetState === 'active') {
        reversedEdgeIds.add(edge.id);
      } else if (targetState === undefined) {
        state.set(edge.targetId, 'active');
        stack.push({ nodeId: edge.targetId, edgeIndex: 0 });
      }
    }
  }

  return { reversedEdgeIds };
};

export const assignLayersByLongestPath: LayerAssigner = (
  input,
  orientation,
) => {
  const indegree = new Map<string, number>();
  const successors = new Map<string, string[]>();
  const layerByNodeId = new Map<string, number>();

  for (const node of input.graph.nodes) {
    indegree.set(node.id, 0);
    successors.set(node.id, []);
    layerByNodeId.set(node.id, 0);
  }

  for (const edge of input.graph.edges) {
    const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
    if (sourceId === targetId) continue;
    successors.get(sourceId)?.push(targetId);
    indegree.set(targetId, (indegree.get(targetId) ?? 0) + 1);
  }

  const queue = input.graph.nodes
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id);

  for (let index = 0; index < queue.length; index++) {
    const sourceId = queue[index];
    if (sourceId === undefined) continue;
    const sourceLayer = layerByNodeId.get(sourceId) ?? 0;
    for (const targetId of successors.get(sourceId) ?? []) {
      layerByNodeId.set(
        targetId,
        Math.max(layerByNodeId.get(targetId) ?? 0, sourceLayer + 1),
      );
      const nextIndegree = (indegree.get(targetId) ?? 1) - 1;
      indegree.set(targetId, nextIndegree);
      if (nextIndegree === 0) queue.push(targetId);
    }
  }

  return { layerByNodeId };
};

function sortLayerByBarycenter(
  layer: string[],
  adjacentLayer: readonly string[],
  neighbors: ReadonlyMap<string, readonly string[]>,
): void {
  const adjacentIndex = new Map(
    adjacentLayer.map((nodeId, index) => [nodeId, index] as const),
  );
  const originalIndex = new Map(
    layer.map((nodeId, index) => [nodeId, index] as const),
  );

  layer.sort((a, b) => {
    const barycenter = (nodeId: string): number => {
      const positions = (neighbors.get(nodeId) ?? [])
        .map((id) => adjacentIndex.get(id))
        .filter((value): value is number => value !== undefined);
      if (positions.length === 0) return originalIndex.get(nodeId) ?? 0;
      return positions.reduce((sum, value) => sum + value, 0) / positions.length;
    };
    return (
      barycenter(a) - barycenter(b) ||
      (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0)
    );
  });
}

export function minimizeCrossingsWithBarycenter(
  sweeps = 4,
): CrossingMinimizer {
  return (input, orientation, assignment) => {
    let maximumLayer = 0;
    for (const layer of assignment.layerByNodeId.values()) {
      maximumLayer = Math.max(maximumLayer, layer);
    }
    const layerCount = maximumLayer + 1;
    const layers = Array.from({ length: layerCount }, () => [] as string[]);
    for (const node of input.graph.nodes) {
      layers[assignment.layerByNodeId.get(node.id) ?? 0]?.push(node.id);
    }

    const predecessors = new Map<string, string[]>();
    const successors = new Map<string, string[]>();
    for (const node of input.graph.nodes) {
      predecessors.set(node.id, []);
      successors.set(node.id, []);
    }
    for (const edge of input.graph.edges) {
      const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
      if (sourceId === targetId) continue;
      successors.get(sourceId)?.push(targetId);
      predecessors.get(targetId)?.push(sourceId);
    }

    for (let sweep = 0; sweep < sweeps; sweep++) {
      for (let layer = 1; layer < layers.length; layer++) {
        const current = layers[layer];
        const previous = layers[layer - 1];
        if (current && previous) {
          sortLayerByBarycenter(current, previous, predecessors);
        }
      }
      for (let layer = layers.length - 2; layer >= 0; layer--) {
        const current = layers[layer];
        const next = layers[layer + 1];
        if (current && next) sortLayerByBarycenter(current, next, successors);
      }
    }

    return { layers };
  };
}

function sumWithSpacing(
  ids: readonly string[],
  input: LayeredPhaseInput,
  axis: 'width' | 'height',
): number {
  return ids.reduce(
    (total, id, index) =>
      total +
      (input.sizes.get(id)?.[axis] ?? 0) +
      (index === 0 ? 0 : input.spacing.node),
    0,
  );
}

export const placeNodesInLayers: NodePlacer = (input, order) => {
  const horizontal =
    input.direction === 'left' || input.direction === 'right';
  const layerFlowSizes = order.layers.map((layer) =>
    Math.max(
      0,
      ...layer.map((id) =>
        horizontal
          ? (input.sizes.get(id)?.width ?? 0)
          : (input.sizes.get(id)?.height ?? 0),
      ),
    ),
  );
  const layerCrossSizes = order.layers.map((layer) =>
    sumWithSpacing(layer, input, horizontal ? 'height' : 'width'),
  );
  let maxCrossSize = 0;
  for (const size of layerCrossSizes) maxCrossSize = Math.max(maxCrossSize, size);
  const rectByNodeId = new Map<string, EntityRect>();
  let flow = 0;

  order.layers.forEach((layer, layerIndex) => {
    let cross = (maxCrossSize - (layerCrossSizes[layerIndex] ?? 0)) / 2;
    for (const id of layer) {
      const size = input.sizes.get(id) ?? { width: 0, height: 0 };
      const rect = horizontal
        ? { x: flow, y: cross, ...size }
        : { x: cross, y: flow, ...size };
      rectByNodeId.set(id, rect);
      cross +=
        (horizontal ? size.height : size.width) + input.spacing.node;
    }
    flow += (layerFlowSizes[layerIndex] ?? 0) + input.spacing.layer;
  });

  if (input.direction === 'up' || input.direction === 'left') {
    let extent = 0;
    for (const rect of rectByNodeId.values()) {
      extent = Math.max(
        extent,
        horizontal ? rect.x + rect.width : rect.y + rect.height,
      );
    }
    for (const [id, rect] of rectByNodeId) {
      rectByNodeId.set(
        id,
        horizontal
          ? { ...rect, x: extent - rect.x - rect.width }
          : { ...rect, y: extent - rect.y - rect.height },
      );
    }
  }

  return { rectByNodeId };
};

function getPortPoint(
  node: GraphNode,
  portName: string | undefined,
  rect: EntityRect,
  fallback: Point,
  direction: LayeredPhaseInput['direction'],
): Point {
  if (portName === undefined) return fallback;
  const port = placePorts(node.ports, rect, direction)?.find(
    (candidate) => candidate.name === portName,
  );
  if (port?.x === undefined || port.y === undefined) return fallback;
  return {
    x: rect.x + port.x + (port.width ?? 0) / 2,
    y: rect.y + port.y + (port.height ?? 0) / 2,
  };
}

function removeDuplicatePoints(points: readonly Point[]): Point[] {
  return points.filter(
    (point, index) =>
      index === 0 ||
      point.x !== points[index - 1]?.x ||
      point.y !== points[index - 1]?.y,
  );
}

export const routeEdgesOrthogonally: EdgeRouter = (input, _orientation, placement) => {
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const pointsByEdgeId = new Map<string, readonly Point[]>();
  const horizontal =
    input.direction === 'left' || input.direction === 'right';
  const reverse = input.direction === 'up' || input.direction === 'left';

  for (const edge of input.graph.edges) {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    const sourceRect = placement.rectByNodeId.get(edge.sourceId);
    const targetRect = placement.rectByNodeId.get(edge.targetId);
    if (!source || !target || !sourceRect || !targetRect) continue;

    if (source.id === target.id) {
      const x = sourceRect.x + sourceRect.width;
      const y = sourceRect.y + sourceRect.height / 2;
      pointsByEdgeId.set(edge.id, [
        { x, y },
        { x: x + 24, y },
        { x: x + 24, y: y - 24 },
        { x, y: y - 24 },
      ]);
      continue;
    }

    const sourceFallback = horizontal
      ? {
          x: sourceRect.x + (reverse ? 0 : sourceRect.width),
          y: sourceRect.y + sourceRect.height / 2,
        }
      : {
          x: sourceRect.x + sourceRect.width / 2,
          y: sourceRect.y + (reverse ? 0 : sourceRect.height),
        };
    const targetFallback = horizontal
      ? {
          x: targetRect.x + (reverse ? targetRect.width : 0),
          y: targetRect.y + targetRect.height / 2,
        }
      : {
          x: targetRect.x + targetRect.width / 2,
          y: targetRect.y + (reverse ? targetRect.height : 0),
        };
    const start = getPortPoint(
      source,
      edge.sourcePort,
      sourceRect,
      sourceFallback,
      input.direction,
    );
    const end = getPortPoint(
      target,
      edge.targetPort,
      targetRect,
      targetFallback,
      input.direction,
    );
    const middle = horizontal
      ? [
          { x: (start.x + end.x) / 2, y: start.y },
          { x: (start.x + end.x) / 2, y: end.y },
        ]
      : [
          { x: start.x, y: (start.y + end.y) / 2 },
          { x: end.x, y: (start.y + end.y) / 2 },
        ];
    pointsByEdgeId.set(
      edge.id,
      removeDuplicatePoints([start, ...middle, end]),
    );
  }

  return { pointsByEdgeId };
};

export function placePorts<P>(
  ports: readonly GraphPort<P>[] | undefined,
  rect: EntityRect,
  direction: LayeredPhaseInput['direction'],
): GraphPort<P>[] | undefined {
  if (!ports) return undefined;
  const horizontal = direction === 'left' || direction === 'right';
  const reverse = direction === 'up' || direction === 'left';
  return ports.map((port, index) => {
    const size = { width: port.width ?? 8, height: port.height ?? 8 };
    if (port.x !== undefined && port.y !== undefined) {
      return { ...port, ...size };
    }
    const ratio = (index + 1) / (ports.length + 1);
    const outgoing = port.direction !== 'in';
    const farSide = reverse ? !outgoing : outgoing;
    return {
      ...port,
      ...size,
      x: horizontal
        ? farSide
          ? rect.width - size.width / 2
          : -size.width / 2
        : ratio * rect.width - size.width / 2,
      y: horizontal
        ? ratio * rect.height - size.height / 2
        : farSide
          ? rect.height - size.height / 2
          : -size.height / 2,
    };
  });
}

export function getPolylineMidpoint(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let total = 0;
  const lengths: number[] = [];
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const point = points[index];
    if (!previous || !point) continue;
    const length = Math.hypot(point.x - previous.x, point.y - previous.y);
    lengths.push(length);
    total += length;
  }
  let remaining = total / 2;
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const point = points[index];
    const length = lengths[index - 1] ?? 0;
    if (!previous || !point) continue;
    if (remaining <= length) {
      const ratio = length === 0 ? 0 : remaining / length;
      return {
        x: previous.x + (point.x - previous.x) * ratio,
        y: previous.y + (point.y - previous.y) * ratio,
      };
    }
    remaining -= length;
  }
  return points.at(-1) ?? { x: 0, y: 0 };
}
