import type { EntityRect, GraphEdge, GraphNode, GraphPort, Point } from "@statelyai/graph";
import { LayoutError } from "../errors";
import { JavaRandom } from "../java-random";
import type {
  AcyclicOrientation,
  CrossingMinimizer,
  CycleBreaker,
  EdgeRouter,
  LayerAssigner,
  LayerAssignment,
  LayeredPhaseInput,
  NodePlacer,
} from "./types";

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

  const state = new Map<string, "active" | "done">();
  const reversedEdgeIds = new Set<string>();

  for (const node of input.graph.nodes) {
    if (state.get(node.id) !== undefined) continue;
    state.set(node.id, "active");
    const stack: Array<{ nodeId: string; edgeIndex: number }> = [{ nodeId: node.id, edgeIndex: 0 }];

    while (stack.length > 0) {
      const frame = stack.at(-1);
      if (!frame) break;
      const edges = outgoing.get(frame.nodeId) ?? [];
      const edge = edges[frame.edgeIndex];
      if (!edge) {
        state.set(frame.nodeId, "done");
        stack.pop();
        continue;
      }
      frame.edgeIndex++;
      if (edge.sourceId === edge.targetId) continue;
      const targetState = state.get(edge.targetId);
      if (targetState === "active") {
        reversedEdgeIds.add(edge.id);
      } else if (targetState === undefined) {
        state.set(edge.targetId, "active");
        stack.push({ nodeId: edge.targetId, edgeIndex: 0 });
      }
    }
  }

  return { reversedEdgeIds };
};

/**
 * ELK v0.11.0's Eades-style greedy feedback-arc heuristic.
 * Source: GreedyCycleBreaker.java at tag v0.11.0 (54123e8).
 */
function breakCyclesWithGreedyHeuristic(
  input: LayeredPhaseInput,
  tieBreaker: "seeded-random" | "model-order",
): AcyclicOrientation {
  const nodes = input.graph.nodes;
  const indexByNodeId = new Map(nodes.map((node, index) => [node.id, index]));
  const incoming = new Map(nodes.map((node) => [node.id, [] as GraphEdge[]]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as GraphEdge[]]));
  const indegree = Array.from({ length: nodes.length }, () => 0);
  const outdegree = Array.from({ length: nodes.length }, () => 0);
  const marks = Array.from({ length: nodes.length }, () => 0);
  const priority = (edge: GraphEdge): number =>
    Math.max(0, input.edgeSettings?.(edge)?.["priority.direction"] ?? 0) + 1;

  for (const edge of input.graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    const sourceIndex = indexByNodeId.get(edge.sourceId);
    const targetIndex = indexByNodeId.get(edge.targetId);
    if (sourceIndex === undefined || targetIndex === undefined) continue;
    outgoing.get(edge.sourceId)?.push(edge);
    incoming.get(edge.targetId)?.push(edge);
    const weight = priority(edge);
    outdegree[sourceIndex] = (outdegree[sourceIndex] ?? 0) + weight;
    indegree[targetIndex] = (indegree[targetIndex] ?? 0) + weight;
  }

  const sources: string[] = [];
  const sinks: string[] = [];
  for (const [index, node] of nodes.entries()) {
    if (outdegree[index] === 0) sinks.push(node.id);
    else if (indegree[index] === 0) sources.push(node.id);
  }

  const updateNeighbors = (nodeId: string) => {
    for (const edge of outgoing.get(nodeId) ?? []) {
      const index = indexByNodeId.get(edge.targetId);
      if (index === undefined || marks[index] !== 0) continue;
      indegree[index] = (indegree[index] ?? 0) - priority(edge);
      if ((indegree[index] ?? 0) <= 0 && (outdegree[index] ?? 0) > 0) {
        sources.push(edge.targetId);
      }
    }
    for (const edge of incoming.get(nodeId) ?? []) {
      const index = indexByNodeId.get(edge.sourceId);
      if (index === undefined || marks[index] !== 0) continue;
      outdegree[index] = (outdegree[index] ?? 0) - priority(edge);
      if ((outdegree[index] ?? 0) <= 0 && (indegree[index] ?? 0) > 0) {
        sinks.push(edge.sourceId);
      }
    }
  };

  const seed = input.settings.randomSeed ?? 1;
  const random = new JavaRandom(seed === 0 ? Date.now() : seed);
  let unprocessed = nodes.length;
  let nextRight = -1;
  let nextLeft = 1;

  while (unprocessed > 0) {
    while (sinks.length > 0) {
      const nodeId = sinks.shift();
      if (nodeId === undefined) continue;
      const index = indexByNodeId.get(nodeId);
      if (index === undefined || marks[index] !== 0) continue;
      marks[index] = nextRight--;
      updateNeighbors(nodeId);
      unprocessed--;
    }
    while (sources.length > 0) {
      const nodeId = sources.shift();
      if (nodeId === undefined) continue;
      const index = indexByNodeId.get(nodeId);
      if (index === undefined || marks[index] !== 0) continue;
      marks[index] = nextLeft++;
      updateNeighbors(nodeId);
      unprocessed--;
    }
    if (unprocessed === 0) break;

    let maximumOutflow = Number.NEGATIVE_INFINITY;
    const maximumNodeIds: string[] = [];
    for (const [index, node] of nodes.entries()) {
      if (marks[index] !== 0) continue;
      const outflow = (outdegree[index] ?? 0) - (indegree[index] ?? 0);
      if (outflow > maximumOutflow) {
        maximumOutflow = outflow;
        maximumNodeIds.length = 0;
      }
      if (outflow === maximumOutflow) maximumNodeIds.push(node.id);
    }
    const nodeId =
      tieBreaker === "model-order"
        ? maximumNodeIds[0]
        : maximumNodeIds[random.nextInt(maximumNodeIds.length)];
    if (nodeId === undefined) throw new Error("Greedy cycle breaker made no progress");
    const index = indexByNodeId.get(nodeId);
    if (index === undefined) throw new Error(`Unknown node ${nodeId}`);
    marks[index] = nextLeft++;
    updateNeighbors(nodeId);
    unprocessed--;
  }

  const shift = nodes.length + 1;
  for (let index = 0; index < marks.length; index++) {
    if ((marks[index] ?? 0) < 0) marks[index] = (marks[index] ?? 0) + shift;
  }

  const reversedEdgeIds = new Set<string>();
  for (const edge of input.graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    const source = indexByNodeId.get(edge.sourceId);
    const target = indexByNodeId.get(edge.targetId);
    if (source === undefined || target === undefined) continue;
    if ((marks[source] ?? 0) > (marks[target] ?? 0)) reversedEdgeIds.add(edge.id);
  }
  return { reversedEdgeIds };
}

