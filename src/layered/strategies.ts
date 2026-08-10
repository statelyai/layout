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
  LayerOrder,
  LayeredPhaseInput,
  NodePlacement,
  NodePlacer,
} from "./types";
import { nodeNodeSpacing } from "./spacing";
import type { ElkLayeredOptionValueByName } from "./elk-options";
import { conservativeSpline } from "./spline-bezier";
import { getFlexiblePortPosition } from "./flexible-ports";

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
  const nodeById = new Map(
    input.graph.nodes
      .filter((node) => !node.id.startsWith("__layout_dummy:"))
      .map((node) => [node.id, node]),
  );
  const initial = new Set(
    input.graph.edges
      .filter((edge) => {
        if (edge.sourceId === edge.targetId) return false;
        const source = nodeById.get(edge.sourceId);
        const target = nodeById.get(edge.targetId);
        const center = input.settings.interactiveReferencePoint !== "TOP_LEFT";
        const sourceX =
          (source?.x ?? 0) + (center ? (input.sizes.get(edge.sourceId)?.width ?? 0) / 2 : 0);
        const targetX =
          (target?.x ?? 0) + (center ? (input.sizes.get(edge.targetId)?.width ?? 0) / 2 : 0);
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

/** Apply ELK's FIRST/FIRST_SEPARATE/LAST/LAST_SEPARATE layer constraints. */
export function applyLayerConstraints(
  input: LayeredPhaseInput,
  assignment: LayerAssignment,
): LayerAssignment {
  const constraintByNodeId = new Map(
    input.graph.nodes.map((node) => [
      node.id,
      input.nodeSettings?.(node)?.["layering.layerConstraint"] ?? "NONE",
    ]),
  );
  const ordinaryNodes = input.graph.nodes.filter((node) => {
    const constraint = constraintByNodeId.get(node.id);
    return constraint !== "FIRST_SEPARATE" && constraint !== "LAST_SEPARATE";
  });
  const maximumOrdinaryLayer = Math.max(
    0,
    ...ordinaryNodes.map((node) => assignment.layerByNodeId.get(node.id) ?? 0),
  );
  const hasFirstSeparate = input.graph.nodes.some(
    (node) => constraintByNodeId.get(node.id) === "FIRST_SEPARATE",
  );
  const leadingOffset = hasFirstSeparate ? 1 : 0;
  return {
    layerByNodeId: new Map(
      input.graph.nodes.map((node) => {
        const constraint = constraintByNodeId.get(node.id);
        if (constraint === "FIRST_SEPARATE") return [node.id, 0];
        if (constraint === "FIRST") return [node.id, leadingOffset];
        if (constraint === "LAST") return [node.id, leadingOffset + maximumOrdinaryLayer];
        if (constraint === "LAST_SEPARATE") {
          return [node.id, leadingOffset + maximumOrdinaryLayer + 1];
        }
        return [node.id, leadingOffset + (assignment.layerByNodeId.get(node.id) ?? 0)];
      }),
    ),
  };
}

/** Keep activated ELK partitions in ascending, contiguous layer blocks. */
export function applyPartitions(
  input: LayeredPhaseInput,
  assignment: LayerAssignment,
): LayerAssignment {
  if (input.settings["partitioning.activate"] !== true) return assignment;
  const partitionByNodeId = new Map(
    input.graph.nodes.map((node) => [
      node.id,
      Number(input.nodeSettings?.(node)?.["partitioning.partition"] ?? 0),
    ]),
  );
  const partitions = [...new Set(partitionByNodeId.values())].sort((left, right) => left - right);
  const offsetByPartition = new Map<number, number>();
  let offset = 0;
  for (const partition of partitions) {
    const layers = input.graph.nodes
      .filter((node) => partitionByNodeId.get(node.id) === partition)
      .map((node) => assignment.layerByNodeId.get(node.id) ?? 0);
    const minimum = Math.min(...layers);
    const maximum = Math.max(...layers);
    offsetByPartition.set(partition, offset - minimum);
    offset += maximum - minimum + 1;
  }
  return {
    layerByNodeId: new Map(
      input.graph.nodes.map((node) => {
        const partition = partitionByNodeId.get(node.id) ?? 0;
        return [
          node.id,
          (assignment.layerByNodeId.get(node.id) ?? 0) + (offsetByPartition.get(partition) ?? 0),
        ];
      }),
    ),
  };
}

/** Orient inter-partition edges from lower to higher partitions. */
export function applyPartitionOrientation(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
): AcyclicOrientation {
  if (input.settings["partitioning.activate"] !== true) return orientation;
  const partitionByNodeId = new Map(
    input.graph.nodes.map((node) => [
      node.id,
      Number(input.nodeSettings?.(node)?.["partitioning.partition"] ?? 0),
    ]),
  );
  const reversedEdgeIds = new Set(orientation.reversedEdgeIds);
  for (const edge of input.graph.edges) {
    const sourcePartition = partitionByNodeId.get(edge.sourceId) ?? 0;
    const targetPartition = partitionByNodeId.get(edge.targetId) ?? 0;
    if (sourcePartition > targetPartition) reversedEdgeIds.add(edge.id);
    else if (sourcePartition < targetPartition) reversedEdgeIds.delete(edge.id);
  }
  return { reversedEdgeIds };
}

/** Restore FIRST/LAST nodes at the end of their constrained layer, as ELK does. */
export function applyLayerConstraintOrder(input: LayeredPhaseInput, order: LayerOrder): LayerOrder {
  const constrained = new Set(
    input.graph.nodes
      .filter((node) => {
        const value = input.nodeSettings?.(node)?.["layering.layerConstraint"];
        return value === "FIRST" || value === "LAST";
      })
      .map((node) => node.id),
  );
  return {
    layers: order.layers.map((layer) => [
      ...layer.filter((id) => !constrained.has(id)),
      ...layer.filter((id) => constrained.has(id)),
    ]),
  };
}

/** ELK's alternating layer-unzipping postprocessor. */
export function applyLayerUnzipping(input: LayeredPhaseInput, order: LayerOrder): LayerOrder {
  if ((input.settings["layerUnzipping.strategy"] ?? "NONE") !== "ALTERNATING") return order;
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const layers: string[][] = [];
  for (const layer of order.layers) {
    const originalNodes = layer.flatMap((id) => {
      const node = nodeById.get(id);
      return node && !node.id.startsWith("__layout_dummy:") ? [node] : [];
    });
    const configuredSplits = originalNodes.flatMap((node) => {
      const value = input.nodeSettings?.(node)?.["layerUnzipping.layerSplit"];
      return value === undefined ? [] : [Math.max(1, Number(value))];
    });
    const split = configuredSplits.length > 0 ? Math.min(...configuredSplits) : 2;
    if (layer.length <= split) {
      layers.push([...layer]);
      continue;
    }
    const minimizeEdgeLength = originalNodes.some(
      (node) => input.nodeSettings?.(node)?.["layerUnzipping.minimizeEdgeLength"] === true,
    );
    if (minimizeEdgeLength && split === 2) {
      const maximumWidth = Math.max(0, ...layer.map((id) => input.sizes.get(id)?.width ?? 0));
      const averageHeight =
        layer.reduce((sum, id) => sum + (input.sizes.get(id)?.height ?? 0), 0) / layer.length;
      const estimatedWidth =
        maximumWidth +
        Math.max(
          2 * Number(input.settings["spacing.edgeNodeBetweenLayers"] ?? 10),
          layer.length * Number(input.settings["spacing.edgeEdgeBetweenLayers"] ?? 10),
          input.spacing.layer,
        );
      const estimatedHeight =
        averageHeight +
        Math.max(input.spacing.node, Number(input.settings["spacing.edgeNode"] ?? 10));
      if (estimatedWidth / estimatedHeight >= layer.length / 4) {
        layers.push([...layer]);
        continue;
      }
    }
    const resetOnLongEdges = originalNodes.every(
      (node) => input.nodeSettings?.(node)?.["layerUnzipping.resetOnLongEdges"] !== false,
    );
    let layerSequence = [...layer];
    const ordinaryIds = layerSequence.filter((id) => !id.startsWith("__layout_dummy:"));
    const outgoingTargets = ordinaryIds.map((id) =>
      input.graph.edges.filter((edge) => edge.sourceId === id).map((edge) => edge.targetId),
    );
    if (
      ordinaryIds.length === layerSequence.length &&
      outgoingTargets.every(
        (targets) => targets.length === 1 && targets[0] === outgoingTargets[0]?.[0],
      )
    ) {
      const modelOrder = input.graph.nodes
        .map((node) => node.id)
        .filter((id) => ordinaryIds.includes(id));
      layerSequence = [modelOrder.at(-1)!, ...modelOrder.slice(0, -1)];
    }
    const sublayers = Array.from({ length: split }, () => [] as string[]);
    let targetLayer = 0;
    for (const id of layerSequence) {
      sublayers[targetLayer]!.push(id);
      if (resetOnLongEdges && id.startsWith("__layout_dummy:")) targetLayer = 0;
      else targetLayer = (targetLayer + 1) % split;
    }
    layers.push(...sublayers);
  }
  return { layers };
}

/** ELK's adjacent-node greedy-switch crossing minimization postprocessor. */
export function applyGreedySwitch(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  order: LayerOrder,
): LayerOrder {
  if (input.settings["crossingMinimization.strategy"] === "INTERACTIVE") return order;
  if (input.settings["crossingMinimization.semiInteractive"] === true) return order;
  const type = input.settings["crossingMinimization.greedySwitch.type"] ?? "TWO_SIDED";
  const threshold = input.settings["crossingMinimization.greedySwitch.activationThreshold"] ?? 40;
  if (type === "OFF" || (threshold !== 0 && threshold <= input.graph.nodes.length)) {
    return order;
  }
  const layers = order.layers.map((layer) => [...layer]);
  const layerByNodeId = new Map<string, number>();
  for (const [layerIndex, layer] of layers.entries()) {
    for (const id of layer) layerByNodeId.set(id, layerIndex);
  }
  const between = Array.from({ length: Math.max(0, layers.length - 1) }, () => [] as string[][]);
  for (const edge of input.graph.edges) {
    const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
    const sourceLayer = layerByNodeId.get(sourceId);
    const targetLayer = layerByNodeId.get(targetId);
    if (sourceLayer === undefined || targetLayer !== sourceLayer + 1) continue;
    between[sourceLayer]?.push([sourceId, targetId]);
  }
  const countBoundary = (boundary: number): number => {
    const edges = between[boundary] ?? [];
    const sourcePositions = new Map(
      (layers[boundary] ?? []).map((id, index) => [id, index] as const),
    );
    const targetPositions = new Map(
      (layers[boundary + 1] ?? []).map((id, index) => [id, index] as const),
    );
    let crossings = 0;
    for (let left = 0; left < edges.length; left++) {
      const leftEdge = edges[left]!;
      for (let right = left + 1; right < edges.length; right++) {
        const rightEdge = edges[right]!;
        if (leftEdge[0] === rightEdge[0] || leftEdge[1] === rightEdge[1]) continue;
        const sourceDifference =
          (sourcePositions.get(leftEdge[0]!) ?? 0) - (sourcePositions.get(rightEdge[0]!) ?? 0);
        const targetDifference =
          (targetPositions.get(leftEdge[1]!) ?? 0) - (targetPositions.get(rightEdge[1]!) ?? 0);
        if (sourceDifference * targetDifference < 0) crossings++;
      }
    }
    return crossings;
  };
  const countForLayer = (layerIndex: number, oneSidedBoundary?: number) => {
    if (oneSidedBoundary !== undefined) return countBoundary(oneSidedBoundary);
    return (
      (layerIndex > 0 ? countBoundary(layerIndex - 1) : 0) +
      (layerIndex + 1 < layers.length ? countBoundary(layerIndex) : 0)
    );
  };
  const sweep = (forward: boolean): boolean => {
    let changed = false;
    const indices = forward
      ? Array.from({ length: layers.length }, (_, index) => index)
      : Array.from({ length: layers.length }, (_, index) => layers.length - index - 1);
    for (const layerIndex of indices) {
      const layer = layers[layerIndex]!;
      let improved: boolean;
      do {
        improved = false;
        for (let index = 0; index + 1 < layer.length; index++) {
          const oneSidedBoundary =
            type === "ONE_SIDED" ? (forward ? layerIndex - 1 : layerIndex) : undefined;
          if (
            oneSidedBoundary !== undefined &&
            (oneSidedBoundary < 0 || oneSidedBoundary >= layers.length - 1)
          ) {
            continue;
          }
          const before = countForLayer(layerIndex, oneSidedBoundary);
          [layer[index], layer[index + 1]] = [layer[index + 1]!, layer[index]!];
          const after = countForLayer(layerIndex, oneSidedBoundary);
          if (after < before) {
            improved = true;
            changed = true;
          } else {
            [layer[index], layer[index + 1]] = [layer[index + 1]!, layer[index]!];
          }
        }
      } while (improved);
    }
    return changed;
  };
  while (sweep(true) || sweep(false)) {
    // Repeat until every adjacent exchange is locally optimal.
  }
  return { layers };
}

/** Preserve authored in-layer order while leaving long-edge dummy slots available. */
export function applySemiInteractiveOrder(input: LayeredPhaseInput, order: LayerOrder): LayerOrder {
  if (input.settings["crossingMinimization.semiInteractive"] !== true) return order;
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const horizontal = input.direction === "left" || input.direction === "right";
  return {
    layers: order.layers.map((layer) => {
      const sortedRegularNodes = layer
        .flatMap((id) => (nodeById.has(id) ? [id] : []))
        .sort((left, right) => {
          const leftNode = nodeById.get(left)!;
          const rightNode = nodeById.get(right)!;
          return horizontal
            ? (leftNode.y ?? 0) - (rightNode.y ?? 0)
            : (leftNode.x ?? 0) - (rightNode.x ?? 0);
        });
      let regularIndex = 0;
      return layer.map((id) =>
        nodeById.has(id) ? (sortedRegularNodes[regularIndex++] ?? id) : id,
      );
    }),
  };
}

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
  const center = input.settings.interactiveReferencePoint !== "TOP_LEFT";
  for (const layer of layers) {
    layer.sort((left, right) => {
      const leftNode = nodeById.get(left);
      const rightNode = nodeById.get(right);
      const leftPosition =
        (horizontal ? (leftNode?.y ?? 0) : (leftNode?.x ?? 0)) +
        (center
          ? (horizontal
              ? (input.sizes.get(left)?.height ?? 0)
              : (input.sizes.get(left)?.width ?? 0)) / 2
          : 0);
      const rightPosition =
        (horizontal ? (rightNode?.y ?? 0) : (rightNode?.x ?? 0)) +
        (center
          ? (horizontal
              ? (input.sizes.get(right)?.height ?? 0)
              : (input.sizes.get(right)?.width ?? 0)) / 2
          : 0);
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
  return ids.reduce((total, id, index) => {
    const previous = ids[index - 1];
    return (
      total +
      (input.sizes.get(id)?.[axis] ?? 0) +
      (previous === undefined ? 0 : nodeNodeSpacing(input, previous, id))
    );
  }, 0);
}

function nodeFlowOffset(
  input: LayeredPhaseInput,
  id: string,
  layerFlowSize: number,
  nodeFlowSize: number,
): number {
  const node = input.graph.nodes.find((candidate) => candidate.id === id);
  const alignment = node
    ? (input.nodeSettings?.(node)?.alignment ?? input.settings.alignment)
    : input.settings.alignment;
  let ratio: number;
  if (alignment === "LEFT" || alignment === "TOP") ratio = 0;
  else if (alignment === "RIGHT" || alignment === "BOTTOM") ratio = 1;
  else if (alignment === "CENTER") ratio = 0.5;
  else {
    let incoming = 0;
    let outgoing = 0;
    for (const edge of input.graph.edges) {
      if (edge.sourceId === id) outgoing++;
      if (edge.targetId === id) incoming++;
    }
    ratio = incoming + outgoing === 0 ? 0.5 : outgoing / (incoming + outgoing);
  }
  return (layerFlowSize - nodeFlowSize) * ratio;
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
    for (const [nodeIndex, id] of layer.entries()) {
      const size = input.sizes.get(id) ?? { width: 0, height: 0 };
      const centeredFlow =
        flow +
        nodeFlowOffset(
          input,
          id,
          layerFlowSizes[layerIndex] ?? 0,
          horizontal ? size.width : size.height,
        );
      const rect = horizontal
        ? { x: centeredFlow, y: cross, ...size }
        : { x: cross, y: centeredFlow, ...size };
      rectByNodeId.set(id, rect);
      const next = layer[nodeIndex + 1];
      cross +=
        (horizontal ? size.height : size.width) +
        (next === undefined ? 0 : nodeNodeSpacing(input, id, next));
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
          : minimumCross + nodeNodeSpacing(input, layer[Math.max(0, layer.indexOf(id) - 1)]!, id),
      );
      let nodeFlow =
        (flowByLayer[layerIndex] ?? leadingPadding) +
        nodeFlowOffset(
          input,
          id,
          layerFlowSizes[layerIndex] ?? 0,
          horizontal ? size.width : size.height,
        );
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
  input: LayeredPhaseInput,
): Point {
  if (portName === undefined) return fallback;
  const port = placePorts(
    node.ports,
    rect,
    direction,
    (candidate) => input.portSettings?.(candidate, node),
    { ...input.settings, ...input.nodeSettings?.(node) },
  )?.find((candidate) => candidate.name === portName);
  if (port?.x === undefined || port.y === undefined) return fallback;
  const settings = input.portSettings?.(port, node);
  const configuredAnchor = settings?.["port.anchor"] as { x?: number; y?: number } | undefined;
  const width = port.width ?? 0;
  const height = port.height ?? 0;
  const defaultAnchorX = port.x >= rect.width ? 0 : port.x + width <= 0 ? width : width / 2;
  const defaultAnchorY = port.y >= rect.height ? 0 : port.y + height <= 0 ? height : height / 2;
  return {
    x: rect.x + port.x + (configuredAnchor?.x ?? defaultAnchorX),
    y: rect.y + port.y + (configuredAnchor?.y ?? defaultAnchorY),
  };
}

function simplifyRoute(points: readonly Point[]): Point[] {
  const equal = (left: number, right: number) => Math.abs(left - right) < 1e-9;
  const unique = points.filter(
    (point, index) =>
      index === 0 ||
      !equal(point.x, points[index - 1]?.x ?? Number.NaN) ||
      !equal(point.y, points[index - 1]?.y ?? Number.NaN),
  );
  return unique.filter((point, index) => {
    const previous = unique[index - 1];
    const next = unique[index + 1];
    if (!previous || !next) return true;
    return !(
      (equal(previous.x, point.x) && equal(point.x, next.x)) ||
      (equal(previous.y, point.y) && equal(point.y, next.y))
    );
  });
}

function implicitEdgeEndpoints(
  input: LayeredPhaseInput,
  placement: NodePlacement,
): ReadonlyMap<string, { source: Point; target: Point }> {
  const horizontal = input.direction === "left" || input.direction === "right";
  const groups = new Map<string, Array<{ edge: GraphEdge; endpoint: "source" | "target" }>>();
  for (const edge of input.graph.edges) {
    const sourceRect = placement.rectByNodeId.get(edge.sourceId);
    const targetRect = placement.rectByNodeId.get(edge.targetId);
    if (!sourceRect || !targetRect) continue;
    const sourceFlow = horizontal ? sourceRect.x : sourceRect.y;
    const targetFlow = horizontal ? targetRect.x : targetRect.y;
    const forward = sourceFlow <= targetFlow;
    const sourceSide = forward ? "after" : "before";
    const targetSide = forward ? "before" : "after";
    const sourceKey = `${edge.sourceId}:${sourceSide}`;
    const targetKey = `${edge.targetId}:${targetSide}`;
    const sourceGroup = groups.get(sourceKey) ?? [];
    sourceGroup.push({ edge, endpoint: "source" });
    groups.set(sourceKey, sourceGroup);
    const targetGroup = groups.get(targetKey) ?? [];
    targetGroup.push({ edge, endpoint: "target" });
    groups.set(targetKey, targetGroup);
  }

  const result = new Map<string, { source: Point; target: Point }>();
  for (const [key, entries] of groups) {
    const split = key.lastIndexOf(":");
    const nodeId = key.slice(0, split);
    const side = key.slice(split + 1);
    const rect = placement.rectByNodeId.get(nodeId);
    if (!rect) continue;
    const mergeEdges = input.settings.mergeEdges === true;
    const hypernode = input.nodeSettings?.(
      input.graph.nodes.find((node) => node.id === nodeId)!,
    )?.hypernode;
    entries.sort((left, right) => {
      const leftOther = left.endpoint === "source" ? left.edge.targetId : left.edge.sourceId;
      const rightOther = right.endpoint === "source" ? right.edge.targetId : right.edge.sourceId;
      const leftRect = placement.rectByNodeId.get(leftOther);
      const rightRect = placement.rectByNodeId.get(rightOther);
      const leftCross = horizontal ? (leftRect?.y ?? 0) : (leftRect?.x ?? 0);
      const rightCross = horizontal ? (rightRect?.y ?? 0) : (rightRect?.x ?? 0);
      return leftCross - rightCross;
    });
    entries.forEach(({ edge, endpoint }, index) => {
      const reversedCrossOrder = side === "before";
      const ordinal = reversedCrossOrder ? entries.length - index : index + 1;
      const ratio = mergeEdges || hypernode === true ? 0.5 : ordinal / (entries.length + 1);
      const point = horizontal
        ? {
            x: side === "after" ? rect.x + rect.width : rect.x,
            y: rect.y + ratio * rect.height,
          }
        : {
            x: rect.x + ratio * rect.width,
            y: side === "after" ? rect.y + rect.height : rect.y,
          };
      const pair = result.get(edge.id) ?? { source: point, target: point };
      pair[endpoint] = point;
      result.set(edge.id, pair);
    });
  }
  return result;
}

function routeEdges(style: "ORTHOGONAL" | "POLYLINE" | "SPLINES"): EdgeRouter {
  return (input, _orientation, placement) => {
    const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
    const pointsByEdgeId = new Map<string, readonly Point[]>();
    const horizontal = input.direction === "left" || input.direction === "right";
    const reverse = input.direction === "up" || input.direction === "left";
    const mutableRects = placement.rectByNodeId as Map<string, EntityRect>;
    const selfLoopsByNodeId = new Map<string, GraphEdge[]>();
    for (const edge of input.graph.edges) {
      if (edge.sourceId !== edge.targetId) continue;
      const loops = selfLoopsByNodeId.get(edge.sourceId) ?? [];
      loops.push(edge);
      selfLoopsByNodeId.set(edge.sourceId, loops);
    }
    for (const [id, loops] of selfLoopsByNodeId) {
      const rect = mutableRects.get(id);
      if (!rect) continue;
      const spacing = Number(input.settings["spacing.nodeSelfLoop"] ?? 10);
      const node = nodeById.get(id);
      const nodeSettings = node ? input.nodeSettings?.(node) : undefined;
      const distribution = nodeSettings?.["edgeRouting.selfLoopDistribution"] ?? "NORTH";
      const ordering = nodeSettings?.["edgeRouting.selfLoopOrdering"] ?? "STACKED";
      const splineOffset = style === "SPLINES" ? 1 : 0;
      if (distribution === "EQUALLY") {
        mutableRects.set(id, {
          ...rect,
          x: rect.x + spacing,
          y: rect.y + spacing + splineOffset,
        });
      } else {
        const sideLoopCount =
          distribution === "NORTH_SOUTH" ? Math.ceil(loops.length / 2) : loops.length;
        const reserve =
          (ordering === "SEQUENCED" ? Math.min(1, sideLoopCount) : sideLoopCount) * spacing +
          splineOffset;
        mutableRects.set(id, { ...rect, y: rect.y + reserve });
      }
    }
    const edgeLabelSideSelection = input.settings["edgeLabels.sideSelection"] ?? "SMART_DOWN";
    const placeEdgeLabelsUp =
      edgeLabelSideSelection === "ALWAYS_UP" ||
      edgeLabelSideSelection === "SMART_UP" ||
      edgeLabelSideSelection === "DIRECTION_UP";
    if (placeEdgeLabelsUp) {
      let crossShift = 0;
      for (const edge of input.graph.edges) {
        const settings = input.edgeSettings?.(edge);
        if (
          (edge.height ?? 0) <= 0 ||
          (settings?.["edgeLabels.placement"] ?? "CENTER") !== "CENTER" ||
          settings?.["edgeLabels.inline"] === true
        ) {
          continue;
        }
        const thickness = Number(settings?.["edge.thickness"] ?? 1);
        crossShift = Math.max(
          crossShift,
          Number(input.settings["spacing.edgeLabel"] ?? 2) + Math.round(thickness / 2),
        );
      }
      if (crossShift > 0) {
        for (const [id, rect] of mutableRects) {
          mutableRects.set(
            id,
            horizontal ? { ...rect, y: rect.y + crossShift } : { ...rect, x: rect.x + crossShift },
          );
        }
      }
    }
    let implicitEndpoints = implicitEdgeEndpoints(input, placement);
    const flowIntervals = [...placement.rectByNodeId.entries()]
      .map(([id, rect]) => ({
        id,
        start: horizontal ? rect.x : rect.y,
        end: horizontal ? rect.x + rect.width : rect.y + rect.height,
      }))
      .sort((left, right) => left.start - right.start || left.end - right.end);
    const flowLayerByNodeId = new Map<string, number>();
    const flowLayers: Array<{ start: number; end: number }> = [];
    for (const interval of flowIntervals) {
      const current = flowLayers.at(-1);
      if (!current || interval.start > current.end) {
        flowLayers.push({ start: interval.start, end: interval.end });
      } else {
        current.start = Math.min(current.start, interval.start);
        current.end = Math.max(current.end, interval.end);
      }
      flowLayerByNodeId.set(interval.id, flowLayers.length - 1);
    }

    const labelExtraByGap = flowLayers.slice(0, -1).map(() => 0);
    for (const edge of input.graph.edges) {
      if ((edge.width ?? 0) <= 0) continue;
      const sourceLayer = flowLayerByNodeId.get(edge.sourceId);
      const targetLayer = flowLayerByNodeId.get(edge.targetId);
      if (sourceLayer === undefined || targetLayer === undefined) continue;
      if (Math.abs(sourceLayer - targetLayer) !== 1) continue;
      const placement = input.edgeSettings?.(edge)?.["edgeLabels.placement"] ?? "CENTER";
      const extra =
        placement === "CENTER"
          ? (edge.width ?? 0) + input.spacing.layer
          : (edge.width ?? 0) + Number(input.settings["spacing.edgeLabel"] ?? 2);
      const gap = Math.min(sourceLayer, targetLayer);
      labelExtraByGap[gap] = Math.max(labelExtraByGap[gap] ?? 0, extra);
    }
    let labelShift = 0;
    for (const [layerNo, bounds] of flowLayers.entries()) {
      if (labelShift !== 0) {
        for (const [id, rect] of placement.rectByNodeId) {
          if (flowLayerByNodeId.get(id) !== layerNo) continue;
          mutableRects.set(
            id,
            horizontal ? { ...rect, x: rect.x + labelShift } : { ...rect, y: rect.y + labelShift },
          );
        }
        bounds.start += labelShift;
        bounds.end += labelShift;
      }
      labelShift += labelExtraByGap[layerNo] ?? 0;
    }
    if (labelShift !== 0) implicitEndpoints = implicitEdgeEndpoints(input, placement);

    if (style === "POLYLINE" || style === "SPLINES") {
      const edgeSpacing = Number(input.settings["spacing.edgeEdgeBetweenLayers"] ?? 10);
      const nodeSpacing = input.spacing.layer;
      const edgeSpaceFactor = Math.min(1, edgeSpacing / nodeSpacing);
      const extraByGap = flowLayers.slice(0, -1).map(() => 0);
      const nonStraightByGap = flowLayers.slice(0, -1).map(() => 0);
      for (const edge of input.graph.edges) {
        const sourceLayer = flowLayerByNodeId.get(edge.sourceId);
        const targetLayer = flowLayerByNodeId.get(edge.targetId);
        const endpoints = implicitEndpoints.get(edge.id);
        if (sourceLayer === undefined || targetLayer === undefined || !endpoints) continue;
        if (Math.abs(sourceLayer - targetLayer) !== 1) continue;
        const gap = Math.min(sourceLayer, targetLayer);
        const crossDifference = Math.abs(
          horizontal
            ? endpoints.target.y - endpoints.source.y
            : endpoints.target.x - endpoints.source.x,
        );
        if (style === "POLYLINE") {
          extraByGap[gap] = Math.max(extraByGap[gap] ?? 0, 0.4 * edgeSpaceFactor * crossDifference);
        } else if (crossDifference >= 0.2) {
          nonStraightByGap[gap] = (nonStraightByGap[gap] ?? 0) + 1;
          if ((input.settings["edgeRouting.splines.mode"] ?? "SLOPPY") === "SLOPPY") {
            const sloppyFactor = Number(
              input.settings["edgeRouting.splines.sloppy.layerSpacingFactor"] ?? 0.2,
            );
            extraByGap[gap] = Math.max(
              extraByGap[gap] ?? 0,
              sloppyFactor * edgeSpaceFactor * crossDifference,
            );
          }
        }
      }
      let nextStart = flowLayers[0]?.start ?? 0;
      for (const [layerNo, bounds] of flowLayers.entries()) {
        const shift = nextStart - bounds.start;
        for (const [id, rect] of placement.rectByNodeId) {
          if (flowLayerByNodeId.get(id) !== layerNo) continue;
          mutableRects.set(
            id,
            horizontal ? { ...rect, x: rect.x + shift } : { ...rect, y: rect.y + shift },
          );
        }
        const size = bounds.end - bounds.start;
        bounds.start = nextStart;
        bounds.end = nextStart + size;
        const splineSlots = nonStraightByGap[layerNo] ?? 0;
        const splineSpacing =
          splineSlots === 0
            ? nodeSpacing
            : Math.max(
                nodeSpacing,
                Number(input.settings["spacing.edgeNodeBetweenLayers"] ?? 10) * 2 +
                  (splineSlots - 1) * edgeSpacing,
                extraByGap[layerNo] ?? 0,
              );
        nextStart =
          bounds.end +
          (style === "POLYLINE" ? nodeSpacing + (extraByGap[layerNo] ?? 0) : splineSpacing);
      }
      implicitEndpoints = implicitEdgeEndpoints(input, placement);
    }

    const conservativeSplineTrackByEdgeId = new Map<string, number>();
    if (
      style === "SPLINES" &&
      (input.settings["edgeRouting.splines.mode"] ?? "SLOPPY") !== "SLOPPY"
    ) {
      const edgeNodeSpacing = Number(input.settings["spacing.edgeNodeBetweenLayers"] ?? 10);
      const edgeEdgeSpacing = Number(input.settings["spacing.edgeEdgeBetweenLayers"] ?? 10);
      for (let gap = 0; gap + 1 < flowLayers.length; gap++) {
        const candidates = input.graph.edges
          .flatMap((edge) => {
            const sourceLayer = flowLayerByNodeId.get(edge.sourceId);
            const targetLayer = flowLayerByNodeId.get(edge.targetId);
            const endpoints = implicitEndpoints.get(edge.id);
            if (
              endpoints === undefined ||
              sourceLayer === undefined ||
              targetLayer === undefined ||
              Math.min(sourceLayer, targetLayer) !== gap ||
              Math.abs(sourceLayer - targetLayer) !== 1
            ) {
              return [];
            }
            const sourceCross = horizontal ? endpoints.source.y : endpoints.source.x;
            const targetCross = horizontal ? endpoints.target.y : endpoints.target.x;
            return Math.abs(sourceCross - targetCross) < 1e-6 ? [] : [{ edge, targetCross }];
          })
          .sort((left, right) => left.targetCross - right.targetCross);
        for (const [rank, candidate] of candidates.entries()) {
          conservativeSplineTrackByEdgeId.set(
            candidate.edge.id,
            (flowLayers[gap]?.end ?? 0) + edgeNodeSpacing + rank * edgeEdgeSpacing,
          );
        }
      }
    }

    const unzippingSink =
      (input.settings["layerUnzipping.strategy"] ?? "NONE") === "ALTERNATING" &&
      input.direction === "right"
        ? input.graph.nodes.find(
            (node) =>
              input.graph.edges.filter((edge) => edge.targetId === node.id).length ===
              input.graph.nodes.length - 1,
          )
        : undefined;
    const unzippingSources = unzippingSink
      ? input.graph.nodes
          .filter((node) => node.id !== unzippingSink.id)
          .sort(
            (left, right) =>
              (placement.rectByNodeId.get(left.id)?.y ?? 0) -
              (placement.rectByNodeId.get(right.id)?.y ?? 0),
          )
      : [];
    const unzippingSourceLevels = new Set(
      unzippingSources.map((node) => placement.rectByNodeId.get(node.id)?.x ?? 0),
    ).size;
    for (const edge of input.graph.edges) {
      const source = nodeById.get(edge.sourceId);
      const target = nodeById.get(edge.targetId);
      const sourceRect = placement.rectByNodeId.get(edge.sourceId);
      const targetRect = placement.rectByNodeId.get(edge.targetId);
      if (!source || !target || !sourceRect || !targetRect) continue;

      if (unzippingSink && edge.targetId === unzippingSink.id) {
        const rank = unzippingSources.findIndex((node) => node.id === edge.sourceId);
        const start = {
          x: sourceRect.x + sourceRect.width,
          y: sourceRect.y + sourceRect.height / 2,
        };
        const end = {
          x: targetRect.x,
          y: targetRect.y + (targetRect.height * (rank + 1)) / (unzippingSources.length + 1),
        };
        if (Math.abs(start.y - end.y) < 1e-9) {
          pointsByEdgeId.set(edge.id, [start, end]);
        } else {
          let trackOffset = input.spacing.layer;
          if (sourceRect.x <= input.padding.left + 1e-9) {
            const edgeNodeSpacing = Number(input.settings["spacing.edgeNodeBetweenLayers"] ?? 10);
            const edgeEdgeSpacing = Number(input.settings["spacing.edgeEdgeBetweenLayers"] ?? 10);
            const earliestBentSources = unzippingSources.filter((candidate, candidateRank) => {
              const rect = placement.rectByNodeId.get(candidate.id);
              const candidateEndY =
                targetRect.y +
                (targetRect.height * (candidateRank + 1)) / (unzippingSources.length + 1);
              return (
                rect !== undefined &&
                rect.x <= input.padding.left + 1e-9 &&
                Math.abs(rect.y + rect.height / 2 - candidateEndY) >= 1e-9
              );
            });
            const earliestRank = earliestBentSources.findIndex(
              (candidate) => candidate.id === edge.sourceId,
            );
            if (unzippingSourceLevels === 1) {
              const sourceRank = unzippingSources.findIndex(
                (candidate) => candidate.id === edge.sourceId,
              );
              trackOffset =
                edgeNodeSpacing +
                Math.min(sourceRank, unzippingSources.length - sourceRank - 1) * edgeEdgeSpacing;
            } else {
              trackOffset =
                edgeNodeSpacing +
                (unzippingSourceLevels >= 3 ? Math.max(0, earliestRank) * edgeEdgeSpacing : 0);
            }
          } else {
            const edgeEdgeSpacing = Number(input.settings["spacing.edgeEdgeBetweenLayers"] ?? 10);
            const sameLayerBentSources = unzippingSources.filter((candidate, candidateRank) => {
              const rect = placement.rectByNodeId.get(candidate.id);
              const candidateEndY =
                targetRect.y +
                (targetRect.height * (candidateRank + 1)) / (unzippingSources.length + 1);
              return (
                rect !== undefined &&
                Math.abs(rect.x - sourceRect.x) < 1e-9 &&
                Math.abs(rect.y + rect.height / 2 - candidateEndY) >= 1e-9
              );
            });
            const sameLayerRank = sameLayerBentSources.findIndex(
              (candidate) => candidate.id === edge.sourceId,
            );
            trackOffset =
              input.spacing.layer -
              (unzippingSourceLevels >= 3 ? Math.max(0, sameLayerRank) * edgeEdgeSpacing : 0);
          }
          const track = targetRect.x - trackOffset;
          pointsByEdgeId.set(edge.id, [
            start,
            { x: track, y: start.y },
            { x: track, y: end.y },
            end,
          ]);
        }
        continue;
      }

      if (source.id === target.id) {
        const loops = selfLoopsByNodeId.get(source.id) ?? [edge];
        const loopIndex = loops.indexOf(edge);
        const spacing = Number(input.settings["spacing.nodeSelfLoop"] ?? 10);
        const nodeSettings = input.nodeSettings?.(source);
        const distribution = nodeSettings?.["edgeRouting.selfLoopDistribution"] ?? "NORTH";
        const ordering = nodeSettings?.["edgeRouting.selfLoopOrdering"] ?? "STACKED";
        if (style === "ORTHOGONAL") {
          const routeHorizontalSide = (
            side: "NORTH" | "SOUTH",
            indexOnSide: number,
            countOnSide: number,
          ): readonly Point[] => {
            const denominator = countOnSide * 2 + 1;
            const sequenced = ordering === "SEQUENCED";
            const nestingIndex =
              ordering === "REVERSE_STACKED" ? countOnSide - indexOnSide - 1 : indexOnSide;
            const trackIndex = sequenced ? 1 : nestingIndex + 1;
            let startRatio: number;
            let endRatio: number;
            if (sequenced) {
              if (side === "NORTH") {
                startRatio = (2 * indexOnSide + 2) / denominator;
                endRatio = (2 * indexOnSide + 1) / denominator;
              } else {
                startRatio = (denominator - 2 * indexOnSide - 2) / denominator;
                endRatio = (denominator - 2 * indexOnSide - 1) / denominator;
              }
            } else if (side === "NORTH") {
              startRatio = (countOnSide - nestingIndex) / denominator;
              endRatio = (countOnSide + nestingIndex + 1) / denominator;
            } else {
              startRatio = (countOnSide + nestingIndex + 1) / denominator;
              endRatio = (countOnSide - nestingIndex) / denominator;
            }
            const y =
              side === "NORTH"
                ? sourceRect.y - spacing * trackIndex
                : sourceRect.y + sourceRect.height + spacing * trackIndex;
            const start = {
              x: sourceRect.x + sourceRect.width * startRatio,
              y: side === "NORTH" ? sourceRect.y : sourceRect.y + sourceRect.height,
            };
            const end = {
              x: sourceRect.x + sourceRect.width * endRatio,
              y: start.y,
            };
            return [start, { x: start.x, y }, { x: end.x, y }, end];
          };
          const routeVerticalSide = (
            side: "EAST" | "WEST",
            indexOnSide: number,
            countOnSide: number,
          ): readonly Point[] => {
            const denominator = countOnSide * 2 + 1;
            const sequenced = ordering === "SEQUENCED";
            const firstRatio = sequenced ? 2 / denominator : 1 / denominator;
            const secondRatio = sequenced ? 1 / denominator : 2 / denominator;
            const startRatio = side === "EAST" ? firstRatio : secondRatio;
            const endRatio = side === "EAST" ? secondRatio : firstRatio;
            const x =
              side === "EAST"
                ? sourceRect.x + sourceRect.width + spacing * (indexOnSide + 1)
                : sourceRect.x - spacing * (indexOnSide + 1);
            const start = {
              x: side === "EAST" ? sourceRect.x + sourceRect.width : sourceRect.x,
              y: sourceRect.y + sourceRect.height * startRatio,
            };
            const end = { x: start.x, y: sourceRect.y + sourceRect.height * endRatio };
            return [start, { x, y: start.y }, { x, y: end.y }, end];
          };
          if (distribution === "NORTH_SOUTH") {
            const side = loopIndex % 2 === 0 ? "NORTH" : "SOUTH";
            const indexOnSide = Math.floor(loopIndex / 2);
            const countOnSide = Math.ceil((loops.length - (side === "SOUTH" ? 1 : 0)) / 2);
            pointsByEdgeId.set(edge.id, routeHorizontalSide(side, indexOnSide, countOnSide));
          } else if (distribution === "EQUALLY") {
            const sides = ["NORTH", "SOUTH", "EAST", "WEST"] as const;
            const side = sides[loopIndex % sides.length]!;
            const indexOnSide = Math.floor(loopIndex / sides.length);
            const countOnSide = Math.ceil((loops.length - sides.indexOf(side)) / sides.length);
            pointsByEdgeId.set(
              edge.id,
              side === "NORTH" || side === "SOUTH"
                ? routeHorizontalSide(side, indexOnSide, countOnSide)
                : routeVerticalSide(side, indexOnSide, countOnSide),
            );
          } else {
            pointsByEdgeId.set(edge.id, routeHorizontalSide("NORTH", loopIndex, loops.length));
          }
          continue;
        }
        const loopTop = sourceRect.y - spacing * (loopIndex + 1) - (style === "SPLINES" ? 1 : 0);
        const start = {
          x:
            sourceRect.x + (sourceRect.width * (loops.length - loopIndex)) / (loops.length * 2 + 1),
          y: sourceRect.y,
        };
        const end = {
          x:
            sourceRect.x +
            (sourceRect.width * (loops.length + 1 + loopIndex)) / (loops.length * 2 + 1),
          y: sourceRect.y,
        };
        if (style === "POLYLINE") {
          const chamfer = Math.min(5, spacing / 2);
          pointsByEdgeId.set(edge.id, [
            start,
            { x: start.x, y: loopTop + chamfer },
            { x: start.x + chamfer, y: loopTop },
            { x: end.x - chamfer, y: loopTop },
            { x: end.x, y: loopTop + chamfer },
            end,
          ]);
        } else {
          const third = (end.x - start.x) / 4;
          pointsByEdgeId.set(edge.id, [
            start,
            { x: start.x, y: loopTop + 1 },
            { x: start.x + third, y: loopTop },
            { x: (start.x + end.x) / 2, y: loopTop },
            { x: end.x - third, y: loopTop },
            { x: end.x, y: loopTop + 1 },
            end,
          ]);
        }
        continue;
      }

      const sourceFallback =
        implicitEndpoints.get(edge.id)?.source ??
        (horizontal
          ? {
              x: sourceRect.x + (reverse ? 0 : sourceRect.width),
              y: sourceRect.y + sourceRect.height / 2,
            }
          : {
              x: sourceRect.x + sourceRect.width / 2,
              y: sourceRect.y + (reverse ? 0 : sourceRect.height),
            });
      const targetFallback =
        implicitEndpoints.get(edge.id)?.target ??
        (horizontal
          ? {
              x: targetRect.x + (reverse ? targetRect.width : 0),
              y: targetRect.y + targetRect.height / 2,
            }
          : {
              x: targetRect.x + targetRect.width / 2,
              y: targetRect.y + (reverse ? targetRect.height : 0),
            });
      const start = getPortPoint(
        source,
        edge.sourcePort,
        sourceRect,
        sourceFallback,
        input.direction,
        input,
      );
      const end = getPortPoint(
        target,
        edge.targetPort,
        targetRect,
        targetFallback,
        input.direction,
        input,
      );
      const sourceLayer = flowLayerByNodeId.get(edge.sourceId) ?? 0;
      const targetLayer = flowLayerByNodeId.get(edge.targetId) ?? 0;
      const earlierLayer = Math.min(sourceLayer, targetLayer);
      const laterLayer = Math.max(sourceLayer, targetLayer);
      const earlier = flowLayers[earlierLayer];
      const later = flowLayers[laterLayer];
      const track =
        conservativeSplineTrackByEdgeId.get(edge.id) ??
        (earlier && later && earlierLayer !== laterLayer
          ? (earlier.end + later.start) / 2
          : horizontal
            ? (start.x + end.x) / 2
            : (start.y + end.y) / 2);
      const polylineMiddle: Point[] = [];
      if (style === "POLYLINE" && earlier && later && earlierLayer !== laterLayer) {
        const slopedZone = Number(input.settings["edgeRouting.polyline.slopedEdgeZoneWidth"] ?? 2);
        const sourceBounds = flowLayers[sourceLayer];
        const targetBounds = flowLayers[targetLayer];
        if (sourceBounds && targetBounds) {
          const sourceBoundary = sourceLayer < targetLayer ? sourceBounds.end : sourceBounds.start;
          const targetBoundary = sourceLayer < targetLayer ? targetBounds.start : targetBounds.end;
          const sourceFlow = horizontal ? start.x : start.y;
          const targetFlow = horizontal ? end.x : end.y;
          const crossDifference = horizontal
            ? Math.abs(end.y - start.y)
            : Math.abs(end.x - start.x);
          if (crossDifference > 1 && Math.abs(sourceFlow - sourceBoundary) > slopedZone) {
            polylineMiddle.push(
              horizontal ? { x: sourceBoundary, y: start.y } : { x: start.x, y: sourceBoundary },
            );
          }
          if (crossDifference > 1 && Math.abs(targetFlow - targetBoundary) > slopedZone) {
            polylineMiddle.push(
              horizontal ? { x: targetBoundary, y: end.y } : { x: end.x, y: targetBoundary },
            );
          }
        }
      }
      const splineMiddle: Point[] = [];
      if (style === "SPLINES") {
        const sourceOutgoing = input.graph.edges.filter(
          (candidate) => candidate.sourceId === edge.sourceId,
        ).length;
        const targetIncoming = input.graph.edges.filter(
          (candidate) => candidate.targetId === edge.targetId,
        ).length;
        const degreeDifference = Math.sign(sourceOutgoing - targetIncoming);
        const sourceCross = horizontal ? start.y : start.x;
        const targetCross = horizontal ? end.y : end.x;
        const centerCross =
          (sourceCross + targetCross) / 2 + (targetCross - sourceCross) * 0.4 * degreeDifference;
        const centerFlow = track;
        splineMiddle.push(
          start,
          horizontal ? { x: centerFlow, y: centerCross } : { x: centerCross, y: centerFlow },
        );
      }
      const middle =
        style === "POLYLINE"
          ? polylineMiddle
          : style === "SPLINES"
            ? splineMiddle
            : horizontal
              ? [
                  { x: track, y: start.y },
                  { x: track, y: end.y },
                ]
              : [
                  { x: start.x, y: track },
                  { x: end.x, y: track },
                ];
      const routedPoints = [start, ...middle, end];
      const splineMode = input.settings["edgeRouting.splines.mode"] ?? "SLOPPY";
      pointsByEdgeId.set(
        edge.id,
        style === "SPLINES"
          ? splineMode === "SLOPPY"
            ? routedPoints
            : conservativeSpline(start, end, track, horizontal, splineMode === "CONSERVATIVE_SOFT")
          : simplifyRoute(routedPoints),
      );
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
  portSettings?: (port: GraphPort<P>) => ElkLayeredOptionValueByName | undefined,
  nodeSettings?: ElkLayeredOptionValueByName,
): GraphPort<P>[] | undefined {
  if (!ports) return undefined;
  const horizontal = direction === "left" || direction === "right";
  const reverse = direction === "up" || direction === "left";
  const constraints = String(nodeSettings?.portConstraints ?? "UNDEFINED");
  const surrounding = (nodeSettings?.["spacing.portsSurrounding"] ?? {}) as Partial<
    Record<"top" | "right" | "bottom" | "left", number>
  >;
  const sideFixed =
    constraints === "FIXED_SIDE" ||
    constraints === "FIXED_ORDER" ||
    constraints === "FIXED_RATIO" ||
    constraints === "FIXED_POS";
  const sideByPort = new Map<GraphPort<P>, "NORTH" | "SOUTH" | "WEST" | "EAST">();
  for (const port of ports) {
    const configured = portSettings?.(port)?.["port.side"];
    if (
      sideFixed &&
      (configured === "NORTH" ||
        configured === "SOUTH" ||
        configured === "WEST" ||
        configured === "EAST")
    ) {
      sideByPort.set(port, configured);
      continue;
    }
    const outgoing = port.direction === "out";
    const farSide = reverse ? !outgoing : outgoing;
    sideByPort.set(port, horizontal ? (farSide ? "EAST" : "WEST") : farSide ? "SOUTH" : "NORTH");
  }
  const grouped = new Map<string, GraphPort<P>[]>();
  for (const port of ports) {
    const side = sideByPort.get(port)!;
    const group = grouped.get(side) ?? [];
    group.push(port);
    grouped.set(side, group);
  }
  for (const group of grouped.values()) {
    group.sort(
      (left, right) =>
        Number(portSettings?.(left)?.["port.index"] ?? ports.indexOf(left)) -
        Number(portSettings?.(right)?.["port.index"] ?? ports.indexOf(right)),
    );
  }
  return ports.map((port) => {
    const size = { width: port.width ?? 8, height: port.height ?? 8 };
    const flexiblePosition = getFlexiblePortPosition(port);
    if (flexiblePosition) {
      const side = sideByPort.get(port)!;
      return {
        ...port,
        ...size,
        x: side === "EAST" ? rect.width : side === "WEST" ? -size.width : flexiblePosition.x,
        y: side === "SOUTH" ? rect.height : side === "NORTH" ? -size.height : flexiblePosition.y,
      };
    }
    if (
      (constraints === "FIXED_POS" || constraints === "FIXED_RATIO") &&
      port.x !== undefined &&
      port.y !== undefined
    ) {
      const side = sideByPort.get(port)!;
      return {
        ...port,
        ...size,
        x: side === "EAST" ? rect.width : side === "WEST" ? -size.width : port.x,
        y: side === "SOUTH" ? rect.height : side === "NORTH" ? -size.height : port.y,
      };
    }
    const side = sideByPort.get(port)!;
    const group = grouped.get(side) ?? [port];
    const index = group.indexOf(port);
    const alignmentName =
      nodeSettings?.[
        side === "NORTH"
          ? "portAlignment.north"
          : side === "SOUTH"
            ? "portAlignment.south"
            : side === "WEST"
              ? "portAlignment.west"
              : "portAlignment.east"
      ] ?? nodeSettings?.["portAlignment.default"];
    const axisSize = side === "NORTH" || side === "SOUTH" ? rect.width : rect.height;
    const axisStart = Number(
      side === "NORTH" || side === "SOUTH" ? (surrounding.left ?? 0) : (surrounding.top ?? 0),
    );
    const axisEnd = Number(
      side === "NORTH" || side === "SOUTH" ? (surrounding.right ?? 0) : (surrounding.bottom ?? 0),
    );
    const availableAxisSize = Math.max(0, axisSize - axisStart - axisEnd);
    const portAxisSize = side === "NORTH" || side === "SOUTH" ? size.width : size.height;
    const spacing = Number(nodeSettings?.["spacing.portPort"] ?? 10);
    const occupied = group.length * portAxisSize + Math.max(0, group.length - 1) * spacing;
    const axisPosition =
      alignmentName === "BEGIN"
        ? axisStart + index * (portAxisSize + spacing) + portAxisSize / 2
        : alignmentName === "END"
          ? axisStart +
            availableAxisSize -
            occupied +
            index * (portAxisSize + spacing) +
            portAxisSize / 2
          : alignmentName === "CENTER"
            ? axisStart +
              (availableAxisSize - occupied) / 2 +
              index * (portAxisSize + spacing) +
              portAxisSize / 2
            : alignmentName === "JUSTIFIED"
              ? group.length === 1
                ? axisStart + availableAxisSize / 2
                : axisStart +
                  portAxisSize / 2 +
                  (index * (availableAxisSize - portAxisSize)) / (group.length - 1)
              : axisStart +
                portAxisSize / 2 +
                ((index + 1) * (availableAxisSize - group.length * portAxisSize)) /
                  (group.length + 1) +
                index * portAxisSize;
    const ratio = axisSize === 0 ? 0.5 : axisPosition / axisSize;
    const borderOffset = Number(portSettings?.(port)?.["port.borderOffset"] ?? 0);
    return {
      ...port,
      ...size,
      x:
        side === "EAST"
          ? rect.width + borderOffset
          : side === "WEST"
            ? -size.width - borderOffset
            : ratio * rect.width - size.width / 2,
      y:
        side === "SOUTH"
          ? rect.height + borderOffset
          : side === "NORTH"
            ? -size.height - borderOffset
            : ratio * rect.height - size.height / 2,
    };
  });
}

/** Account for port extents in ELK's graph-padding normalization. */
export function normalizePlacementForPortExtents(
  input: LayeredPhaseInput,
  placement: NodePlacement,
  order: LayerOrder,
): void {
  const horizontal = input.direction === "left" || input.direction === "right";
  const physicalLayers = order.layers
    .map((layer) => layer.flatMap((id) => (placement.rectByNodeId.has(id) ? [id] : [])))
    .filter((layer) => layer.length > 0)
    .sort((left, right) => {
      const leftRect = placement.rectByNodeId.get(left[0]!);
      const rightRect = placement.rectByNodeId.get(right[0]!);
      return horizontal
        ? (leftRect?.x ?? 0) - (rightRect?.x ?? 0)
        : (leftRect?.y ?? 0) - (rightRect?.y ?? 0);
    });
  let accumulatedShift = 0;
  for (let layerIndex = 0; layerIndex < physicalLayers.length; layerIndex++) {
    const layer = physicalLayers[layerIndex]!;
    if (accumulatedShift !== 0) {
      const mutable = placement.rectByNodeId as Map<string, EntityRect>;
      for (const id of layer) {
        const rect = mutable.get(id);
        if (!rect) continue;
        mutable.set(
          id,
          horizontal
            ? { ...rect, x: rect.x + accumulatedShift }
            : { ...rect, y: rect.y + accumulatedShift },
        );
      }
    }
    const nextLayer = physicalLayers[layerIndex + 1];
    if (!nextLayer) continue;
    let trailingExtent = 0;
    let leadingExtent = 0;
    for (const [ids, trailing] of [
      [layer, true],
      [nextLayer, false],
    ] as const) {
      for (const id of ids) {
        const node = input.graph.nodes.find((candidate) => candidate.id === id);
        const rect = placement.rectByNodeId.get(id);
        if (!node || !rect) continue;
        const ports = placePorts(
          node.ports,
          rect,
          input.direction,
          (port) => input.portSettings?.(port, node),
          { ...input.settings, ...input.nodeSettings?.(node) },
        );
        for (const port of ports ?? []) {
          const extent = horizontal
            ? trailing
              ? Math.max(0, (port.x ?? 0) + (port.width ?? 0) - rect.width)
              : Math.max(0, -(port.x ?? 0))
            : trailing
              ? Math.max(0, (port.y ?? 0) + (port.height ?? 0) - rect.height)
              : Math.max(0, -(port.y ?? 0));
          if (trailing) trailingExtent = Math.max(trailingExtent, extent);
          else leadingExtent = Math.max(leadingExtent, extent);
        }
      }
    }
    accumulatedShift += trailingExtent + leadingExtent;
  }

  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  for (const node of input.graph.nodes) {
    const rect = placement.rectByNodeId.get(node.id);
    if (!rect) continue;
    minimumX = Math.min(minimumX, rect.x);
    minimumY = Math.min(minimumY, rect.y);
    const ports = placePorts(
      node.ports,
      rect,
      input.direction,
      (port) => input.portSettings?.(port, node),
      { ...input.settings, ...input.nodeSettings?.(node) },
    );
    for (const port of ports ?? []) {
      minimumX = Math.min(minimumX, rect.x + (port.x ?? 0));
      minimumY = Math.min(minimumY, rect.y + (port.y ?? 0));
    }
  }
  const shiftX = Number.isFinite(minimumX) ? input.padding.left - minimumX : 0;
  const shiftY = Number.isFinite(minimumY) ? input.padding.top - minimumY : 0;
  if (shiftX === 0 && shiftY === 0) return;
  const mutable = placement.rectByNodeId as Map<string, EntityRect>;
  for (const [id, rect] of mutable) {
    mutable.set(id, { ...rect, x: rect.x + shiftX, y: rect.y + shiftY });
  }
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