export const breakCyclesGreedily: CycleBreaker = (input) =>
  breakCyclesWithGreedyHeuristic(input, "seeded-random");

export const breakCyclesGreedilyByModelOrder: CycleBreaker = (input) =>
  breakCyclesWithGreedyHeuristic(input, "model-order");

/** ELK MODEL_ORDER for flat graphs without FIRST/LAST layer constraints. */
export const breakCyclesByModelOrder: CycleBreaker = (input) => {
  const order = new Map(input.graph.nodes.map((node, index) => [node.id, index]));
  return {
    reversedEdgeIds: new Set(
      input.graph.edges
        .filter(
          (edge) =>
            edge.sourceId !== edge.targetId &&
            (order.get(edge.sourceId) ?? 0) > (order.get(edge.targetId) ?? 0),
        )
        .map((edge) => edge.id),
    ),
  };
};

function addDepthFirstBackEdges(
  input: LayeredPhaseInput,
  initialReversedEdgeIds: ReadonlySet<string>,
  targetOrder: "edge" | "model",
): Set<string> {
  const reversedEdgeIds = new Set(initialReversedEdgeIds);
  const outgoing = new Map(input.graph.nodes.map((node) => [node.id, [] as GraphEdge[]]));
  for (const edge of input.graph.edges) {
    const sourceId = reversedEdgeIds.has(edge.id) ? edge.targetId : edge.sourceId;
    outgoing.get(sourceId)?.push(edge);
  }
  const modelOrder = new Map(input.graph.nodes.map((node, index) => [node.id, index]));
  if (targetOrder === "model") {
    for (const edges of outgoing.values()) {
      edges.sort((left, right) => {
        const leftTarget = reversedEdgeIds.has(left.id) ? left.sourceId : left.targetId;
        const rightTarget = reversedEdgeIds.has(right.id) ? right.sourceId : right.targetId;
        return (modelOrder.get(leftTarget) ?? Infinity) - (modelOrder.get(rightTarget) ?? Infinity);
      });
    }
  }

  const state = new Map<string, "active" | "done">();
  const visit = (startId: string) => {
    if (state.has(startId)) return;
    state.set(startId, "active");
    const stack: Array<{ nodeId: string; edgeIndex: number }> = [{ nodeId: startId, edgeIndex: 0 }];
    while (stack.length > 0) {
      const frame = stack.at(-1);
      if (!frame) break;
      const edges = outgoing.get(frame.nodeId) ?? [];
      const edge = edges[frame.edgeIndex++];
      if (!edge) {
        state.set(frame.nodeId, "done");
        stack.pop();
        continue;
      }
      const reversed = reversedEdgeIds.has(edge.id);
      const sourceId = reversed ? edge.targetId : edge.sourceId;
      const targetId = reversed ? edge.sourceId : edge.targetId;
      if (sourceId === targetId) continue;
      const targetState = state.get(targetId);
      if (targetState === "active") {
        reversedEdgeIds.add(edge.id);
      } else if (targetState === undefined) {
        state.set(targetId, "active");
        stack.push({ nodeId: targetId, edgeIndex: 0 });
      }
    }
  };

  for (const node of input.graph.nodes) visit(node.id);
  return reversedEdgeIds;
}

/** ELK INTERACTIVE: honor authored x-order, then remove any remaining DFS back edges. */
export const breakCyclesInteractively: CycleBreaker = (input) => {
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const initial = new Set(
    input.graph.edges
      .filter((edge) => {
        if (edge.sourceId === edge.targetId) return false;
        const sourceX = nodeById.get(edge.sourceId)?.x ?? 0;
        const targetX = nodeById.get(edge.targetId)?.x ?? 0;
        return targetX < sourceX;
      })
      .map((edge) => edge.id),
  );
  return { reversedEdgeIds: addDepthFirstBackEdges(input, initial, "edge") };
};

export const breakCyclesWithModelOrderDepthFirstSearch: CycleBreaker = (input) => ({
  reversedEdgeIds: addDepthFirstBackEdges(input, new Set(), "model"),
});

/** ELK BFS_NODE_ORDER, with input node order as ELK's internal model order. */
export const breakCyclesWithModelOrderBreadthFirstSearch: CycleBreaker = (input) => {
  const nodes = input.graph.nodes;
  const nodeIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as GraphEdge[]]));
  const incomingCount = new Map(nodes.map((node) => [node.id, 0]));
  const outgoingCount = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of input.graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    outgoing.get(edge.sourceId)?.push(edge);
    incomingCount.set(edge.targetId, (incomingCount.get(edge.targetId) ?? 0) + 1);
    outgoingCount.set(edge.sourceId, (outgoingCount.get(edge.sourceId) ?? 0) + 1);
  }
  const sources = new Set(
    nodes.filter((node) => (incomingCount.get(node.id) ?? 0) === 0).map((node) => node.id),
  );
  const sinks = new Set(
    nodes.filter((node) => (outgoingCount.get(node.id) ?? 0) === 0).map((node) => node.id),
  );
  const visited = new Set<string>();
  const reversedEdgeIds = new Set<string>();
  const queue: string[] = [];

  const runQueue = () => {
    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (nodeId === undefined || visited.has(nodeId)) continue;
      visited.add(nodeId);
      const groups = new Map<number, GraphEdge[]>();
      for (const edge of outgoing.get(nodeId) ?? []) {
        const key = nodeIndex.get(edge.targetId) ?? Number.MAX_SAFE_INTEGER - groups.size;
        const group = groups.get(key) ?? [];
        group.push(edge);
        groups.set(key, group);
      }
      for (const key of [...groups.keys()].sort((left, right) => left - right)) {
        const edges = groups.get(key) ?? [];
        const targetId = edges[0]?.targetId;
        if (targetId === undefined || targetId === nodeId) continue;
        if (visited.has(targetId) && !sources.has(nodeId) && !sinks.has(targetId)) {
          for (const edge of edges) reversedEdgeIds.add(edge.id);
        } else {
          queue.push(targetId);
        }
      }
    }
  };

  for (const source of sources) {
    queue.push(source);
    runQueue();
  }
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      queue.push(node.id);
      runQueue();
    }
  }
  return { reversedEdgeIds };
};

function getStronglyConnectedComponents(
  input: LayeredPhaseInput,
  reversedEdgeIds: ReadonlySet<string>,
): string[][] {
  const nodeIds = input.graph.nodes.map((node) => node.id);
  const outgoing = new Map(nodeIds.map((id) => [id, [] as string[]]));
  const incoming = new Map(nodeIds.map((id) => [id, [] as string[]]));
  for (const edge of input.graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    const [sourceId, targetId] = reversedEdgeIds.has(edge.id)
      ? [edge.targetId, edge.sourceId]
      : [edge.sourceId, edge.targetId];
    outgoing.get(sourceId)?.push(targetId);
    incoming.get(targetId)?.push(sourceId);
  }

  const visited = new Set<string>();
  const finishOrder: string[] = [];
  for (const startId of nodeIds) {
    if (visited.has(startId)) continue;
    visited.add(startId);
    const stack: Array<{ id: string; index: number }> = [{ id: startId, index: 0 }];
    while (stack.length > 0) {
      const frame = stack.at(-1);
      if (!frame) break;
      const targetId = outgoing.get(frame.id)?.[frame.index++];
      if (targetId !== undefined) {
        if (!visited.has(targetId)) {
          visited.add(targetId);
          stack.push({ id: targetId, index: 0 });
        }
      } else {
        finishOrder.push(frame.id);
        stack.pop();
      }
    }
  }

  const assigned = new Set<string>();
  const components: string[][] = [];
  for (let index = finishOrder.length - 1; index >= 0; index--) {
    const startId = finishOrder[index];
    if (startId === undefined || assigned.has(startId)) continue;
    const component: string[] = [];
    const stack = [startId];
    assigned.add(startId);
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined) continue;
      component.push(id);
      for (const predecessorId of incoming.get(id) ?? []) {
        if (!assigned.has(predecessorId)) {
          assigned.add(predecessorId);
          stack.push(predecessorId);
        }
      }
    }
    if (component.length > 1) components.push(component);
  }
  return components;
}

function breakCyclesByStronglyConnectedComponents(
  input: LayeredPhaseInput,
  strategy: "connectivity" | "node-type",
): AcyclicOrientation {
  const reversedEdgeIds = new Set<string>();
  const modelOrder = new Map(input.graph.nodes.map((node, index) => [node.id, index]));
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));

  while (true) {
    const components = getStronglyConnectedComponents(input, reversedEdgeIds);
    if (components.length === 0) return { reversedEdgeIds };
    let changed = false;

    for (const component of components) {
      const members = new Set(component);
      const ordered = [...component].sort(
        (left, right) => (modelOrder.get(left) ?? 0) - (modelOrder.get(right) ?? 0),
      );
      const minimumId = ordered[0];
      const maximumId = ordered.at(-1);
      if (minimumId === undefined || maximumId === undefined) continue;

      const incoming: GraphEdge[] = [];
      const outgoing: GraphEdge[] = [];
      let minimumIndegree = 0;
      let maximumOutdegree = 0;
      for (const edge of input.graph.edges) {
        if (edge.sourceId === edge.targetId) continue;
        const [sourceId, targetId] = reversedEdgeIds.has(edge.id)
          ? [edge.targetId, edge.sourceId]
          : [edge.sourceId, edge.targetId];
        if (targetId === minimumId) {
          minimumIndegree++;
          if (members.has(sourceId)) incoming.push(edge);
        }
        if (sourceId === maximumId) {
          maximumOutdegree++;
          if (members.has(targetId)) outgoing.push(edge);
        }
      }

      let selected: GraphEdge[];
      if (strategy === "node-type") {
        const minimum = nodeById.get(minimumId);
        const maximum = nodeById.get(maximumId);
        const minimumGroup = minimum
          ? (input.nodeSettings?.(minimum)?.[
              "considerModelOrder.groupModelOrder.cycleBreakingId"
            ] ?? 0)
          : 0;
        const maximumGroup = maximum
          ? (input.nodeSettings?.(maximum)?.[
              "considerModelOrder.groupModelOrder.cycleBreakingId"
            ] ?? 0)
          : 0;
        const preferredSource =
          input.settings["considerModelOrder.groupModelOrder.cbPreferredSourceId"];
        const preferredTarget =
          input.settings["considerModelOrder.groupModelOrder.cbPreferredTargetId"];
        if (preferredSource !== undefined && minimumGroup === preferredSource) selected = incoming;
        else if (preferredTarget !== undefined && maximumGroup === preferredTarget)
          selected = outgoing;
        else selected = minimumIndegree > maximumOutdegree ? incoming : outgoing;
      } else {
        selected = minimumIndegree > maximumOutdegree ? incoming : outgoing;
      }

      for (const edge of selected) {
        if (reversedEdgeIds.has(edge.id)) reversedEdgeIds.delete(edge.id);
        else reversedEdgeIds.add(edge.id);
        changed = true;
      }
    }
    if (!changed) throw new Error("SCC cycle breaker made no progress");
  }
}

export const breakCyclesByStronglyConnectedConnectivity: CycleBreaker = (input) =>
  breakCyclesByStronglyConnectedComponents(input, "connectivity");

export const breakCyclesByStronglyConnectedNodeType: CycleBreaker = (input) =>
  breakCyclesByStronglyConnectedComponents(input, "node-type");

export const assignLayersByLongestPath: LayerAssigner = (input, orientation) => {
  const indegree = new Map<string, number>();
  const successors = new Map<string, string[]>();
  const layerByNodeId = new Map<string, number>();

  for (const node of input.graph.nodes) {
    indegree.set(node.id, 0);
    successors.set(node.id, []);
    layerByNodeId.set(node.id, input.constrainedLayerByNodeId.get(node.id) ?? 0);
  }

  for (const edge of input.graph.edges) {
    const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
    if (sourceId === targetId) continue;
    const sourceConstraint = input.constrainedLayerByNodeId.get(sourceId);
    const targetConstraint = input.constrainedLayerByNodeId.get(targetId);
    if (
      sourceConstraint !== undefined &&
      targetConstraint !== undefined &&
      targetConstraint <= sourceConstraint
    ) {
      throw new LayoutError(
        `Layer constraints conflict on edge ${edge.id}`,
        "UNSATISFIABLE_CONSTRAINTS",
      );
    }
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
      const targetConstraint = input.constrainedLayerByNodeId.get(targetId);
      if (targetConstraint !== undefined && targetConstraint < sourceLayer + 1) {
        throw new LayoutError(
          `Layer constraint conflicts at node ${targetId}`,
          "UNSATISFIABLE_CONSTRAINTS",
        );
      }
      layerByNodeId.set(
        targetId,
        targetConstraint ?? Math.max(layerByNodeId.get(targetId) ?? 0, sourceLayer + 1),
      );
      const nextIndegree = (indegree.get(targetId) ?? 1) - 1;
      indegree.set(targetId, nextIndegree);
      if (nextIndegree === 0) queue.push(targetId);
    }
  }

  return { layerByNodeId };
};

/** ELK LONGEST_PATH: align sinks on the final layer. */
export const assignLayersByLongestPathToSink: LayerAssigner = (input, orientation) => {
  const outdegree = new Map(input.graph.nodes.map((node) => [node.id, 0]));
  const predecessors = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
  const heightByNodeId = new Map(input.graph.nodes.map((node) => [node.id, 0]));

  for (const edge of input.graph.edges) {
    const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
    if (sourceId === targetId) continue;
    outdegree.set(sourceId, (outdegree.get(sourceId) ?? 0) + 1);
    predecessors.get(targetId)?.push(sourceId);
  }

  const queue = input.graph.nodes
    .filter((node) => outdegree.get(node.id) === 0)
    .map((node) => node.id);
  let maximumHeight = 0;
  for (let index = 0; index < queue.length; index++) {
    const targetId = queue[index];
    if (targetId === undefined) continue;
    const targetHeight = heightByNodeId.get(targetId) ?? 0;
    maximumHeight = Math.max(maximumHeight, targetHeight);
    for (const sourceId of predecessors.get(targetId) ?? []) {
      heightByNodeId.set(sourceId, Math.max(heightByNodeId.get(sourceId) ?? 0, targetHeight + 1));
      const remaining = (outdegree.get(sourceId) ?? 1) - 1;
      outdegree.set(sourceId, remaining);
      if (remaining === 0) queue.push(sourceId);
    }
  }
  for (const height of heightByNodeId.values()) maximumHeight = Math.max(maximumHeight, height);

  return {
    layerByNodeId: new Map(
      input.graph.nodes.map((node) => [
        node.id,
        maximumHeight - (heightByNodeId.get(node.id) ?? 0),
      ]),
    ),
  };
};

/** ELK INTERACTIVE layering for normal flat nodes. */
export const assignLayersInteractively: LayerAssigner = (input, orientation) => {
  const intervals = input.graph.nodes
    .map((node, modelOrder) => {
      const start = node.x ?? 0;
      return {
        nodeId: node.id,
        start,
        end: Math.max(start + 1, start + (input.sizes.get(node.id)?.width ?? 0)),
        modelOrder,
      };
    })
    .sort((left, right) => left.start - right.start || left.modelOrder - right.modelOrder);
  const spans: Array<{ start: number; end: number; nodeIds: string[] }> = [];
  for (const interval of intervals) {
    const previous = spans.at(-1);
    if (previous && previous.end > interval.start) {
      previous.end = Math.max(previous.end, interval.end);
      previous.nodeIds.push(interval.nodeId);
    } else {
      spans.push({ start: interval.start, end: interval.end, nodeIds: [interval.nodeId] });
    }
  }

  const layerByNodeId = new Map<string, number>();
  for (const [layer, span] of spans.entries()) {
    for (const nodeId of span.nodeIds) layerByNodeId.set(nodeId, layer);
  }
  const successors = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of input.graph.edges) {
    const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
    if (sourceId !== targetId) successors.get(sourceId)?.push(targetId);
  }

  const pending = input.graph.nodes.map((node) => node.id);
  const pendingSet = new Set(pending);
  while (pending.length > 0) {
    const sourceId = pending.shift();
    if (sourceId === undefined) continue;
    pendingSet.delete(sourceId);
    const sourceLayer = layerByNodeId.get(sourceId) ?? 0;
    for (const targetId of successors.get(sourceId) ?? []) {
      if ((layerByNodeId.get(targetId) ?? 0) <= sourceLayer) {
        layerByNodeId.set(targetId, sourceLayer + 1);
        if (!pendingSet.has(targetId)) {
          pending.push(targetId);
          pendingSet.add(targetId);
        }
      }
    }
  }

  const usedLayers = [...new Set(layerByNodeId.values())].sort((left, right) => left - right);
  for (const [nodeId, layer] of layerByNodeId) {
    layerByNodeId.set(nodeId, usedLayers.indexOf(layer));
  }
  return { layerByNodeId };
};

/** ELK BF_MODEL_ORDER for normal flat nodes (label dummies are a later preprocessing slice). */
export const assignLayersByBreadthFirstModelOrder: LayerAssigner = (input, orientation) => {
  const incoming = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of input.graph.edges) {
    const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
    if (sourceId !== targetId) incoming.get(targetId)?.push(sourceId);
  }
  const layerByNodeId = new Map<string, number>();
  let currentLayer = 0;
  for (const [index, node] of input.graph.nodes.entries()) {
    if (
      index > 0 &&
      (incoming.get(node.id) ?? []).some((sourceId) => layerByNodeId.get(sourceId) === currentLayer)
    ) {
      currentLayer++;
    }
    layerByNodeId.set(node.id, currentLayer);
  }
  return { layerByNodeId };
};

/** ELK DF_MODEL_ORDER for normal flat nodes, before label-dummy insertion. */
export const assignLayersByDepthFirstModelOrder: LayerAssigner = (input, orientation) => {
  const incoming = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of input.graph.edges) {
    const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
    if (sourceId !== targetId) incoming.get(targetId)?.push(sourceId);
  }
  const placed = new Map<string, number>();
  const pending = new Map<string, number>();
  let maximumPendingLayer = 0;
  let currentLayer = 0;

  const placePending = (offset = 0) => {
    for (const [nodeId, desiredLayer] of pending) placed.set(nodeId, desiredLayer + offset);
    pending.clear();
    maximumPendingLayer = 0;
  };
  const maximumConnectedLayer = (nodeId: string, baseline: number) =>
    (incoming.get(nodeId) ?? []).reduce(
      (maximum, sourceId) => Math.max(maximum, placed.get(sourceId) ?? maximum),
      baseline,
    );

  for (const [index, node] of input.graph.nodes.entries()) {
    if (index === 0) {
      placed.set(node.id, 0);
      continue;
    }
    const predecessors = incoming.get(node.id) ?? [];
    const connectedToCurrent = predecessors.some(
      (sourceId) => (pending.get(sourceId) ?? placed.get(sourceId)) === currentLayer,
    );
    if (connectedToCurrent) {
      const maximumLayer = maximumConnectedLayer(node.id, currentLayer);
      const desiredLayer = maximumLayer + 2;
      const layerDifference = maximumLayer - currentLayer;
      if (pending.size > 0) {
        if (layerDifference > 0) {
          placePending(maximumLayer - maximumPendingLayer);
          placed.set(node.id, desiredLayer);
        } else {
          pending.set(node.id, desiredLayer);
          maximumPendingLayer = Math.max(maximumPendingLayer, desiredLayer);
        }
      } else {
        placed.set(node.id, desiredLayer);
      }
      currentLayer = desiredLayer;
    } else {
      placePending();
      if (predecessors.length === 0) {
        pending.set(node.id, 0);
        currentLayer = 0;
      } else {
        const desiredLayer = maximumConnectedLayer(node.id, 0) + 2;
        placed.set(node.id, desiredLayer);
        currentLayer = desiredLayer;
      }
    }
  }
  placePending();

  const usedLayers = [...new Set(placed.values())].sort((left, right) => left - right);
  return {
    layerByNodeId: new Map(
      input.graph.nodes.map((node) => [node.id, usedLayers.indexOf(placed.get(node.id) ?? 0)]),
    ),
  };
};

/** ELK COFFMAN_GRAHAM for flat DAGs, including transitive reduction and layer bounds. */
export const assignLayersWithCoffmanGraham: LayerAssigner = (input, orientation) => {
  const nodeIds = input.graph.nodes.map((node) => node.id);
  const modelOrder = new Map(nodeIds.map((id, index) => [id, index]));
  const edges = input.graph.edges
    .map((edge) => {
      const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
      return { edge, sourceId, targetId };
    })
    .filter(({ sourceId, targetId }) => sourceId !== targetId);
  const outgoing = new Map(nodeIds.map((id) => [id, [] as typeof edges]));
  const incoming = new Map(nodeIds.map((id) => [id, [] as typeof edges]));
  for (const edge of edges) {
    outgoing.get(edge.sourceId)?.push(edge);
    incoming.get(edge.targetId)?.push(edge);
  }

  const transitiveEdgeIds = new Set<string>();
  for (const candidate of edges) {
    const visited = new Set([candidate.sourceId]);
    const stack = (outgoing.get(candidate.sourceId) ?? [])
      .filter((edge) => edge.edge.id !== candidate.edge.id)
      .map((edge) => ({ nodeId: edge.targetId, depth: 1 }));
    while (stack.length > 0) {
      const entry = stack.pop();
      if (entry === undefined || visited.has(entry.nodeId)) continue;
      if (entry.nodeId === candidate.targetId && entry.depth > 1) {
        transitiveEdgeIds.add(candidate.edge.id);
        break;
      }
      visited.add(entry.nodeId);
      for (const edge of outgoing.get(entry.nodeId) ?? []) {
        stack.push({ nodeId: edge.targetId, depth: entry.depth + 1 });
      }
    }
  }

  const indegree = new Map(
    nodeIds.map((id) => [
      id,
      (incoming.get(id) ?? []).filter((edge) => !transitiveEdgeIds.has(edge.edge.id)).length,
    ]),
  );
  const predecessorTopo = new Map(nodeIds.map((id) => [id, [] as number[]]));
  const topo = new Map<string, number>();
  const sources: string[] = [];
  const compareSources = (left: string, right: string) => {
    const leftValues = predecessorTopo.get(left) ?? [];
    const rightValues = predecessorTopo.get(right) ?? [];
    let leftIndex = leftValues.length - 1;
    let rightIndex = rightValues.length - 1;
    while (leftIndex >= 0 && rightIndex >= 0) {
      const leftValue = leftValues[leftIndex--];
      const rightValue = rightValues[rightIndex--];
      if (leftValue !== rightValue) return leftValue - rightValue;
    }
    // This intentionally mirrors ELK's ListIterator.hasNext checks after
    // reverse traversal, including its non-total ordering for equal non-empty
    // predecessor lists. Java's PriorityQueue makes that behavior observable.
    const leftHasNext = leftValues.length > 0;
    const rightHasNext = rightValues.length > 0;
    if (!leftHasNext && !rightHasNext) {
      return (modelOrder.get(left) ?? 0) - (modelOrder.get(right) ?? 0);
    }
    if (!leftHasNext) return -1;
    return 1;
  };
  const addSource = (nodeId: string) => {
    let index = sources.length;
    sources.push(nodeId);
    while (index > 0) {
      const parentIndex = (index - 1) >>> 1;
      const parent = sources[parentIndex];
      if (parent === undefined || compareSources(parent, nodeId) <= 0) break;
      sources[index] = parent;
      index = parentIndex;
    }
    sources[index] = nodeId;
  };
  const takeSource = (): string | undefined => {
    const result = sources[0];
    const last = sources.pop();
    if (sources.length === 0 || last === undefined) return result;
    let index = 0;
    const half = sources.length >>> 1;
    while (index < half) {
      let childIndex = index * 2 + 1;
      let child = sources[childIndex] as string;
      const rightIndex = childIndex + 1;
      const right = sources[rightIndex];
      if (right !== undefined && compareSources(right, child) < 0) {
        childIndex = rightIndex;
        child = right;
      }
      if (compareSources(last, child) < 0) break;
      sources[index] = child;
      index = childIndex;
    }
    sources[index] = last;
    return result;
  };
  for (const id of nodeIds) {
    if (indegree.get(id) === 0) addSource(id);
  }
  let nextTopo = 0;
  while (sources.length > 0) {
    const sourceId = takeSource();
    if (sourceId === undefined) continue;
    topo.set(sourceId, nextTopo++);
    for (const edge of outgoing.get(sourceId) ?? []) {
      if (transitiveEdgeIds.has(edge.edge.id)) continue;
      const remaining = (indegree.get(edge.targetId) ?? 1) - 1;
      indegree.set(edge.targetId, remaining);
      predecessorTopo.get(edge.targetId)?.push(topo.get(sourceId) ?? 0);
      if (remaining === 0) addSource(edge.targetId);
    }
  }

  const outdegree = new Map(
    nodeIds.map((id) => [
      id,
      (outgoing.get(id) ?? []).filter((edge) => !transitiveEdgeIds.has(edge.edge.id)).length,
    ]),
  );
  const sinks = nodeIds.filter((id) => outdegree.get(id) === 0);
  const inverseLayerByNodeId = new Map<string, number>();
  const layerMembers: string[][] = [[]];
  const bound = input.settings["layering.coffmanGraham.layerBound"] ?? 2_147_483_647;
  let currentLayer = 0;
  while (sinks.length > 0) {
    sinks.sort((left, right) => (topo.get(right) ?? 0) - (topo.get(left) ?? 0));
    const nodeId = sinks.shift();
    if (nodeId === undefined) continue;
    const currentMembers = layerMembers[currentLayer] ?? [];
    const createsInLayerEdge = (outgoing.get(nodeId) ?? []).some((edge) =>
      currentMembers.includes(edge.targetId),
    );
    if (currentMembers.length >= bound || createsInLayerEdge) {
      currentLayer++;
      layerMembers[currentLayer] = [];
    }
    layerMembers[currentLayer]?.push(nodeId);
    inverseLayerByNodeId.set(nodeId, currentLayer);
    for (const edge of incoming.get(nodeId) ?? []) {
      if (transitiveEdgeIds.has(edge.edge.id)) continue;
      const remaining = (outdegree.get(edge.sourceId) ?? 1) - 1;
      outdegree.set(edge.sourceId, remaining);
      if (remaining === 0) sinks.push(edge.sourceId);
    }
  }

  return {
    layerByNodeId: new Map(
      nodeIds.map((id) => [id, currentLayer - (inverseLayerByNodeId.get(id) ?? 0)]),
    ),
  };
};

function sortLayerByAdjacentPosition(
  layer: string[],
  adjacentLayer: readonly string[],
  neighbors: ReadonlyMap<string, readonly string[]>,
  statistic: "mean" | "median",
  random?: JavaRandom,
): void {
  const adjacentIndex = new Map(adjacentLayer.map((nodeId, index) => [nodeId, index] as const));
  const originalIndex = new Map(layer.map((nodeId, index) => [nodeId, index] as const));
  const adjacentPosition = new Map<string, number>();
  for (const nodeId of layer) {
    const positions = (neighbors.get(nodeId) ?? [])
      .map((id) => adjacentIndex.get(id))
      .filter((value): value is number => value !== undefined)
      .sort((left, right) => left - right);
    if (positions.length === 0) {
      adjacentPosition.set(nodeId, originalIndex.get(nodeId) ?? 0);
    } else if (statistic === "median") {
      const middle = Math.floor(positions.length / 2);
      adjacentPosition.set(
        nodeId,
        positions.length % 2 === 0
          ? ((positions[middle - 1] ?? 0) + (positions[middle] ?? 0)) / 2
          : (positions[middle] ?? 0),
      );
    } else {
      adjacentPosition.set(
        nodeId,
        positions.reduce((sum, value) => sum + value, 0) / positions.length +
          (random ? random.nextFloat() * 0.07 - 0.035 : 0),
      );
    }
  }

  layer.sort((a, b) => {
    return (
      (adjacentPosition.get(a) ?? 0) - (adjacentPosition.get(b) ?? 0) ||
      (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0)
    );
  });
}

function minimizeCrossingsWithLayerSweep(
  statistic: "mean" | "median",
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

    const countCrossings = (candidateLayers: readonly (readonly string[])[]): number => {
      const layerIndex = new Map<string, number>();
      const position = new Map<string, number>();
      for (const [index, layer] of candidateLayers.entries()) {
        for (const [nodePosition, id] of layer.entries()) {
          layerIndex.set(id, index);
          position.set(id, nodePosition);
        }
      }
      let crossings = 0;
      for (let index = 0; index < candidateLayers.length - 1; index++) {
        const between = input.graph.edges
          .map((edge) => getOrientedEndpoints(edge, orientation))
          .filter(
            ([sourceId, targetId]) =>
              layerIndex.get(sourceId) === index && layerIndex.get(targetId) === index + 1,
          );
        for (let left = 0; left < between.length; left++) {
          const [leftSource, leftTarget] = between[left] as readonly [string, string];
          for (let right = left + 1; right < between.length; right++) {
            const [rightSource, rightTarget] = between[right] as readonly [string, string];
            if (leftSource === rightSource || leftTarget === rightTarget) continue;
            const sourceDifference =
              (position.get(leftSource) ?? 0) - (position.get(rightSource) ?? 0);
            const targetDifference =
              (position.get(leftTarget) ?? 0) - (position.get(rightTarget) ?? 0);
            if (sourceDifference * targetDifference < 0) crossings++;
          }
        }
      }
      return crossings;
    };

    const sharedRandom = new JavaRandom(input.settings.randomSeed ?? 1);
    const random = new JavaRandom(sharedRandom.nextLong());
    const thoroughness = Math.max(1, input.settings.thoroughness ?? sweeps ?? 7);
    let bestLayers = layers.map((layer) => [...layer]);
    let bestCrossings = Number.POSITIVE_INFINITY;
    let working = layers.map((layer) => [...layer]);

    for (let attempt = 0; attempt < thoroughness; attempt++) {
      let forward = random.nextBoolean();
      const firstLayerIndex = forward ? 0 : Math.max(0, working.length - 1);
      const weights = new Map(
        (working[firstLayerIndex] ?? []).map((id) => [id, random.nextDouble()]),
      );
      working[firstLayerIndex]?.sort(
        (left, right) => (weights.get(left) ?? 0) - (weights.get(right) ?? 0),
      );

      const sweep = (isForward: boolean) => {
        if (isForward) {
          for (let layer = 1; layer < working.length; layer++) {
            const current = working[layer];
            const previous = working[layer - 1];
            if (current && previous) {
              sortLayerByAdjacentPosition(
                current,
                previous,
                predecessors,
                statistic,
                statistic === "mean" ? random : undefined,
              );
            }
          }
        } else {
          for (let layer = working.length - 2; layer >= 0; layer--) {
            const current = working[layer];
            const next = working[layer + 1];
            if (current && next) {
              sortLayerByAdjacentPosition(
                current,
                next,
                successors,
                statistic,
                statistic === "mean" ? random : undefined,
              );
            }
          }
        }
      };

      sweep(forward);
      let crossings = countCrossings(working);
      while (crossings > 0) {
        forward = !forward;
        const before = working.map((layer) => [...layer]);
        sweep(forward);
        const nextCrossings = countCrossings(working);
        if (nextCrossings >= crossings) {
          working = before;
          break;
        }
        crossings = nextCrossings;
      }
      if (crossings < bestCrossings) {
        bestCrossings = crossings;
        bestLayers = working.map((layer) => [...layer]);
        if (crossings === 0) break;
      }
    }

    return { layers: bestLayers };
  };
}

export function minimizeCrossingsWithBarycenter(sweeps = 7): CrossingMinimizer {
  return minimizeCrossingsWithLayerSweep("mean", sweeps);
}

export function minimizeCrossingsWithMedian(sweeps = 7): CrossingMinimizer {
  return minimizeCrossingsWithLayerSweep("median", sweeps);
}

function layersFromAssignment(input: LayeredPhaseInput, assignment: LayerAssignment): string[][] {
  const maximumLayer = Math.max(0, ...assignment.layerByNodeId.values());
  const layers = Array.from({ length: maximumLayer + 1 }, () => [] as string[]);
  for (const node of input.graph.nodes) {
    layers[assignment.layerByNodeId.get(node.id) ?? 0]?.push(node.id);
  }
  return layers;
}

export const minimizeCrossingsWithModelOrder: CrossingMinimizer = (
  input,
  _orientation,
  assignment,
) => ({
  layers: layersFromAssignment(input, assignment),
});

export const minimizeCrossingsInteractively: CrossingMinimizer = (
  input,
  _orientation,
  assignment,
) => {
  const horizontal = input.direction === "left" || input.direction === "right";
  const modelOrder = new Map(input.graph.nodes.map((node, index) => [node.id, index]));
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const layers = layersFromAssignment(input, assignment);
  for (const layer of layers) {
    layer.sort((left, right) => {
      const leftNode = nodeById.get(left);
      const rightNode = nodeById.get(right);
      const leftPosition = horizontal ? (leftNode?.y ?? 0) : (leftNode?.x ?? 0);
      const rightPosition = horizontal ? (rightNode?.y ?? 0) : (rightNode?.x ?? 0);
      return (
        leftPosition - rightPosition || (modelOrder.get(left) ?? 0) - (modelOrder.get(right) ?? 0)
      );
    });
  }
  return { layers };
};

function sumWithSpacing(
  ids: readonly string[],
  input: LayeredPhaseInput,
  axis: "width" | "height",
): number {
  return ids.reduce(
    (total, id, index) =>
      total + (input.sizes.get(id)?.[axis] ?? 0) + (index === 0 ? 0 : input.spacing.node),
    0,
  );
}

export const placeNodesInLayers: NodePlacer = (input, order) => {
  const horizontal = input.direction === "left" || input.direction === "right";
  const layerFlowSizes = order.layers.map((layer) =>
    Math.max(
      0,
      ...layer.map((id) =>
        horizontal ? (input.sizes.get(id)?.width ?? 0) : (input.sizes.get(id)?.height ?? 0),
      ),
    ),
  );
  const layerCrossSizes = order.layers.map((layer) =>
    sumWithSpacing(layer, input, horizontal ? "height" : "width"),
  );
  let maxCrossSize = 0;
  for (const size of layerCrossSizes) maxCrossSize = Math.max(maxCrossSize, size);
  const rectByNodeId = new Map<string, EntityRect>();
  let flow = horizontal ? input.padding.left : input.padding.top;

  order.layers.forEach((layer, layerIndex) => {
    let cross =
      (horizontal ? input.padding.top : input.padding.left) +
      (maxCrossSize - (layerCrossSizes[layerIndex] ?? 0)) / 2;
    for (const id of layer) {
      const size = input.sizes.get(id) ?? { width: 0, height: 0 };
      const centeredFlow =
        flow + (layerFlowSizes[layerIndex] ?? 0) - (horizontal ? size.width : size.height);
      const rect = horizontal
        ? { x: centeredFlow, y: cross, ...size }
        : { x: cross, y: centeredFlow, ...size };
      rectByNodeId.set(id, rect);
      cross += (horizontal ? size.height : size.width) + input.spacing.node;
    }
    flow += (layerFlowSizes[layerIndex] ?? 0) + input.spacing.layer;
  });

  if (input.direction === "up" || input.direction === "left") {
    let contentEnd = 0;
    for (const rect of rectByNodeId.values()) {
      contentEnd = Math.max(contentEnd, horizontal ? rect.x + rect.width : rect.y + rect.height);
    }
    const leadingPadding = horizontal ? input.padding.left : input.padding.top;
    for (const [id, rect] of rectByNodeId) {
      rectByNodeId.set(
        id,
        horizontal
          ? { ...rect, x: contentEnd - rect.x + leadingPadding - rect.width }
          : { ...rect, y: contentEnd - rect.y + leadingPadding - rect.height },
      );
    }
  }

  return { rectByNodeId };
};

/** ELK INTERACTIVE placement for normal flat nodes, preserving cross-axis coordinates. */
export const placeNodesInteractively: NodePlacer = (input, order) => {
  const horizontal = input.direction === "left" || input.direction === "right";
  const reverse = input.direction === "up" || input.direction === "left";
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const layerFlowSizes = order.layers.map((layer) =>
    Math.max(
      0,
      ...layer.map((id) =>
        horizontal ? (input.sizes.get(id)?.width ?? 0) : (input.sizes.get(id)?.height ?? 0),
      ),
    ),
  );
  const flowByLayer: number[] = [];
  let flow = horizontal ? input.padding.left : input.padding.top;
  for (const [layerIndex, size] of layerFlowSizes.entries()) {
    flowByLayer[layerIndex] = flow;
    flow += size + input.spacing.layer;
  }
  const contentEnd = flow - input.spacing.layer;
  const leadingPadding = horizontal ? input.padding.left : input.padding.top;
  const crossPadding = horizontal ? input.padding.top : input.padding.left;
  const rectByNodeId = new Map<string, EntityRect>();

  for (const [layerIndex, layer] of order.layers.entries()) {
    let minimumCross = Number.NEGATIVE_INFINITY;
    for (const id of layer) {
      const node = nodeById.get(id);
      const size = input.sizes.get(id) ?? { width: 0, height: 0 };
      const originalCross = (horizontal ? (node?.y ?? 0) : (node?.x ?? 0)) + crossPadding;
      const cross = Math.max(
        originalCross,
        minimumCross === Number.NEGATIVE_INFINITY
          ? originalCross
          : minimumCross + input.spacing.node,
      );
      let nodeFlow =
        (flowByLayer[layerIndex] ?? leadingPadding) +
        (layerFlowSizes[layerIndex] ?? 0) -
        (horizontal ? size.width : size.height);
      if (reverse) {
        const flowSize = horizontal ? size.width : size.height;
        nodeFlow = contentEnd - nodeFlow + leadingPadding - flowSize;
      }
      rectByNodeId.set(
        id,
        horizontal ? { x: nodeFlow, y: cross, ...size } : { x: cross, y: nodeFlow, ...size },
      );
      minimumCross = cross + (horizontal ? size.height : size.width);
    }
  }

  return { rectByNodeId };
};

function getPortPoint(
  node: GraphNode,
  portName: string | undefined,
  rect: EntityRect,
  fallback: Point,
  direction: LayeredPhaseInput["direction"],
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

function simplifyRoute(points: readonly Point[]): Point[] {
  const unique = points.filter(
    (point, index) =>
      index === 0 || point.x !== points[index - 1]?.x || point.y !== points[index - 1]?.y,
  );
  return unique.filter((point, index) => {
    const previous = unique[index - 1];
    const next = unique[index + 1];
    if (!previous || !next) return true;
    return !(
      (previous.x === point.x && point.x === next.x) ||
      (previous.y === point.y && point.y === next.y)
    );
  });
}

function routeEdges(style: "ORTHOGONAL" | "POLYLINE" | "SPLINES"): EdgeRouter {
  return (input, _orientation, placement) => {
    const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
    const pointsByEdgeId = new Map<string, readonly Point[]>();
    const horizontal = input.direction === "left" || input.direction === "right";
    const reverse = input.direction === "up" || input.direction === "left";

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
      const middle =
        style === "POLYLINE"
          ? []
          : horizontal
            ? [
                { x: (start.x + end.x) / 2, y: start.y },
                { x: (start.x + end.x) / 2, y: end.y },
              ]
            : [
                { x: start.x, y: (start.y + end.y) / 2 },
                { x: end.x, y: (start.y + end.y) / 2 },
              ];
      pointsByEdgeId.set(edge.id, simplifyRoute([start, ...middle, end]));
    }

    return { pointsByEdgeId };
  };
}

export const routeEdgesOrthogonally = routeEdges("ORTHOGONAL");
export const routeEdgesWithPolylines = routeEdges("POLYLINE");
export const routeEdgesWithSplines = routeEdges("SPLINES");

export function placePorts<P>(
  ports: readonly GraphPort<P>[] | undefined,
  rect: EntityRect,
  direction: LayeredPhaseInput["direction"],
): GraphPort<P>[] | undefined {
  if (!ports) return undefined;
  const horizontal = direction === "left" || direction === "right";
  const reverse = direction === "up" || direction === "left";
  return ports.map((port, index) => {
    const size = { width: port.width ?? 8, height: port.height ?? 8 };
    if (port.x !== undefined && port.y !== undefined) {
      return { ...port, ...size };
    }
    const ratio = (index + 1) / (ports.length + 1);
    const outgoing = port.direction !== "in";
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
