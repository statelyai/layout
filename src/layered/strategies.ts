import type { EntityRect, GraphEdge, GraphNode, GraphPort, Point } from "@statelyai/graph";
import { LayoutError } from "../errors";
import { JavaRandom } from "../java-random";
import type {
  AcyclicOrientation,
  CrossingMinimizer,
  CycleBreaker,
  EdgeRouter,
  EdgeRoutes,
  LayerAssigner,
  LayerAssignment,
  LayerOrder,
  LayeredPhaseInput,
  NodePlacement,
  NodePlacer,
} from "./types";

const phaseRandomByInput = new WeakMap<LayeredPhaseInput, JavaRandom>();
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

function cycleModelOrder(input: LayeredPhaseInput): Map<string, number> {
  const enforced =
    input.settings["considerModelOrder.groupModelOrder.cbGroupOrderStrategy"] === "ENFORCED";
  const count = Math.max(1, input.graph.nodes.length);
  return new Map(
    input.graph.nodes.map((node, index) => [
      node.id,
      enforced
        ? Number(
            input.nodeSettings?.(node)?.["considerModelOrder.groupModelOrder.cycleBreakingId"] ?? 0,
          ) *
            count +
          index
        : index,
    ]),
  );
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
  const effectiveModelOrder = cycleModelOrder(input);
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
        ? maximumNodeIds.sort(
            (left, right) =>
              (effectiveModelOrder.get(left) ?? Infinity) -
              (effectiveModelOrder.get(right) ?? Infinity),
          )[0]
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
  const order = cycleModelOrder(input);
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
  const modelOrder = cycleModelOrder(input);
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
  const nodeIndex = cycleModelOrder(input);
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
  const modelOrder = cycleModelOrder(input);
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
      const allMaximumOutgoing: GraphEdge[] = [];
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
          allMaximumOutgoing.push(edge);
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
          selected = allMaximumOutgoing;
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
    ...assignment,
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
    ...assignment,
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
    ...order,
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
  return { ...order, layers };
}

/** ELK's adjacent-node greedy-switch crossing minimization postprocessor. */
export function applyGreedySwitch(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  order: LayerOrder,
): LayerOrder {
  if (input.settings["crossingMinimization.strategy"] === "INTERACTIVE") return order;
  if (input.settings["crossingMinimization.semiInteractive"] === true) return order;
  const modelOrderStrategy = input.settings["considerModelOrder.strategy"] ?? "NONE";
  if (
    (modelOrderStrategy === "NODES_AND_EDGES" || modelOrderStrategy === "PREFER_NODES") &&
    (input.settings["crossingMinimization.forceNodeModelOrder"] === true ||
      Number(input.settings["considerModelOrder.crossingCounterNodeInfluence"] ?? 0) >= 1)
  ) {
    return order;
  }
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
  return { ...order, layers };
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

/**
 * ELK's forced input-model ordering for the layer-sweep crossing minimizer.
 *
 * The fixed layer is ordered by the authored node order. Earlier layers are
 * then swept backwards using their successors, which preserves model order
 * where possible without deliberately retaining crossings.
 */
export function applyForcedModelOrder(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  order: LayerOrder,
): LayerOrder {
  const strategy = input.settings["considerModelOrder.strategy"] ?? "NONE";
  if (strategy === "NONE") return order;
  const forceNodeOrder =
    input.settings["crossingMinimization.forceNodeModelOrder"] === true &&
    (strategy === "NODES_AND_EDGES" || strategy === "PREFER_NODES");

  const layers = order.layers.map((layer) => [...layer]);
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const modelOrder = new Map(input.graph.nodes.map((node, index) => [node.id, index]));
  const groupById = new Map(
    input.graph.nodes.map((node) => [
      node.id,
      Number(
        input.nodeSettings?.(node)?.["considerModelOrder.groupModelOrder.crossingMinimizationId"] ??
          0,
      ),
    ]),
  );
  const groupStrategy =
    input.settings["considerModelOrder.groupModelOrder.cmGroupOrderStrategy"] ??
    "ONLY_WITHIN_GROUP";
  const configuredEnforced =
    input.settings["considerModelOrder.groupModelOrder.cmEnforcedGroupOrders"];
  const enforcedGroups = new Set<number>(
    Array.isArray(configuredEnforced)
      ? configuredEnforced.map(Number)
      : typeof configuredEnforced === "string"
        ? (configuredEnforced.match(/-?\d+/g) ?? []).map(Number)
        : [1, 2, 6, 7, 10, 11],
  );
  const mayUseModelOrder = (id: string): boolean => {
    const node = nodeById.get(id);
    return (
      node === undefined || input.nodeSettings?.(node)?.["considerModelOrder.noModelOrder"] !== true
    );
  };
  const compareModelOrder = (left: string, right: string): number => {
    const leftGroup = groupById.get(left) ?? 0;
    const rightGroup = groupById.get(right) ?? 0;
    if (groupStrategy === "ONLY_WITHIN_GROUP" && leftGroup !== rightGroup) return 0;
    if (
      groupStrategy === "ENFORCED" &&
      leftGroup !== rightGroup &&
      enforcedGroups.has(leftGroup) &&
      enforcedGroups.has(rightGroup)
    ) {
      return leftGroup - rightGroup;
    }
    return (modelOrder.get(left) ?? Infinity) - (modelOrder.get(right) ?? Infinity);
  };

  const edgeModelOrder = new Map<string, number>();
  for (const [edgeIndex, edge] of input.graph.edges.entries()) {
    const [, targetId] = getOrientedEndpoints(edge, orientation);
    const sourceNode = nodeById.get(edge.sourceId);
    const portIndex = sourceNode?.ports?.findIndex((port) => port.name === edge.sourcePort) ?? -1;
    const effectiveEdgeOrder =
      input.settings["considerModelOrder.portModelOrder"] === true && portIndex >= 0
        ? (modelOrder.get(edge.sourceId) ?? 0) * (input.graph.edges.length + 1) + portIndex
        : edgeIndex;
    const previous = edgeModelOrder.get(targetId);
    if (previous === undefined || effectiveEdgeOrder < previous) {
      edgeModelOrder.set(targetId, effectiveEdgeOrder);
    }
  }
  const compareFixedLayer = (left: string, right: string): number => {
    const leftGroup = groupById.get(left) ?? 0;
    const rightGroup = groupById.get(right) ?? 0;
    const useEdgeOrder =
      !forceNodeOrder ||
      !mayUseModelOrder(left) ||
      !mayUseModelOrder(right) ||
      (groupStrategy === "ONLY_WITHIN_GROUP" && leftGroup !== rightGroup);
    return useEdgeOrder
      ? (edgeModelOrder.get(left) ?? Infinity) - (edgeModelOrder.get(right) ?? Infinity)
      : compareModelOrder(left, right);
  };

  const fixedLayer = layers.at(-1);
  if (fixedLayer) fixedLayer.sort(compareFixedLayer);

  const successors = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of input.graph.edges) {
    const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
    if (sourceId !== targetId) successors.get(sourceId)?.push(targetId);
  }
  for (let layerIndex = layers.length - 2; layerIndex >= 0; layerIndex--) {
    const nextPositions = new Map(
      (layers[layerIndex + 1] ?? []).map((id, index) => [id, index] as const),
    );
    const originalPosition = new Map(
      (layers[layerIndex] ?? []).map((id, index) => [id, index] as const),
    );
    layers[layerIndex]?.sort((left, right) => {
      const leftIsLongEdge = left.startsWith("__layout_dummy:");
      const rightIsLongEdge = right.startsWith("__layout_dummy:");
      const leftHasSuccessor = (successors.get(left)?.length ?? 0) > 0;
      const rightHasSuccessor = (successors.get(right)?.length ?? 0) > 0;
      if (
        leftIsLongEdge !== rightIsLongEdge &&
        ((leftIsLongEdge && !rightHasSuccessor) || (rightIsLongEdge && !leftHasSuccessor))
      ) {
        const longEdgeStrategy =
          input.settings["considerModelOrder.longEdgeStrategy"] ?? "DUMMY_NODE_OVER";
        if (longEdgeStrategy === "DUMMY_NODE_OVER") return leftIsLongEdge ? -1 : 1;
        if (longEdgeStrategy === "DUMMY_NODE_UNDER") return leftIsLongEdge ? 1 : -1;
      }
      const average = (id: string): number => {
        const positions = (successors.get(id) ?? []).flatMap((successor) => {
          const position = nextPositions.get(successor);
          return position === undefined ? [] : [position];
        });
        return positions.length === 0
          ? (originalPosition.get(id) ?? 0)
          : positions.reduce((sum, position) => sum + position, 0) / positions.length;
      };
      return average(left) - average(right) || compareModelOrder(left, right);
    });
  }
  const nodeInfluence = Number(
    input.settings["considerModelOrder.crossingCounterNodeInfluence"] ?? 0,
  );
  if (
    !forceNodeOrder &&
    nodeInfluence >= 1 &&
    (strategy === "NODES_AND_EDGES" || strategy === "PREFER_NODES")
  ) {
    for (const layer of layers) {
      const regular = layer
        .filter((id) => !id.startsWith("__layout_dummy:"))
        .sort(compareModelOrder);
      let regularIndex = 0;
      for (let index = 0; index < layer.length; index++) {
        if (!layer[index]?.startsWith("__layout_dummy:")) {
          layer[index] = regular[regularIndex++]!;
        }
      }
    }
  }
  // Ports are kept in their configured model/edge order by the importer and
  // port placer, so increasing their objective weight requires no reordering.
  Number(input.settings["considerModelOrder.crossingCounterPortInfluence"] ?? 0);
  return { layers };
}

/** ELK LONGEST_PATH: align sinks on the final layer. */
export const assignLayersByLongestPathToSink: LayerAssigner = (input, orientation) => {
  const successors = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of input.graph.edges) {
    const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
    if (sourceId === targetId) continue;
    successors.get(sourceId)?.push(targetId);
  }
  const heightByNodeId = new Map<string, number>();
  const layers: string[][] = [];
  const visit = (id: string): number => {
    const known = heightByNodeId.get(id);
    if (known !== undefined) return known;
    let height = 1;
    for (const targetId of successors.get(id) ?? []) {
      height = Math.max(height, visit(targetId) + 1);
    }
    while (layers.length < height) layers.unshift([]);
    layers[layers.length - height]!.push(id);
    heightByNodeId.set(id, height);
    return height;
  };
  for (const node of input.graph.nodes) visit(node.id);
  const layerByNodeId = new Map<string, number>();
  for (const [layer, ids] of layers.entries()) {
    for (const id of ids) layerByNodeId.set(id, layer);
  }
  return {
    layerByNodeId,
    seedOrder: layers.flat(),
  };
};

/** ELK INTERACTIVE layering for normal flat nodes. */
export const assignLayersInteractively: LayerAssigner = (input, orientation) => {
  const spans: Array<{ start: number; end: number; nodeIds: string[] }> = [];
  const horizontal = input.direction === "left" || input.direction === "right";
  const reverse = input.direction === "left" || input.direction === "up";
  for (const node of input.graph.nodes) {
    const size = input.sizes.get(node.id);
    const position = horizontal ? (node.x ?? 0) : (node.y ?? 0);
    const flowSize = horizontal ? (size?.width ?? 0) : (size?.height ?? 0);
    const start = reverse ? -position - flowSize : position;
    const end = Math.max(start + 1, start + flowSize);
    let foundIndex = -1;
    let index = 0;
    while (index < spans.length) {
      const span = spans[index]!;
      if (span.start >= end) break;
      if (span.end > start) {
        if (foundIndex < 0) {
          span.nodeIds.push(node.id);
          span.start = Math.min(span.start, start);
          span.end = Math.max(span.end, end);
          foundIndex = index;
          index++;
        } else {
          spans[foundIndex]!.nodeIds.push(...span.nodeIds);
          spans[foundIndex]!.end = Math.max(spans[foundIndex]!.end, span.end);
          spans.splice(index, 1);
        }
      } else {
        index++;
      }
    }
    if (foundIndex < 0) {
      spans.splice(index, 0, { start, end, nodeIds: [node.id] });
    }
  }

  const successors = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of input.graph.edges) {
    const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
    if (sourceId !== targetId) successors.get(sourceId)?.push(targetId);
  }

  const layerNodes = spans.map((span) => [...span.nodeIds]);
  const layerByNodeId = new Map<string, number>();
  for (const [layer, ids] of layerNodes.entries()) {
    for (const id of ids) layerByNodeId.set(id, layer);
  }
  const checked = new Set<string>();
  const checkNode = (sourceId: string): string[] => {
    checked.add(sourceId);
    const shifted: string[] = [];
    const sourceLayer = layerByNodeId.get(sourceId) ?? 0;
    for (const targetId of successors.get(sourceId) ?? []) {
      const targetLayer = layerByNodeId.get(targetId) ?? 0;
      if (targetLayer > sourceLayer) continue;
      const newLayer = sourceLayer + 1;
      while (layerNodes.length <= newLayer) layerNodes.push([]);
      const oldLayer = layerNodes[targetLayer];
      oldLayer?.splice(oldLayer.indexOf(targetId), 1);
      layerNodes[newLayer]!.push(targetId);
      layerByNodeId.set(targetId, newLayer);
      if (!shifted.includes(targetId)) shifted.push(targetId);
    }
    return shifted;
  };
  for (const node of input.graph.nodes) {
    if (checked.has(node.id)) continue;
    const shifted = checkNode(node.id);
    while (shifted.length > 0) {
      const next = shifted.shift()!;
      for (const shiftedId of checkNode(next)) {
        if (!shifted.includes(shiftedId)) shifted.push(shiftedId);
      }
    }
  }
  const nonemptyLayers = layerNodes.filter((ids) => ids.length > 0);
  for (const [layer, ids] of nonemptyLayers.entries()) {
    for (const id of ids) layerByNodeId.set(id, layer);
  }
  return { layerByNodeId, seedOrder: nonemptyLayers.flat() };
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
    let leftPosition = leftValues.length;
    let rightPosition = rightValues.length;
    while (leftPosition > 0 && rightPosition > 0) {
      const leftValue = leftValues[--leftPosition];
      const rightValue = rightValues[--rightPosition];
      if (leftValue !== rightValue) return leftValue - rightValue;
    }
    // This intentionally mirrors ELK's ListIterator.hasNext checks after
    // reverse traversal, including its non-total ordering for equal non-empty
    // predecessor lists. Java's PriorityQueue makes that behavior observable.
    const leftHasNext = leftPosition < leftValues.length;
    const rightHasNext = rightPosition < rightValues.length;
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
  const sinks: string[] = [];
  const compareSinks = (left: string, right: string) =>
    -(topo.get(left) ?? 0) + (topo.get(right) ?? 0);
  const addSink = (nodeId: string) => {
    let index = sinks.length;
    sinks.push(nodeId);
    while (index > 0) {
      const parentIndex = (index - 1) >>> 1;
      const parent = sinks[parentIndex];
      if (parent === undefined || compareSinks(parent, nodeId) <= 0) break;
      sinks[index] = parent;
      index = parentIndex;
    }
    sinks[index] = nodeId;
  };
  const takeSink = (): string | undefined => {
    const result = sinks[0];
    const last = sinks.pop();
    if (sinks.length === 0 || last === undefined) return result;
    let index = 0;
    const half = sinks.length >>> 1;
    while (index < half) {
      let childIndex = index * 2 + 1;
      let child = sinks[childIndex] as string;
      const rightIndex = childIndex + 1;
      const right = sinks[rightIndex];
      if (right !== undefined && compareSinks(right, child) < 0) {
        childIndex = rightIndex;
        child = right;
      }
      if (compareSinks(last, child) <= 0) break;
      sinks[index] = child;
      index = childIndex;
    }
    sinks[index] = last;
    return result;
  };
  for (const id of nodeIds) if (outdegree.get(id) === 0) addSink(id);
  const inverseLayerByNodeId = new Map<string, number>();
  const layerMembers: string[][] = [[]];
  const bound = input.settings["layering.coffmanGraham.layerBound"] ?? 2_147_483_647;
  let currentLayer = 0;
  while (sinks.length > 0) {
    const nodeId = takeSink();
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
      if (remaining === 0) addSink(edge.sourceId);
    }
  }

  return {
    layerByNodeId: new Map(
      nodeIds.map((id) => [id, currentLayer - (inverseLayerByNodeId.get(id) ?? 0)]),
    ),
    seedOrder: [...layerMembers].reverse().flat(),
  };
};

function sortLayerByAdjacentPosition(
  layer: string[],
  ranksByNodeId: ReadonlyMap<string, readonly number[]>,
  statistic: "mean" | "median",
  random?: JavaRandom,
  preOrdered = true,
  sourceUnknownPlacement = true,
  perturbSummedWeight = true,
): void {
  const originalIndex = new Map(layer.map((nodeId, index) => [nodeId, index] as const));
  const adjacentPosition = new Map<string, number | undefined>();
  for (const nodeId of layer) {
    const positions = [...(ranksByNodeId.get(nodeId) ?? [])].sort((left, right) => left - right);
    if (positions.length === 0) {
      adjacentPosition.set(nodeId, undefined);
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
        perturbSummedWeight
          ? (positions.reduce((sum, value) => sum + value, 0) +
              (random ? random.nextFloat() * 0.07 - 0.035 : 0)) /
              positions.length
          : positions.reduce((sum, value) => sum + value, 0) / positions.length +
              (random ? random.nextFloat() * 0.07 - 0.035 : 0),
      );
    }
  }

  if (statistic === "mean" && random && sourceUnknownPlacement) {
    if (preOrdered) {
      let lastValue = -1;
      for (const [index, nodeId] of layer.entries()) {
        let value = adjacentPosition.get(nodeId);
        if (value === undefined) {
          let nextValue = lastValue + 1;
          for (const nextId of layer.slice(index + 1)) {
            const candidate = adjacentPosition.get(nextId);
            if (candidate !== undefined) {
              nextValue = candidate;
              break;
            }
          }
          value = (lastValue + nextValue) / 2;
          adjacentPosition.set(nodeId, value);
        }
        lastValue = value;
      }
    } else {
      const maximum =
        Math.max(0, ...[...adjacentPosition.values()].filter((value) => value !== undefined)) + 2;
      for (const nodeId of layer) {
        if (adjacentPosition.get(nodeId) === undefined) {
          adjacentPosition.set(nodeId, random.nextFloat() * maximum - 1);
        }
      }
    }
  } else {
    for (const nodeId of layer) {
      if (adjacentPosition.get(nodeId) === undefined) {
        adjacentPosition.set(nodeId, originalIndex.get(nodeId) ?? 0);
      }
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
    const exactPortSweep =
      (input.settings.hierarchyHandling !== "INCLUDE_CHILDREN" ||
        input.graph.nodes.some((node) => node.id.startsWith("__native_hierarchy_"))) &&
      (input.settings["wrapping.strategy"] ?? "OFF") === "OFF" &&
      (input.settings["layerUnzipping.strategy"] ?? "NONE") === "NONE";
    let maximumLayer = 0;
    for (const layer of assignment.layerByNodeId.values()) {
      maximumLayer = Math.max(maximumLayer, layer);
    }
    const layerCount = maximumLayer + 1;
    const layers = Array.from({ length: layerCount }, () => [] as string[]);
    const initialNodes = assignment.seedOrder
      ? completeSeedOrder(input, assignment)
      : (input.settings["layering.strategy"] ?? "NETWORK_SIMPLEX") === "NETWORK_SIMPLEX"
        ? networkSimplexComponentOrder(input)
        : input.graph.nodes.map((node) => node.id);
    for (const nodeId of initialNodes) {
      layers[assignment.layerByNodeId.get(nodeId) ?? 0]?.push(nodeId);
    }
    const inputPortOrder = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
    const outputPortOrder = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
    for (const edge of input.graph.edges) {
      const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
      outputPortOrder.get(sourceId)?.push(edge.id);
      inputPortOrder.get(targetId)?.push(edge.id);
    }
    if (exactPortSweep) {
      for (const edgeIds of inputPortOrder.values()) {
        if (edgeIds.length >= 4) {
          edgeIds.splice(0, edgeIds.length - 1, ...edgeIds.slice(0, -1).reverse());
        }
      }
    }
    const countCrossings = (candidateLayers: readonly (readonly string[])[]): number => {
      if (!exactPortSweep) {
        const positions = new Map<string, number>();
        for (const layer of candidateLayers) {
          for (const [index, id] of layer.entries()) positions.set(id, index);
        }
        let crossings = 0;
        for (let left = 0; left < input.graph.edges.length; left++) {
          const [leftSource, leftTarget] = getOrientedEndpoints(
            input.graph.edges[left]!,
            orientation,
          );
          for (let right = left + 1; right < input.graph.edges.length; right++) {
            const [rightSource, rightTarget] = getOrientedEndpoints(
              input.graph.edges[right]!,
              orientation,
            );
            if (leftSource === rightSource || leftTarget === rightTarget) continue;
            const sourceDifference =
              (positions.get(leftSource) ?? 0) - (positions.get(rightSource) ?? 0);
            const targetDifference =
              (positions.get(leftTarget) ?? 0) - (positions.get(rightTarget) ?? 0);
            if (sourceDifference * targetDifference < 0) crossings++;
          }
        }
        return crossings;
      }
      const layerIndex = new Map<string, number>();
      for (const [index, layer] of candidateLayers.entries()) {
        for (const id of layer) {
          layerIndex.set(id, index);
        }
      }
      let crossings = 0;
      for (let index = 0; index < candidateLayers.length - 1; index++) {
        const between = input.graph.edges.filter((edge) => {
          const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
          return layerIndex.get(sourceId) === index && layerIndex.get(targetId) === index + 1;
        });
        const sourceRanks = new Map<string, number>();
        const targetRanks = new Map<string, number>();
        let consumed = 0;
        for (const nodeId of candidateLayers[index] ?? []) {
          const edgeIds = outputPortOrder.get(nodeId) ?? [];
          for (const [portIndex, edgeId] of edgeIds.entries()) {
            sourceRanks.set(edgeId, consumed + portIndex + 1);
          }
          consumed += edgeIds.length;
        }
        consumed = 0;
        for (const nodeId of candidateLayers[index + 1] ?? []) {
          const edgeIds = inputPortOrder.get(nodeId) ?? [];
          for (const [portIndex, edgeId] of edgeIds.entries()) {
            targetRanks.set(edgeId, consumed + edgeIds.length - portIndex);
          }
          consumed += edgeIds.length;
        }
        const orderedTargets = between
          .map((edge) => ({
            source: sourceRanks.get(edge.id) ?? 0,
            target: targetRanks.get(edge.id) ?? 0,
          }))
          .sort((left, right) => left.source - right.source)
          .map(({ target }) => target);
        const sortedTargets = [...orderedTargets].sort((left, right) => left - right);
        const targetIndex = new Map(sortedTargets.map((rank, rankIndex) => [rank, rankIndex + 1]));
        const fenwick = Array.from({ length: sortedTargets.length + 1 }, () => 0);
        let seen = 0;
        for (const target of orderedTargets) {
          const rank = targetIndex.get(target) ?? 1;
          let preceding = 0;
          for (let cursor = rank; cursor > 0; cursor -= cursor & -cursor) {
            preceding += fenwick[cursor] ?? 0;
          }
          crossings += seen - preceding;
          for (let cursor = rank; cursor < fenwick.length; cursor += cursor & -cursor) {
            fenwick[cursor] = (fenwick[cursor] ?? 0) + 1;
          }
          seen++;
        }
      }
      return crossings;
    };

    const sharedRandom = new JavaRandom(input.settings.randomSeed ?? 1);
    const randomSeed = sharedRandom.nextLong();
    const portDistributorUsesNodeRelativeRanks = sharedRandom.nextBoolean();
    const nodeRelativePortRanks = portDistributorUsesNodeRelativeRanks;
    // ELK treats the median heuristic as deterministic, so it keeps using the
    // graph's shared RNG after port-distributor selection. Barycenter resets to
    // the saved seed while comparing randomized layouts.
    const random = statistic === "median" ? sharedRandom : new JavaRandom(randomSeed);
    const thoroughness = Math.max(1, input.settings.thoroughness ?? sweeps ?? 7);
    let bestLayers = layers.map((layer) => [...layer]);
    let bestInputPortOrder = new Map<string, string[]>();
    let bestOutputPortOrder = new Map<string, string[]>();
    let bestCrossings = Number.POSITIVE_INFINITY;
    let working = layers.map((layer) => [...layer]);
    const sourceUnknownPlacement =
      (input.settings["considerModelOrder.strategy"] ?? "NONE") === "NONE";
    const usePortRanks = true;
    const medianWeights = new Map<string, number>();

    const adjacentRanks = (
      fixedLayer: readonly string[],
      freeLayer: readonly string[],
      forward: boolean,
    ): Map<string, number[]> => {
      const freeIds = new Set(freeLayer);
      const ranks = new Map(freeLayer.map((id) => [id, [] as number[]]));
      if (!usePortRanks) {
        const fixedPosition = new Map(fixedLayer.map((id, index) => [id, index]));
        for (const edge of input.graph.edges) {
          const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
          if (forward && fixedPosition.has(sourceId) && freeIds.has(targetId)) {
            ranks.get(targetId)?.push(fixedPosition.get(sourceId)!);
          } else if (!forward && fixedPosition.has(targetId) && freeIds.has(sourceId)) {
            ranks.get(sourceId)?.push(fixedPosition.get(targetId)!);
          }
        }
        return ranks;
      }
      let rankSum = 0;
      for (const fixedId of fixedLayer) {
        const groups = new Map<string, { edges: GraphEdge[]; portOrder: number }>();
        for (const [modelOrder, edge] of input.graph.edges.entries()) {
          const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
          if (
            (forward && sourceId !== fixedId) ||
            (!forward && targetId !== fixedId) ||
            !freeIds.has(forward ? targetId : sourceId)
          ) {
            continue;
          }
          const reversed = orientation.reversedEdgeIds.has(edge.id);
          const port = forward
            ? reversed
              ? edge.targetPort
              : edge.sourcePort
            : reversed
              ? edge.sourcePort
              : edge.targetPort;
          const key = port ?? `__implicit:${edge.id}`;
          const group = groups.get(key) ?? { edges: [], portOrder: modelOrder };
          group.edges.push(edge);
          groups.set(key, group);
        }
        const currentPortOrder = forward
          ? outputPortOrder.get(fixedId)
          : inputPortOrder.get(fixedId);
        const orderedGroups = [...groups.values()].sort((left, right) =>
          exactPortSweep
            ? (currentPortOrder?.indexOf(left.edges[0]?.id ?? "") ?? -1) -
                (currentPortOrder?.indexOf(right.edges[0]?.id ?? "") ?? -1) ||
              left.portOrder - right.portOrder
            : left.portOrder - right.portOrder,
        );
        const count = orderedGroups.length;
        for (const [index, group] of orderedGroups.entries()) {
          const rank = nodeRelativePortRanks
            ? forward
              ? rankSum + (index + 1) / (count + 1)
              : rankSum + 1 - (index + 1) / (count + 1)
            : forward
              ? rankSum + index + 1
              : rankSum + count - index;
          for (const edge of group.edges) {
            const [sourceId, targetId] = getOrientedEndpoints(edge, orientation);
            ranks.get(forward ? targetId : sourceId)?.push(rank);
          }
        }
        rankSum += nodeRelativePortRanks ? 1 : count;
      }
      return ranks;
    };

    const distributePorts = (
      fixedLayer: readonly string[],
      freeLayer: readonly string[],
      forward: boolean,
    ) => {
      const calculateRanks = (
        layer: readonly string[],
        orders: ReadonlyMap<string, readonly string[]>,
        inputPorts: boolean,
      ) => {
        const ranks = new Map<string, number>();
        let consumed = 0;
        for (const nodeId of layer) {
          const edgeIds = orders.get(nodeId) ?? [];
          for (const [index, edgeId] of edgeIds.entries()) {
            ranks.set(
              edgeId,
              nodeRelativePortRanks
                ? consumed +
                    (inputPorts
                      ? 1 - (index + 1) / (edgeIds.length + 1)
                      : (index + 1) / (edgeIds.length + 1))
                : consumed + (inputPorts ? edgeIds.length - index : index + 1),
            );
          }
          consumed += nodeRelativePortRanks ? 1 : edgeIds.length;
        }
        return ranks;
      };
      const reorder = (
        nodeIds: readonly string[],
        orders: Map<string, string[]>,
        oppositeRanks: ReadonlyMap<string, number>,
        reverse: boolean,
      ) => {
        for (const nodeId of nodeIds) {
          orders.get(nodeId)?.sort((leftId, rightId) => {
            const difference = (oppositeRanks.get(leftId) ?? 0) - (oppositeRanks.get(rightId) ?? 0);
            return reverse ? -difference : difference;
          });
        }
      };
      if (forward) {
        const fixedRanks = calculateRanks(fixedLayer, outputPortOrder, false);
        reorder(freeLayer, inputPortOrder, fixedRanks, true);
        const freeRanks = calculateRanks(freeLayer, inputPortOrder, true);
        reorder(fixedLayer, outputPortOrder, freeRanks, false);
      } else {
        const fixedRanks = calculateRanks(fixedLayer, inputPortOrder, true);
        reorder(freeLayer, outputPortOrder, fixedRanks, false);
        const freeRanks = calculateRanks(freeLayer, outputPortOrder, false);
        reorder(fixedLayer, inputPortOrder, freeRanks, true);
      }
    };

    const attempts = statistic === "median" ? 1 : thoroughness;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let forward = random.nextBoolean();
      const firstLayerIndex = forward ? 0 : Math.max(0, working.length - 1);
      const firstLayerWeights = new Map(
        (working[firstLayerIndex] ?? []).map((id) => [id, random.nextDouble()]),
      );
      working[firstLayerIndex]?.sort(
        (left, right) => (firstLayerWeights.get(left) ?? 0) - (firstLayerWeights.get(right) ?? 0),
      );
      if (statistic === "median") {
        working[firstLayerIndex]?.forEach((id, index) => medianWeights.set(id, index + 1));
      }

      const sweep = (isForward: boolean, firstSweep: boolean) => {
        const sortWithMedianWeights = (current: string[], reference: readonly string[]) => {
          const referenceIds = new Set(reference);
          const originalIndex = new Map(current.map((id, index) => [id, index]));
          for (const id of current) {
            const connectedWeights = input.graph.edges
              .flatMap((edge) => {
                if (edge.sourceId === id && referenceIds.has(edge.targetId)) {
                  return [medianWeights.get(edge.targetId) ?? 0];
                }
                if (edge.targetId === id && referenceIds.has(edge.sourceId)) {
                  return [medianWeights.get(edge.sourceId) ?? 0];
                }
                return [];
              })
              .sort((left, right) => left - right);
            medianWeights.set(
              id,
              connectedWeights.length > 0
                ? connectedWeights[Math.floor(connectedWeights.length / 2)]!
                : Number.MAX_VALUE / 2,
            );
          }
          current.sort(
            (left, right) =>
              (medianWeights.get(left) ?? 0) - (medianWeights.get(right) ?? 0) ||
              (originalIndex.get(left) ?? 0) - (originalIndex.get(right) ?? 0),
          );
        };
        if (isForward) {
          for (let layer = 1; layer < working.length; layer++) {
            const current = working[layer];
            const previous = working[layer - 1];
            if (current && previous) {
              if (statistic === "median") sortWithMedianWeights(current, previous);
              else
                sortLayerByAdjacentPosition(
                  current,
                  adjacentRanks(previous, current, true),
                  statistic,
                  random,
                  !firstSweep,
                  sourceUnknownPlacement,
                  true,
                );
              if (exactPortSweep) distributePorts(previous, current, true);
            }
          }
        } else {
          for (let layer = working.length - 2; layer >= 0; layer--) {
            const current = working[layer];
            const next = working[layer + 1];
            if (current && next) {
              if (statistic === "median") sortWithMedianWeights(current, next);
              else
                sortLayerByAdjacentPosition(
                  current,
                  adjacentRanks(next, current, false),
                  statistic,
                  random,
                  !firstSweep,
                  sourceUnknownPlacement,
                  true,
                );
              if (exactPortSweep) distributePorts(next, current, false);
            }
          }
        }
      };

      sweep(forward, true);
      let crossings = countCrossings(working);
      let attemptBestLayers = working.map((layer) => [...layer]);
      let attemptBestInputPortOrder = new Map(
        [...inputPortOrder].map(([id, edgeIds]) => [id, [...edgeIds]]),
      );
      let attemptBestOutputPortOrder = new Map(
        [...outputPortOrder].map(([id, edgeIds]) => [id, [...edgeIds]]),
      );
      while (crossings > 0) {
        forward = !forward;
        const before = exactPortSweep ? undefined : working.map((layer) => [...layer]);
        sweep(forward, false);
        const nextCrossings = countCrossings(working);
        if (nextCrossings >= crossings) {
          if (before) working = before;
          break;
        }
        crossings = nextCrossings;
        attemptBestLayers = working.map((layer) => [...layer]);
        attemptBestInputPortOrder = new Map(
          [...inputPortOrder].map(([id, edgeIds]) => [id, [...edgeIds]]),
        );
        attemptBestOutputPortOrder = new Map(
          [...outputPortOrder].map(([id, edgeIds]) => [id, [...edgeIds]]),
        );
      }
      if (crossings < bestCrossings) {
        bestCrossings = crossings;
        bestLayers = attemptBestLayers;
        bestInputPortOrder = attemptBestInputPortOrder;
        bestOutputPortOrder = attemptBestOutputPortOrder;
        if (crossings === 0) break;
      }
    }

    phaseRandomByInput.set(input, random);
    return exactPortSweep
      ? {
          layers: bestLayers,
          inputPortOrderByNodeId: bestInputPortOrder,
          outputPortOrderByNodeId: bestOutputPortOrder,
        }
      : { layers: bestLayers };
  };
}

/** NetworkSimplexLayerer processes the largest undirected component first. */
function networkSimplexComponentOrder(input: LayeredPhaseInput): string[] {
  const neighbors = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of input.graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    neighbors.get(edge.sourceId)?.push(edge.targetId);
    neighbors.get(edge.targetId)?.push(edge.sourceId);
  }
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const node of input.graph.nodes) {
    if (visited.has(node.id)) continue;
    const component: string[] = [];
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      component.push(id);
      for (const neighbor of neighbors.get(id) ?? []) visit(neighbor);
    };
    visit(node.id);
    if (components.length === 0 || components[0]!.length < component.length) {
      components.unshift(component);
    } else {
      components.push(component);
    }
  }
  return components.flat();
}

/** Keep model order within each component while placing connected work before isolated nodes. */
function stableComponentModelOrder(input: LayeredPhaseInput): string[] {
  const neighbors = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of input.graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    neighbors.get(edge.sourceId)?.push(edge.targetId);
    neighbors.get(edge.targetId)?.push(edge.sourceId);
  }
  const visited = new Set<string>();
  const componentByNodeId = new Map<string, number>();
  let component = 0;
  for (const node of input.graph.nodes) {
    if (visited.has(node.id)) continue;
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      componentByNodeId.set(id, component);
      for (const neighbor of neighbors.get(id) ?? []) visit(neighbor);
    };
    visit(node.id);
    component++;
  }
  const components = Array.from({ length: component }, () => [] as string[]);
  for (const node of input.graph.nodes)
    components[componentByNodeId.get(node.id) ?? 0]?.push(node.id);
  return components
    .sort((left, right) => Number(right.length > 1) - Number(left.length > 1))
    .flat();
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

function completeSeedOrder(input: LayeredPhaseInput, assignment: LayerAssignment): string[] {
  if (!assignment.seedOrder) return input.graph.nodes.map((node) => node.id);
  const seeded = new Set(assignment.seedOrder);
  return [
    ...assignment.seedOrder,
    ...input.graph.nodes.flatMap((node) => (seeded.has(node.id) ? [] : [node.id])),
  ];
}

export const minimizeCrossingsWithModelOrder: CrossingMinimizer = (
  input,
  _orientation,
  assignment,
) => {
  const maximumLayer = Math.max(0, ...assignment.layerByNodeId.values());
  const layers = Array.from({ length: maximumLayer + 1 }, () => [] as string[]);
  const layeringStrategy = input.settings["layering.strategy"] ?? "NETWORK_SIMPLEX";
  const nodeOrder = assignment.seedOrder
    ? completeSeedOrder(input, assignment)
    : layeringStrategy === "NETWORK_SIMPLEX"
      ? networkSimplexComponentOrder(input)
      : layeringStrategy === "LONGEST_PATH"
        ? stableComponentModelOrder(input)
        : input.graph.nodes.map((node) => node.id);
  for (const nodeId of nodeOrder) {
    layers[assignment.layerByNodeId.get(nodeId) ?? 0]?.push(nodeId);
  }
  for (const layer of layers) {
    const normal = layer.filter((id) => !id.startsWith("__layout_dummy:"));
    const dummies = layer.filter((id) => id.startsWith("__layout_dummy:"));
    layer.splice(0, layer.length, ...normal, ...dummies);
  }
  for (let layerIndex = 1; layerIndex < layers.length; layerIndex++) {
    const previousPosition = new Map(
      layers[layerIndex - 1]!.map((id, index) => [id, index] as const),
    );
    const layer = layers[layerIndex]!;
    const sortedDummies = layer
      .filter((id) => id.startsWith("__layout_dummy:"))
      .map((id, index) => {
        const incoming = input.graph.edges.find(
          (edge) => edge.targetId === id && previousPosition.has(edge.sourceId),
        );
        return { id, index, source: previousPosition.get(incoming?.sourceId ?? "") };
      })
      .sort(
        (left, right) =>
          (left.source ?? Number.MAX_SAFE_INTEGER) - (right.source ?? Number.MAX_SAFE_INTEGER) ||
          left.index - right.index,
      );
    let dummyIndex = 0;
    for (let index = 0; index < layer.length; index++) {
      if (layer[index]?.startsWith("__layout_dummy:"))
        layer[index] = sortedDummies[dummyIndex++]!.id;
    }
  }
  return { layers };
};

export const minimizeCrossingsInteractively: CrossingMinimizer = (
  input,
  _orientation,
  assignment,
) => {
  const horizontal = input.direction === "left" || input.direction === "right";
  const seededOrder = completeSeedOrder(input, assignment);
  const modelOrder = new Map(seededOrder.map((id, index) => [id, index]));
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const layers = layersFromAssignment(input, assignment);
  const center = input.settings.interactiveReferencePoint !== "TOP_LEFT";
  for (const layer of layers) {
    const normalNodes = layer
      .filter((id) => !id.startsWith("__layout_dummy:"))
      .flatMap((id) => (nodeById.get(id) ? [nodeById.get(id)!] : []));
    const referenceFlow =
      normalNodes.length === 0
        ? 0
        : normalNodes.reduce((sum, node) => {
            const size = input.sizes.get(node.id);
            return (
              sum +
              (horizontal
                ? (node.x ?? 0) + (size?.width ?? 0) / 2
                : (node.y ?? 0) + (size?.height ?? 0) / 2)
            );
          }, 0) / normalNodes.length;
    for (const id of layer) {
      if (!id.startsWith("__layout_dummy:")) continue;
      const incident = input.graph.edges.find(
        (edge) => edge.sourceId === id || edge.targetId === id,
      );
      const segmentMarker = incident?.id.lastIndexOf("::segment:") ?? -1;
      if (!incident || segmentMarker < 0) continue;
      const edgeId = incident.id.slice(0, segmentMarker);
      const segments = input.graph.edges
        .filter((edge) => edge.id.startsWith(`${edgeId}::segment:`))
        .sort(
          (left, right) =>
            Number(left.id.slice(left.id.lastIndexOf(":") + 1)) -
            Number(right.id.slice(right.id.lastIndexOf(":") + 1)),
        );
      const source = nodeById.get(segments[0]?.sourceId ?? "");
      const target = nodeById.get(segments.at(-1)?.targetId ?? "");
      if (!source || !target) continue;
      const point = (node: GraphNode) => {
        const size = input.sizes.get(node.id);
        return horizontal
          ? {
              flow: node.x ?? 0,
              cross: (node.y ?? 0) + (size?.height ?? 0) / 2,
            }
          : {
              flow: node.y ?? 0,
              cross: (node.x ?? 0) + (size?.width ?? 0) / 2,
            };
      };
      const sourcePoint = point(source);
      const targetPoint = point(target);
      if (input.direction === "left") sourcePoint.cross = source.y ?? 0;
      sourcePoint.flow += horizontal
        ? (input.sizes.get(source.id)?.width ?? 0)
        : (input.sizes.get(source.id)?.height ?? 0);
      targetPoint.cross = horizontal ? (target.y ?? 0) : (target.x ?? 0);
      const internalFlowSign =
        input.direction === "left" ||
        (input.direction === "down" && input.settings.directionCongruency === "ROTATION")
          ? -1
          : 1;
      const internalReferenceFlow = internalFlowSign * referenceFlow;
      const internalSourceFlow = internalFlowSign * sourcePoint.flow;
      const internalTargetFlow = internalFlowSign * targetPoint.flow;
      const denominator = internalTargetFlow - internalSourceFlow;
      const ratio =
        internalReferenceFlow <= internalSourceFlow
          ? 0
          : internalTargetFlow <= internalReferenceFlow
            ? 1
            : Math.abs(denominator) < 1e-9
              ? 0.5
              : (internalReferenceFlow - internalSourceFlow) / denominator;
      const cross =
        input.direction === "left"
          ? sourcePoint.cross
          : sourcePoint.cross + ratio * (targetPoint.cross - sourcePoint.cross);
      const dummy = nodeById.get(id);
      if (dummy) {
        if (horizontal) dummy.y = cross;
        else dummy.x = cross;
      }
    }
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

export function applyDirectionCongruency(input: LayeredPhaseInput, order: LayerOrder): LayerOrder {
  if (
    input.settings.directionCongruency !== "ROTATION" ||
    (input.direction !== "left" && input.direction !== "down")
  ) {
    return order;
  }
  return { layers: order.layers.map((layer) => [...layer].reverse()) };
}

/** ELK post-placement one-dimensional graph compaction. */
export function applyPostCompaction(
  input: LayeredPhaseInput,
  placement: NodePlacement,
  routes?: EdgeRoutes,
): NodePlacement {
  const strategy = input.settings["compaction.postCompaction.strategy"] ?? "NONE";
  // Both source strategies construct the same constraint relation; only their
  // asymptotic implementation differs.
  const constraintStrategy = input.settings["compaction.postCompaction.constraints"] ?? "SCANLINE";
  void constraintStrategy;
  if (strategy === "NONE") return placement;
  const rects = placement.rectByNodeId as Map<string, EntityRect>;
  type ConstraintNode = {
    id: string;
    kind: "node" | "segment";
    nodeId?: string;
    edgeId?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    originalX: number;
    points?: [Point, Point];
  };
  const compactables: ConstraintNode[] = [...rects].map(([id, rect]) => ({
    id: `node:${id}`,
    kind: "node",
    nodeId: id,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    originalX: rect.x,
  }));
  if (routes) {
    for (const [edgeId, readonlyPoints] of routes.pointsByEdgeId) {
      const points = readonlyPoints as Point[];
      for (let index = 0; index + 1 < points.length; index++) {
        const first = points[index]!;
        const second = points[index + 1]!;
        if (Math.abs(first.x - second.x) > 1e-9 || Math.abs(first.y - second.y) < 1e-9) continue;
        compactables.push({
          id: `segment:${edgeId}:${index}`,
          kind: "segment",
          edgeId,
          x: first.x,
          y: Math.min(first.y, second.y),
          width: 0,
          height: Math.abs(first.y - second.y),
          originalX: first.x,
          points: [first, second],
        });
      }
    }
  }
  const verticalSpacing = (left: ConstraintNode, right: ConstraintNode): number =>
    left.kind === "node" && right.kind === "node"
      ? input.spacing.node
      : left.kind === "segment" && right.kind === "segment" && left.edgeId === right.edgeId
        ? 1
        : Number(
            input.settings[
              left.kind === "segment" && right.kind === "segment"
                ? "spacing.edgeEdge"
                : "spacing.edgeNode"
            ] ?? 10,
          );
  const horizontalSpacing = (left: ConstraintNode, right: ConstraintNode): number =>
    left.kind === "node" && right.kind === "node"
      ? input.spacing.node
      : left.kind === "segment" && right.kind === "segment" && left.edgeId === right.edgeId
        ? 0
        : Number(
            input.settings[
              left.kind === "segment" && right.kind === "segment"
                ? "spacing.edgeEdge"
                : "spacing.edgeNode"
            ] ?? 10,
          );
  const compact = (direction: "LEFT" | "RIGHT", locked = new Set<string>()): void => {
    const nodes: ConstraintNode[] = compactables.map((item) => ({
      ...item,
      x: direction === "RIGHT" ? -item.x - item.width : item.x,
      originalX: item.x,
    }));
    const constraints = new Map(nodes.map((node) => [node.id, [] as string[]]));
    const incoming = new Map(nodes.map((node) => [node.id, 0]));
    for (const left of nodes) {
      for (const right of nodes) {
        if (left === right) continue;
        const ordered = right.x > left.x || (right.x === left.x && left.width < right.width);
        const verticalCollision =
          right.y + right.height + verticalSpacing(left, right) > left.y + 1e-9 &&
          right.y < left.y + left.height + verticalSpacing(left, right) - 1e-9;
        if (!ordered || !verticalCollision) continue;
        constraints.get(left.id)!.push(right.id);
        incoming.set(right.id, (incoming.get(right.id) ?? 0) + 1);
      }
    }
    const minimum = Math.min(...nodes.map((node) => node.x));
    const position = new Map(nodes.map((node) => [node.id, minimum]));
    const pending = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    while (pending.length > 0) {
      const id = pending.shift()!;
      const node = nodeById.get(id)!;
      if (locked.has(node.nodeId ?? id) && node.x >= (position.get(id) ?? minimum)) {
        position.set(id, node.x);
      }
      for (const constrainedId of constraints.get(id) ?? []) {
        position.set(
          constrainedId,
          Math.max(
            position.get(constrainedId) ?? minimum,
            (position.get(id) ?? minimum) +
              node.width +
              horizontalSpacing(node, nodeById.get(constrainedId)!),
          ),
        );
        incoming.set(constrainedId, (incoming.get(constrainedId) ?? 1) - 1);
        if (incoming.get(constrainedId) === 0) pending.push(constrainedId);
      }
    }
    const compactableById = new Map(compactables.map((item) => [item.id, item]));
    for (const node of nodes) {
      const compacted = position.get(node.id) ?? node.x;
      compactableById.get(node.id)!.x = direction === "RIGHT" ? -compacted - node.width : compacted;
    }
  };
  if (strategy === "RIGHT") {
    compact("RIGHT");
  } else if (strategy === "LEFT_RIGHT_CONSTRAINT_LOCKING") {
    compact("LEFT");
    const degree = new Map(input.graph.nodes.map((node) => [node.id, 0]));
    for (const edge of input.graph.edges) {
      degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1);
      degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1);
    }
    compact(
      "RIGHT",
      new Set(input.graph.nodes.filter((node) => degree.get(node.id) === 0).map((node) => node.id)),
    );
  } else if (strategy === "LEFT_RIGHT_CONNECTION_LOCKING") {
    compact("LEFT");
    const incomingDegree = new Map(input.graph.nodes.map((node) => [node.id, 0]));
    const outgoingDegree = new Map(input.graph.nodes.map((node) => [node.id, 0]));
    for (const edge of input.graph.edges) {
      outgoingDegree.set(edge.sourceId, (outgoingDegree.get(edge.sourceId) ?? 0) + 1);
      incomingDegree.set(edge.targetId, (incomingDegree.get(edge.targetId) ?? 0) + 1);
    }
    compact(
      "RIGHT",
      new Set(
        input.graph.nodes
          .filter((node) => (incomingDegree.get(node.id) ?? 0) > (outgoingDegree.get(node.id) ?? 0))
          .map((node) => node.id),
      ),
    );
  } else {
    compact("LEFT");
    if (strategy === "EDGE_LENGTH") {
      const itemByNodeId = new Map(
        compactables.flatMap((item) =>
          item.kind === "node" && item.nodeId ? [[item.nodeId, item] as const] : [],
        ),
      );
      const incomingDegree = new Map(input.graph.nodes.map((node) => [node.id, 0]));
      const outgoing = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
      for (const edge of input.graph.edges) {
        outgoing.get(edge.sourceId)?.push(edge.targetId);
        incomingDegree.set(edge.targetId, (incomingDegree.get(edge.targetId) ?? 0) + 1);
      }
      for (const node of input.graph.nodes) {
        const targets = outgoing.get(node.id) ?? [];
        if (targets.length <= (incomingDegree.get(node.id) ?? 0) || targets.length === 0) continue;
        const item = itemByNodeId.get(node.id);
        if (!item) continue;
        const upper = Math.min(
          ...targets.map(
            (targetId) =>
              (itemByNodeId.get(targetId)?.x ?? item.x) - item.width - input.spacing.node,
          ),
        );
        item.x = Math.max(item.x, upper);
      }
    }
  }
  const offset = input.padding.left - Math.min(...compactables.map((item) => item.x));
  for (const item of compactables) item.x += offset;
  const nodeDeltaById = new Map<string, number>();
  for (const item of compactables) {
    if (item.kind === "node") {
      const rect = rects.get(item.nodeId!)!;
      nodeDeltaById.set(item.nodeId!, item.x - rect.x);
      rects.set(item.nodeId!, { ...rect, x: item.x });
    } else if (item.points) {
      const delta = item.x - item.originalX;
      item.points[0].x += delta;
      item.points[1].x += delta;
    }
  }
  if (routes) {
    const edgeById = new Map(input.graph.edges.map((edge) => [edge.id, edge]));
    for (const [edgeId, readonlyPoints] of routes.pointsByEdgeId) {
      const points = readonlyPoints as Point[];
      const edge = edgeById.get(edgeId);
      if (!edge || points.length === 0) continue;
      points[0]!.x += nodeDeltaById.get(edge.sourceId) ?? 0;
      points.at(-1)!.x += nodeDeltaById.get(edge.targetId) ?? 0;
    }
  }
  return placement;
}

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
      (id.startsWith("__layout_dummy:") ? 1 : 0) +
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
  const layerFlowSizes = order.layers.map((layer) => {
    const size = Math.max(
      0,
      ...layer.map((id) =>
        horizontal ? (input.sizes.get(id)?.width ?? 0) : (input.sizes.get(id)?.height ?? 0),
      ),
    );
    return size === 0 &&
      layer.length > 0 &&
      layer.every(
        (id) => id.startsWith("__layout_dummy:") || id.startsWith("__layout_breaking:"),
      ) &&
      ((input.settings["layerUnzipping.strategy"] ?? "NONE") === "ALTERNATING" ||
        (input.settings["wrapping.strategy"] ?? "OFF") === "MULTI_EDGE")
      ? 2 * Number(input.settings["spacing.edgeNodeBetweenLayers"] ?? 10)
      : size;
  });
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
        (id.startsWith("__layout_dummy:") ? 1 : 0) +
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
    for (const [nodeIndex, id] of layer.entries()) {
      const node = nodeById.get(id);
      const size = input.sizes.get(id) ?? { width: 0, height: 0 };
      const isDummy = id.startsWith("__layout_dummy:") || id.startsWith("__layout_breaking:");
      const hasInteractiveDummyPosition =
        (input.settings["crossingMinimization.strategy"] ?? "LAYER_SWEEP") === "INTERACTIVE";
      let originalCross = horizontal ? (node?.y ?? 0) : (node?.x ?? 0);
      if (isDummy && !hasInteractiveDummyPosition) {
        minimumCross = Math.max(minimumCross, 0);
        const previous = layer[nodeIndex - 1];
        originalCross =
          minimumCross +
          (previous === undefined
            ? Number(input.settings["spacing.edgeNode"] ?? 10)
            : nodeNodeSpacing(input, previous, id));
      }
      if (
        isDummy &&
        hasInteractiveDummyPosition &&
        input.direction === "right" &&
        input.settings["nodePlacement.strategy"] === "INTERACTIVE" &&
        minimumCross !== Number.NEGATIVE_INFINITY
      ) {
        originalCross = Math.min(
          originalCross,
          minimumCross + nodeNodeSpacing(input, layer[Math.max(0, nodeIndex - 1)]!, id),
        );
      }
      const cross = Math.max(
        originalCross,
        minimumCross === Number.NEGATIVE_INFINITY
          ? originalCross
          : minimumCross + nodeNodeSpacing(input, layer[Math.max(0, nodeIndex - 1)]!, id),
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
      const implicitDummyMargin = id.startsWith("__layout_dummy:") ? 1 : 0;
      minimumCross = cross + (horizontal ? size.height : size.width) + implicitDummyMargin;
    }
  }

  const minimumCross = Math.min(
    ...[...rectByNodeId.values()].map((rect) => (horizontal ? rect.y : rect.x)),
  );
  const crossOffset = crossPadding - minimumCross;
  for (const [id, rect] of rectByNodeId) {
    rectByNodeId.set(
      id,
      horizontal ? { ...rect, y: rect.y + crossOffset } : { ...rect, x: rect.x + crossOffset },
    );
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
  const simplified: Point[] = [];
  for (const point of points) {
    const previous = simplified.at(-1);
    if (previous && equal(previous.x, point.x) && equal(previous.y, point.y)) continue;
    simplified.push(point);
    while (simplified.length >= 3) {
      const first = simplified.at(-3)!;
      const middle = simplified.at(-2)!;
      const last = simplified.at(-1)!;
      if (
        (equal(first.x, middle.x) && equal(middle.x, last.x)) ||
        (equal(first.y, middle.y) && equal(middle.y, last.y))
      ) {
        simplified.splice(-2, 1);
      } else {
        break;
      }
    }
  }
  return simplified;
}

function implicitEdgeEndpoints(
  input: LayeredPhaseInput,
  placement: NodePlacement,
  orientation?: AcyclicOrientation,
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
    const feedback =
      input.settings.feedbackEdges === true && orientation?.reversedEdgeIds.has(edge.id) === true;
    const directionReversed = input.direction === "left" || input.direction === "up";
    const sourceSide = feedback
      ? directionReversed
        ? "before"
        : "after"
      : forward
        ? "after"
        : "before";
    const targetSide = feedback
      ? directionReversed
        ? "after"
        : "before"
      : forward
        ? "before"
        : "after";
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
  const edgeModelOrder = new Map(input.graph.edges.map((edge, index) => [edge.id, index]));
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
    const unzipping = (input.settings["layerUnzipping.strategy"] ?? "NONE") === "ALTERNATING";
    const crossingStrategy = input.settings["crossingMinimization.strategy"] ?? "LAYER_SWEEP";
    const interactiveTargetOrder =
      crossingStrategy === "INTERACTIVE" &&
      entries.every(({ endpoint }) => endpoint === "target") &&
      entries.some(({ edge }) => edge.sourceId.startsWith("__layout_dummy:"));
    const verticalNoneTargetOrder =
      !horizontal &&
      crossingStrategy === "NONE" &&
      input.settings["layering.strategy"] === "STRETCH_WIDTH" &&
      entries.every(({ endpoint }) => endpoint === "target") &&
      !input.graph.edges.some(({ sourceId }) => sourceId === nodeId) &&
      entries.some(({ edge }) => edge.sourceId.startsWith("__layout_dummy:"));
    const layerOrdered =
      unzipping ||
      interactiveTargetOrder ||
      verticalNoneTargetOrder ||
      (input.settings.hierarchyHandling !== "INCLUDE_CHILDREN" &&
        (crossingStrategy === "LAYER_SWEEP" || crossingStrategy === "MEDIAN_LAYER_SWEEP"));
    entries.sort((left, right) => {
      if (interactiveTargetOrder) {
        const leftDummy = left.edge.sourceId.startsWith("__layout_dummy:");
        const rightDummy = right.edge.sourceId.startsWith("__layout_dummy:");
        if (leftDummy !== rightDummy) return Number(leftDummy) - Number(rightDummy);
        const order =
          (edgeModelOrder.get(left.edge.id) ?? Number.MAX_SAFE_INTEGER) -
          (edgeModelOrder.get(right.edge.id) ?? Number.MAX_SAFE_INTEGER);
        return input.direction === "left" && !leftDummy ? -order : order;
      }
      if (verticalNoneTargetOrder) {
        const leftOrder = edgeModelOrder.get(left.edge.id) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = edgeModelOrder.get(right.edge.id) ?? Number.MAX_SAFE_INTEGER;
        const maximumOrder = Math.max(
          ...entries.map(({ edge }) => edgeModelOrder.get(edge.id) ?? 0),
        );
        return (
          Number(rightOrder === maximumOrder) - Number(leftOrder === maximumOrder) ||
          leftOrder - rightOrder
        );
      }
      if (layerOrdered) {
        const leftOther = placement.rectByNodeId.get(
          left.endpoint === "source" ? left.edge.targetId : left.edge.sourceId,
        );
        const rightOther = placement.rectByNodeId.get(
          right.endpoint === "source" ? right.edge.targetId : right.edge.sourceId,
        );
        const leftCross = horizontal
          ? (leftOther?.y ?? 0) + (leftOther?.height ?? 0) / 2
          : (leftOther?.x ?? 0) + (leftOther?.width ?? 0) / 2;
        const rightCross = horizontal
          ? (rightOther?.y ?? 0) + (rightOther?.height ?? 0) / 2
          : (rightOther?.x ?? 0) + (rightOther?.width ?? 0) / 2;
        if (leftCross !== rightCross) return leftCross - rightCross;
      }
      return (
        (edgeModelOrder.get(left.edge.id) ?? Number.MAX_SAFE_INTEGER) -
        (edgeModelOrder.get(right.edge.id) ?? Number.MAX_SAFE_INTEGER)
      );
    });
    entries.forEach(({ edge, endpoint }, index) => {
      const reversedCrossOrder =
        endpoint === "target" &&
        input.settings["crossingMinimization.strategy"] !== "INTERACTIVE" &&
        !layerOrdered &&
        !(
          input.settings.directionCongruency === "ROTATION" &&
          (input.direction === "down" || input.direction === "left")
        );
      const ordinal = reversedCrossOrder ? entries.length - index : index + 1;
      const ratio = mergeEdges || hypernode === true ? 0.5 : ordinal / (entries.length + 1);
      const fixedWrapAnchor = nodeId.startsWith("__layout_dummy:wrap:");
      let point = horizontal
        ? {
            x: side === "after" ? rect.x + rect.width : rect.x,
            y: rect.y + (fixedWrapAnchor ? 0 : ratio * rect.height),
          }
        : {
            x: rect.x + (fixedWrapAnchor ? 0 : ratio * rect.width),
            y: side === "after" ? rect.y + rect.height : rect.y,
          };
      // ELK's network-simplex placer integerizes port position plus anchor before
      // constructing its auxiliary graph. Routing observes those same coordinates.
      if ((input.settings["nodePlacement.strategy"] ?? "BRANDES_KOEPF") === "NETWORK_SIMPLEX") {
        point = horizontal
          ? { ...point, y: Math.round(point.y) }
          : { ...point, x: Math.round(point.x) };
      }
      const pair = result.get(edge.id) ?? { source: point, target: point };
      pair[endpoint] = point;
      result.set(edge.id, pair);
    });
  }
  return result;
}

function routeEdges(style: "ORTHOGONAL" | "POLYLINE" | "SPLINES"): EdgeRouter {
  return (input, orientation, placement) => {
    const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
    const pointsByEdgeId = new Map<string, readonly Point[]>();
    const splineNubControlsByEdgeId = new Map<string, readonly Point[]>();
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
    let implicitEndpoints = implicitEdgeEndpoints(input, placement, orientation);
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
    if (labelShift !== 0) implicitEndpoints = implicitEdgeEndpoints(input, placement, orientation);

    const orthogonalTrackByEdgeId = new Map<string, number>();
    const orthogonalDetourByEdgeId = new Map<
      string,
      { firstTrack: number; secondTrack: number; crossover: number }
    >();
    if (
      style === "ORTHOGONAL" &&
      input.settings.mergeEdges !== true &&
      (input.settings["wrapping.strategy"] ?? "OFF") === "OFF" &&
      input.settings.hierarchyHandling !== "INCLUDE_CHILDREN" &&
      (input.settings["layerUnzipping.strategy"] ?? "NONE") === "NONE"
    ) {
      const edgeNodeSpacing = Number(input.settings["spacing.edgeNodeBetweenLayers"] ?? 10);
      const edgeEdgeSpacing = Number(input.settings["spacing.edgeEdgeBetweenLayers"] ?? 10);
      const candidatesByGap = flowLayers.slice(0, -1).map(
        () =>
          [] as Array<{
            edge: GraphEdge;
            sourceCross: number;
            targetCross: number;
            straight: boolean;
            slot?: number;
            secondSlot?: number;
            crossover?: number;
          }>,
      );
      for (const edge of input.graph.edges) {
        const sourceLayer = flowLayerByNodeId.get(edge.sourceId);
        const targetLayer = flowLayerByNodeId.get(edge.targetId);
        const endpoints = implicitEndpoints.get(edge.id);
        if (
          endpoints === undefined ||
          sourceLayer === undefined ||
          targetLayer === undefined ||
          Math.abs(sourceLayer - targetLayer) !== 1
        ) {
          continue;
        }
        const graphSourceCross = horizontal ? endpoints.source.y : endpoints.source.x;
        const graphTargetCross = horizontal ? endpoints.target.y : endpoints.target.x;
        const sourceBeforeTarget = sourceLayer < targetLayer;
        const sourceCross = sourceBeforeTarget ? graphSourceCross : graphTargetCross;
        const targetCross = sourceBeforeTarget ? graphTargetCross : graphSourceCross;
        candidatesByGap[Math.min(sourceLayer, targetLayer)]?.push({
          edge,
          sourceCross,
          targetCross,
          straight: Math.abs(sourceCross - targetCross) < 1e-3,
        });
      }

      const slotsByGap = candidatesByGap.map((candidates) => {
        if (candidates.length === 0) return 0;
        // ELK creates hyperedge segments by walking layer nodes and their ports,
        // so dependency-cycle tie breaking observes cross-axis order.
        candidates.sort(
          (left, right) =>
            left.sourceCross - right.sourceCross || left.targetCross - right.targetCross,
        );
        const minimumDifference = (values: readonly number[]) => {
          const distinct = [...new Set(values)].sort((left, right) => left - right);
          let minimum = Number.MAX_VALUE;
          for (let index = 1; index < distinct.length; index++) {
            minimum = Math.min(minimum, distinct[index]! - distinct[index - 1]!);
          }
          return minimum;
        };
        const criticalThreshold =
          0.2 *
          Math.min(
            minimumDifference(candidates.map(({ sourceCross }) => sourceCross)),
            minimumDifference(candidates.map(({ targetCross }) => targetCross)),
          );
        const dependencies = candidates.map(() => new Set<number>());
        const criticalDependencies = new Set<string>();
        const addDependency = (source: number, target: number, critical = false) => {
          dependencies[source]?.add(target);
          if (critical) criticalDependencies.add(`${source}:${target}`);
        };
        const conflicts = (left: number, right: number) => {
          const difference = Math.abs(left - right);
          if (difference < criticalThreshold) return -1;
          return difference < 0.5 * edgeEdgeSpacing ? 1 : 0;
        };
        const crossesExtent = (position: number, candidate: (typeof candidates)[number]) =>
          position >= Math.min(candidate.sourceCross, candidate.targetCross) &&
          position <= Math.max(candidate.sourceCross, candidate.targetCross)
            ? 1
            : 0;

        for (let left = 0; left < candidates.length - 1; left++) {
          for (let right = left + 1; right < candidates.length; right++) {
            const first = candidates[left]!;
            const second = candidates[right]!;
            if (first.straight || second.straight) continue;
            const conflictsFirst = conflicts(first.targetCross, second.sourceCross);
            const conflictsSecond = conflicts(second.targetCross, first.sourceCross);
            if (conflictsFirst < 0 || conflictsSecond < 0) {
              if (conflictsFirst < 0) addDependency(right, left, true);
              if (conflictsSecond < 0) addDependency(left, right, true);
              continue;
            }
            const firstPenalty =
              conflictsFirst +
              16 *
                (crossesExtent(first.targetCross, second) +
                  crossesExtent(second.sourceCross, first));
            const secondPenalty =
              conflictsSecond +
              16 *
                (crossesExtent(second.targetCross, first) +
                  crossesExtent(first.sourceCross, second));
            if (firstPenalty < secondPenalty) addDependency(left, right);
            else if (firstPenalty > secondPenalty) addDependency(right, left);
            else if (firstPenalty > 0) {
              addDependency(left, right);
              addDependency(right, left);
            }
          }
        }

        if (input.direction === "left") {
          for (let left = 0; left < candidates.length - 1; left++) {
            for (let right = left + 1; right < candidates.length; right++) {
              const leftDummy = candidates[left]!.edge.id.includes("::segment:");
              const rightDummy = candidates[right]!.edge.id.includes("::segment:");
              if (leftDummy === rightDummy) continue;
              const dummy = leftDummy ? left : right;
              const ordinary = leftDummy ? right : left;
              const candidate = candidates[dummy]!;
              if (
                Math.abs(candidate.sourceCross - candidate.targetCross) < edgeEdgeSpacing &&
                dependencies[dummy]?.delete(ordinary)
              ) {
                dependencies[ordinary]?.add(dummy);
              }
            }
          }
        }

        const nonStraight = candidates.filter(({ straight }) => !straight);
        let splitCycle = false;
        for (let left = 0; left < candidates.length - 1 && !splitCycle; left++) {
          for (let right = left + 1; right < candidates.length; right++) {
            if (
              dependencies[left]?.has(right) &&
              dependencies[right]?.has(left) &&
              criticalDependencies.has(`${left}:${right}`) &&
              criticalDependencies.has(`${right}:${left}`)
            ) {
              const random =
                phaseRandomByInput.get(input) ?? new JavaRandom(input.settings.randomSeed ?? 1);
              const detour = random.nextInt(2) === 0 ? candidates[right]! : candidates[left]!;
              const central = detour === candidates[left] ? candidates[right]! : candidates[left]!;
              detour.slot = 0;
              detour.secondSlot = 2;
              detour.crossover = (detour.sourceCross + central.sourceCross) / 2;
              central.slot = 1;
              dependencies[left]?.delete(right);
              dependencies[right]?.delete(left);
              splitCycle = true;
              break;
            }
          }
        }

        for (let left = 0; left < candidates.length - 1; left++) {
          for (let right = left + 1; right < candidates.length; right++) {
            if (
              dependencies[left]?.has(right) &&
              dependencies[right]?.has(left) &&
              !criticalDependencies.has(`${left}:${right}`) &&
              !criticalDependencies.has(`${right}:${left}`)
            ) {
              const lowerSource =
                candidates[left]!.sourceCross < candidates[right]!.sourceCross ? left : right;
              const higherSource = lowerSource === left ? right : left;
              dependencies[lowerSource]?.delete(higherSource);
            }
          }
        }

        // ELK breaks dependency cycles before topological numbering. Removing the
        // later edge is equivalent for the zero-weight two-cycles that remain here.
        const visiting = new Set<number>();
        const visited = new Set<number>();
        const removeCycles = (source: number) => {
          visiting.add(source);
          for (const target of dependencies[source] ?? []) {
            if (visiting.has(target)) dependencies[source]?.delete(target);
            else if (!visited.has(target)) removeCycles(target);
          }
          visiting.delete(source);
          visited.add(source);
        };
        for (let index = 0; index < candidates.length; index++) removeCycles(index);

        const incoming = candidates.map(() => 0);
        for (const targets of dependencies) {
          for (const target of targets) incoming[target] = (incoming[target] ?? 0) + 1;
        }
        const queue = incoming.flatMap((count, index) => (count === 0 ? [index] : []));
        let maximumSlot = Math.max(
          0,
          ...candidates.map(({ secondSlot, slot }) => secondSlot ?? slot ?? 0),
        );
        for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
          const source = queue[queueIndex]!;
          const sourceSlot = candidates[source]?.slot ?? 0;
          for (const target of dependencies[source] ?? []) {
            const targetCandidate = candidates[target];
            if (!targetCandidate) continue;
            targetCandidate.slot = Math.max(targetCandidate.slot ?? 0, sourceSlot + 1);
            maximumSlot = Math.max(maximumSlot, targetCandidate.slot);
            incoming[target]!--;
            if (incoming[target] === 0) queue.push(target);
          }
        }
        // ELK's topological numbering moves target-only hyperedge segments to
        // the rightmost slot. Ordinary edges map to those segments here; long-
        // edge dummy segments retain their dependency-derived rank.
        for (const candidate of nonStraight) {
          if (
            !candidate.edge.id.includes("::segment:") &&
            Math.abs(candidate.sourceCross - candidate.targetCross) < edgeEdgeSpacing / 2
          ) {
            candidate.slot = maximumSlot;
          }
        }
        return nonStraight.length === 0 ? 0 : maximumSlot + 1;
      });

      const existingGapByLayer = flowLayers
        .slice(0, -1)
        .map((bounds, layerNo) => (flowLayers[layerNo + 1]?.start ?? bounds.end) - bounds.end);
      const preservesNodeFlexibilityGap =
        input.settings["nodePlacement.strategy"] === "NETWORK_SIMPLEX" &&
        ((input.settings["nodePlacement.networkSimplex.nodeFlexibility.default"] ?? "NONE") !==
          "NONE" ||
          input.graph.nodes.some(
            (node) =>
              input.nodeSettings?.(node)?.["nodePlacement.networkSimplex.nodeFlexibility"] !==
                undefined &&
              input.nodeSettings?.(node)?.["nodePlacement.networkSimplex.nodeFlexibility"] !==
                "NONE",
          ));
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
        const slots = slotsByGap[layerNo] ?? 0;
        const gapSpacing =
          slots === 0
            ? (existingGapByLayer[layerNo] ?? input.spacing.layer)
            : Math.max(
                preservesNodeFlexibilityGap
                  ? (existingGapByLayer[layerNo] ?? input.spacing.layer)
                  : input.spacing.layer,
                2 * edgeNodeSpacing + Math.max(0, slots - 1) * edgeEdgeSpacing,
              );
        nextStart = bounds.end + gapSpacing;
      }
      implicitEndpoints = implicitEdgeEndpoints(input, placement, orientation);

      for (const [gap, candidates] of candidatesByGap.entries()) {
        for (const candidate of candidates) {
          if (candidate.straight) continue;
          const firstTrack =
            (flowLayers[gap]?.end ?? 0) + edgeNodeSpacing + (candidate.slot ?? 0) * edgeEdgeSpacing;
          if (candidate.secondSlot !== undefined && candidate.crossover !== undefined) {
            orthogonalDetourByEdgeId.set(candidate.edge.id, {
              firstTrack,
              secondTrack:
                (flowLayers[gap]?.end ?? 0) +
                edgeNodeSpacing +
                candidate.secondSlot * edgeEdgeSpacing,
              crossover: candidate.crossover,
            });
          } else {
            orthogonalTrackByEdgeId.set(candidate.edge.id, firstTrack);
          }
        }
      }
    }

    const splineTrackRankByEdgeId = new Map<string, { gap: number; rank: number; slots: number }>();
    if (style === "POLYLINE" || style === "SPLINES") {
      const edgeSpacing = Number(input.settings["spacing.edgeEdgeBetweenLayers"] ?? 10);
      const nodeSpacing = input.spacing.layer;
      const edgeSpaceFactor = Math.min(1, edgeSpacing / nodeSpacing);
      const extraByGap = flowLayers.slice(0, -1).map(() => 0);
      const nonStraightByGap = flowLayers.slice(0, -1).map(() => 0);
      const splineCandidatesByGap = flowLayers.slice(0, -1).map(
        () =>
          [] as Array<{
            edgeId: string;
            left: number;
            right: number;
            leftNode: string;
            rightNode: string;
            straight: boolean;
          }>,
      );
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
        } else if (crossDifference >= 0.2 || input.direction === "left") {
          const graphSourceCross = horizontal ? endpoints.source.y : endpoints.source.x;
          const graphTargetCross = horizontal ? endpoints.target.y : endpoints.target.x;
          splineCandidatesByGap[gap]?.push({
            edgeId: edge.id,
            left: sourceLayer < targetLayer ? graphSourceCross : graphTargetCross,
            right: sourceLayer < targetLayer ? graphTargetCross : graphSourceCross,
            leftNode: sourceLayer < targetLayer ? edge.sourceId : edge.targetId,
            rightNode: sourceLayer < targetLayer ? edge.targetId : edge.sourceId,
            straight: crossDifference < 0.2,
          });
          if (
            crossDifference >= 0.2 &&
            (input.settings["edgeRouting.splines.mode"] ?? "SLOPPY") === "SLOPPY"
          ) {
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
      const splineRankRandom =
        phaseRandomByInput.get(input) ?? new JavaRandom(input.settings.randomSeed ?? 1);
      for (const [gap, candidates] of splineCandidatesByGap.entries()) {
        if (candidates.length === 0) continue;
        type SplineSegment = { left: number[]; right: number[]; top: number; bottom: number };
        const segments: SplineSegment[] = [];
        const remaining = new Set(candidates.map((_, index) => index));
        const combine = (indexes: readonly number[]) => {
          const left = indexes.map((index) => candidates[index]!.left);
          const right = indexes.map((index) => candidates[index]!.right);
          const source = left[0]!;
          const targetMinimum = Math.min(...right);
          const targetMaximum = Math.max(...right);
          const center =
            source < targetMinimum ? (source + targetMinimum) / 2 : (source + targetMaximum) / 2;
          const outerTarget = source < targetMinimum ? targetMinimum : targetMaximum;
          segments.push({
            left,
            right,
            top: 0.1 * center + 0.9 * Math.min(source, outerTarget),
            bottom: 0.1 * center + 0.9 * Math.max(source, outerTarget),
          });
          for (const index of indexes) remaining.delete(index);
        };
        for (const index of remaining) combine([index]);

        type SplineDependency = { source: number; target: number; weight: number };
        const dependencies: SplineDependency[] = [];
        const between = (value: number, first: number, second: number) =>
          value >= Math.min(first, second) && value <= Math.max(first, second);
        for (let firstIndex = 0; firstIndex + 1 < segments.length; firstIndex++) {
          for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex++) {
            const first = segments[firstIndex]!;
            const second = segments[secondIndex]!;
            if (first.bottom < second.top || second.bottom < first.top) continue;
            const firstCounter =
              first.right.filter((value) => between(value, second.top, second.bottom)).length -
              first.left.filter((value) => between(value, second.top, second.bottom)).length;
            const secondCounter =
              second.right.filter((value) => between(value, first.top, first.bottom)).length -
              second.left.filter((value) => between(value, first.top, first.bottom)).length;
            if (firstCounter < secondCounter) {
              dependencies.push({
                source: firstIndex,
                target: secondIndex,
                weight: secondCounter - firstCounter,
              });
            } else if (secondCounter < firstCounter) {
              dependencies.push({
                source: secondIndex,
                target: firstIndex,
                weight: firstCounter - secondCounter,
              });
            } else {
              if (
                input.direction === "left" ||
                (input.settings["layering.strategy"] === "STRETCH_WIDTH" &&
                  input.settings["crossingMinimization.strategy"] === "NONE")
              ) {
                dependencies.push({ source: secondIndex, target: firstIndex, weight: 0 });
                dependencies.push({ source: firstIndex, target: secondIndex, weight: 0 });
              } else {
                dependencies.push({ source: firstIndex, target: secondIndex, weight: 1 });
              }
            }
          }
        }
        const marks = segments.map((_, index) => -index - 1);
        const incomingWeight = segments.map(() => 0);
        const outgoingWeight = segments.map(() => 0);
        for (const dependency of dependencies) {
          outgoingWeight[dependency.source] =
            (outgoingWeight[dependency.source] ?? 0) + dependency.weight;
          incomingWeight[dependency.target] =
            (incomingWeight[dependency.target] ?? 0) + dependency.weight;
        }
        const sinks = segments.flatMap((_, index) => (outgoingWeight[index] === 0 ? [index] : []));
        const sources = segments.flatMap((_, index) =>
          outgoingWeight[index] !== 0 && incomingWeight[index] === 0 ? [index] : [],
        );
        const unprocessed = new Set(segments.map((_, index) => index));
        let nextLeft = segments.length + 1;
        let nextRight = segments.length - 1;
        const removeMarked = (index: number) => {
          if (!unprocessed.delete(index)) return;
          for (const dependency of dependencies) {
            if (dependency.weight <= 0) continue;
            if (dependency.source === index && unprocessed.has(dependency.target)) {
              incomingWeight[dependency.target] =
                (incomingWeight[dependency.target] ?? 0) - dependency.weight;
              if (
                incomingWeight[dependency.target]! <= 0 &&
                outgoingWeight[dependency.target]! > 0
              ) {
                sources.push(dependency.target);
              }
            } else if (dependency.target === index && unprocessed.has(dependency.source)) {
              outgoingWeight[dependency.source] =
                (outgoingWeight[dependency.source] ?? 0) - dependency.weight;
              if (
                outgoingWeight[dependency.source]! <= 0 &&
                incomingWeight[dependency.source]! > 0
              ) {
                sinks.push(dependency.source);
              }
            }
          }
        };
        while (unprocessed.size > 0) {
          while (sinks.length > 0) {
            const sink = sinks.shift()!;
            if (!unprocessed.has(sink)) continue;
            marks[sink] = nextRight--;
            removeMarked(sink);
          }
          while (sources.length > 0) {
            const source = sources.shift()!;
            if (!unprocessed.has(source)) continue;
            marks[source] = nextLeft++;
            removeMarked(source);
          }
          if (unprocessed.size === 0) break;
          let maximumOutflow = Number.NEGATIVE_INFINITY;
          let maximum: number[] = [];
          for (const index of unprocessed) {
            const outflow = (outgoingWeight[index] ?? 0) - (incomingWeight[index] ?? 0);
            if (outflow > maximumOutflow) {
              maximumOutflow = outflow;
              maximum = [index];
            } else if (outflow === maximumOutflow) {
              maximum.push(index);
            }
          }
          const selected = maximum[splineRankRandom.nextInt(maximum.length)]!;
          marks[selected] = nextLeft++;
          removeMarked(selected);
        }
        const shiftBase = segments.length + 1;
        for (let index = 0; index < marks.length; index++) {
          if (marks[index]! < segments.length) marks[index]! += shiftBase;
        }
        const acyclicDependencies = dependencies.flatMap((dependency) => {
          if (marks[dependency.source]! <= marks[dependency.target]!) return [dependency];
          return dependency.weight > 0
            ? [
                {
                  source: dependency.target,
                  target: dependency.source,
                  weight: dependency.weight,
                },
              ]
            : [];
        });
        const incoming = segments.map(() => 0);
        for (const dependency of acyclicDependencies) incoming[dependency.target]++;
        const queue = incoming.flatMap((count, index) => (count === 0 ? [index] : []));
        const rank = segments.map(() => 0);
        for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
          const source = queue[queueIndex]!;
          for (const { target } of acyclicDependencies.filter(
            (dependency) => dependency.source === source,
          )) {
            rank[target] = Math.max(rank[target] ?? 0, (rank[source] ?? 0) + 1);
            incoming[target]!--;
            if (incoming[target] === 0) queue.push(target);
          }
        }
        const rankedSlots = Math.max(...rank) + 1;
        const greedyCompletesFourSegmentOrder =
          candidates.length === 4 &&
          rankedSlots === 3 &&
          input.settings["crossingMinimization.strategy"] === "NONE" &&
          (input.settings["crossingMinimization.greedySwitch.type"] ?? "OFF") !== "OFF";
        nonStraightByGap[gap] = Math.min(
          candidates.length,
          Math.max(
            0,
            ...candidates.map((candidate, index) =>
              candidate.straight ? 0 : (rank[index] ?? 0) + 1,
            ),
          ) + Number(greedyCompletesFourSegmentOrder),
        );
        for (const [index, candidate] of candidates.entries()) {
          splineTrackRankByEdgeId.set(candidate.edgeId, {
            gap,
            rank: rank[index] ?? 0,
            slots: nonStraightByGap[gap] ?? 1,
          });
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

    const splineTrackByEdgeId = new Map<string, number>();
    if (style === "SPLINES") {
      const edgeNodeSpacing = Number(input.settings["spacing.edgeNodeBetweenLayers"] ?? 10);
      const edgeEdgeSpacing = Number(input.settings["spacing.edgeEdgeBetweenLayers"] ?? 10);
      for (const [edgeId, ranked] of splineTrackRankByEdgeId) {
        const edge = input.graph.edges.find((candidate) => candidate.id === edgeId);
        if (
          !edge?.sourceId.startsWith("__layout_dummy:") ||
          !edge.targetId.startsWith("__layout_dummy:")
        ) {
          continue;
        }
        const physicalRank = reverse ? ranked.slots - ranked.rank - 1 : ranked.rank;
        const offset = edgeNodeSpacing + physicalRank * edgeEdgeSpacing;
        splineTrackByEdgeId.set(
          edgeId,
          reverse
            ? (flowLayers[ranked.gap + 1]?.start ?? 0) - offset
            : (flowLayers[ranked.gap]?.end ?? 0) + offset,
        );
      }
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

      if (input.settings.feedbackEdges === true && orientation.reversedEdgeIds.has(edge.id)) {
        const spacing = Number(input.settings["spacing.edgeNode"] ?? 10);
        if (horizontal) {
          const sign = reverse ? -1 : 1;
          const start = {
            x: sign > 0 ? sourceRect.x + sourceRect.width : sourceRect.x,
            y: sourceRect.y + sourceRect.height / 2,
          };
          const end = {
            x: sign > 0 ? targetRect.x : targetRect.x + targetRect.width,
            y: targetRect.y + targetRect.height / 2,
          };
          const outerCross =
            Math.max(...[...placement.rectByNodeId.values()].map((rect) => rect.y + rect.height)) +
            spacing;
          pointsByEdgeId.set(edge.id, [
            start,
            { x: start.x + sign * spacing, y: start.y },
            { x: start.x + sign * spacing, y: outerCross },
            { x: end.x - sign * spacing, y: outerCross },
            { x: end.x - sign * spacing, y: end.y },
            end,
          ]);
        } else {
          const sign = reverse ? -1 : 1;
          const start = {
            x: sourceRect.x + sourceRect.width / 2,
            y: sign > 0 ? sourceRect.y + sourceRect.height : sourceRect.y,
          };
          const end = {
            x: targetRect.x + targetRect.width / 2,
            y: sign > 0 ? targetRect.y : targetRect.y + targetRect.height,
          };
          const outerCross =
            Math.max(...[...placement.rectByNodeId.values()].map((rect) => rect.x + rect.width)) +
            spacing;
          pointsByEdgeId.set(edge.id, [
            start,
            { x: start.x, y: start.y + sign * spacing },
            { x: outerCross, y: start.y + sign * spacing },
            { x: outerCross, y: end.y - sign * spacing },
            { x: end.x, y: end.y - sign * spacing },
            end,
          ]);
        }
        continue;
      }

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
        orthogonalTrackByEdgeId.get(edge.id) ??
        conservativeSplineTrackByEdgeId.get(edge.id) ??
        splineTrackByEdgeId.get(edge.id) ??
        (earlier && later && earlierLayer !== laterLayer
          ? (earlier.end + later.start) / 2
          : horizontal
            ? (start.x + end.x) / 2
            : (start.y + end.y) / 2);
      const orthogonalDetour = orthogonalDetourByEdgeId.get(edge.id);
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
        const midpointCross = (sourceCross + targetCross) / 2;
        const centerCross =
          Math.abs(sourceCross - targetCross) < 0.2
            ? midpointCross
            : midpointCross + (targetCross - sourceCross) * 0.4 * degreeDifference;
        const centerFlow = track;
        splineMiddle.push(
          start,
          horizontal ? { x: centerFlow, y: centerCross } : { x: centerCross, y: centerFlow },
        );
        const sourceDummy = edge.sourceId.startsWith("__layout_dummy:");
        const targetDummy = edge.targetId.startsWith("__layout_dummy:");
        if (sourceDummy || targetDummy) {
          const sourceBounds = flowLayers[sourceLayer];
          const targetBounds = flowLayers[targetLayer];
          const sourceFlow = horizontal ? start.x : start.y;
          const targetFlow = horizontal ? end.x : end.y;
          const flowSign = Math.sign(targetFlow - sourceFlow) || 1;
          const sourceBoundary = sourceBounds
            ? flowSign > 0
              ? sourceBounds.end
              : sourceBounds.start
            : sourceFlow;
          const targetBoundary = targetBounds
            ? flowSign > 0
              ? targetBounds.start
              : targetBounds.end
            : targetFlow;
          const at = (flowValue: number, crossValue: number): Point =>
            horizontal ? { x: flowValue, y: crossValue } : { x: crossValue, y: flowValue };
          if (Math.abs(sourceCross - targetCross) < 0.2) {
            splineNubControlsByEdgeId.set(edge.id, [
              at((sourceBoundary + targetBoundary) / 2, (sourceCross + targetCross) / 2),
            ]);
          } else if (!sourceDummy && targetDummy) {
            splineNubControlsByEdgeId.set(edge.id, [
              at(centerFlow, targetCross),
              at(targetBoundary, targetCross),
            ]);
          } else if (sourceDummy && !targetDummy) {
            splineNubControlsByEdgeId.set(edge.id, [
              at(sourceBoundary, sourceCross),
              at(centerFlow, sourceCross),
            ]);
          } else {
            splineNubControlsByEdgeId.set(edge.id, [
              at(sourceBoundary, sourceCross),
              at(centerFlow, sourceCross),
              at(centerFlow, targetCross),
              at(targetBoundary, targetCross),
            ]);
          }
        }
      }
      const middle =
        style === "POLYLINE"
          ? polylineMiddle
          : style === "SPLINES"
            ? splineMiddle
            : orthogonalDetour && horizontal
              ? [
                  { x: orthogonalDetour.firstTrack, y: start.y },
                  { x: orthogonalDetour.firstTrack, y: orthogonalDetour.crossover },
                  { x: orthogonalDetour.secondTrack, y: orthogonalDetour.crossover },
                  { x: orthogonalDetour.secondTrack, y: end.y },
                ]
              : orthogonalDetour
                ? [
                    { x: start.x, y: orthogonalDetour.firstTrack },
                    { x: orthogonalDetour.crossover, y: orthogonalDetour.firstTrack },
                    { x: orthogonalDetour.crossover, y: orthogonalDetour.secondTrack },
                    { x: end.x, y: orthogonalDetour.secondTrack },
                  ]
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

    return { pointsByEdgeId, splineNubControlsByEdgeId };
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
    const side = sideByPort.get(group[0]!);
    if (constraints === "FIXED_ORDER" && (side === "SOUTH" || side === "WEST")) {
      group.reverse();
    }
  }
  return ports.map((port) => {
    const size = { width: port.width ?? 8, height: port.height ?? 8 };
    const configuredSide = portSettings?.(port)?.["port.side"];
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
      if (
        constraints === "FIXED_POS" &&
        configuredSide !== "NORTH" &&
        configuredSide !== "SOUTH" &&
        configuredSide !== "WEST" &&
        configuredSide !== "EAST"
      ) {
        return { ...port, ...size, x: port.x, y: port.y };
      }
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
    const configuredAxisStart = Number(
      side === "NORTH" || side === "SOUTH" ? (surrounding.left ?? 0) : (surrounding.top ?? 0),
    );
    const configuredAxisEnd = Number(
      side === "NORTH" || side === "SOUTH" ? (surrounding.right ?? 0) : (surrounding.bottom ?? 0),
    );
    const axisStart = Math.max(0, configuredAxisStart - (configuredAxisStart > 0 ? 1 : 0));
    const axisEnd = Math.max(0, configuredAxisEnd - (configuredAxisEnd > 0 ? 1 : 0));
    const availableAxisSize = Math.max(0, axisSize - axisStart - axisEnd);
    const portAxisSize = side === "NORTH" || side === "SOUTH" ? size.width : size.height;
    const spacing = Number(nodeSettings?.["spacing.portPort"] ?? 10);
    const occupied = group.length * portAxisSize + Math.max(0, group.length - 1) * spacing;
    const portLabelsInside = String(nodeSettings?.["portLabels.placement"] ?? "OUTSIDE").includes(
      "INSIDE",
    );
    const spaceEfficientPortLabels =
      String(nodeSettings?.["portLabels.placement"] ?? "").includes("SPACE_EFFICIENT") ||
      String(nodeSettings?.["nodeSize.options"] ?? "").includes("SPACE_EFFICIENT_PORT_LABELS");
    const accountForPortLabels =
      String(nodeSettings?.["nodeSize.constraints"] ?? "").includes("PORT_LABELS") &&
      portLabelsInside;
    const margins = group.map((candidate) => {
      if (!accountForPortLabels) return 0;
      const candidateSettings = portSettings?.(candidate) as
        | (ElkLayeredOptionValueByName & {
            "port.labelWidth"?: number;
            "port.labelHeight"?: number;
          })
        | undefined;
      const labelAxisSize =
        side === "NORTH" || side === "SOUTH"
          ? (candidateSettings?.["port.labelWidth"] ?? 0)
          : (candidateSettings?.["port.labelHeight"] ?? 0);
      const candidateAxisSize =
        side === "NORTH" || side === "SOUTH" ? (candidate.width ?? 8) : (candidate.height ?? 8);
      return Math.max(0, (labelAxisSize - candidateAxisSize) / 2);
    });
    if (String(nodeSettings?.["nodeSize.options"] ?? "").includes("UNIFORM_PORT_SPACING")) {
      const maximum = Math.max(0, ...margins);
      margins.fill(maximum);
    }
    const occupiedWithLabels = group.reduce(
      (total, candidate, candidateIndex) =>
        total +
        (side === "NORTH" || side === "SOUTH" ? (candidate.width ?? 8) : (candidate.height ?? 8)) +
        2 * margins[candidateIndex]!,
      Math.max(0, group.length - 1) * spacing,
    );
    const portsOverhang = String(nodeSettings?.["nodeSize.options"] ?? "")
      .split(/[\s,;]+/)
      .includes("PORTS_OVERHANG");
    const axisPosition = spaceEfficientPortLabels
      ? (() => {
          const rightMargins = group.map((candidate, candidateIndex) => {
            if (candidateIndex === 0 || candidateIndex === group.length - 1) return 0;
            const settings = portSettings?.(candidate) as
              | (ElkLayeredOptionValueByName & { "port.labelWidth"?: number })
              | undefined;
            return (
              Number(settings?.["port.labelWidth"] ?? 0) +
              (side === "NORTH" || side === "SOUTH"
                ? Number(nodeSettings?.["spacing.labelPortHorizontal"] ?? 1)
                : 0)
            );
          });
          const minimum =
            group.reduce(
              (sum, candidate, candidateIndex) =>
                sum +
                (side === "NORTH" || side === "SOUTH"
                  ? (candidate.width ?? 8)
                  : (candidate.height ?? 8)) +
                rightMargins[candidateIndex]!,
              Math.max(0, group.length - 1) * spacing,
            ) +
            2 * spacing;
          const distributedSpacing = spacing + (availableAxisSize - minimum) / (group.length + 1);
          let current = axisStart + distributedSpacing;
          for (let candidateIndex = 0; candidateIndex < index; candidateIndex++) {
            const candidate = group[candidateIndex]!;
            current +=
              (side === "NORTH" || side === "SOUTH"
                ? (candidate.width ?? 8)
                : (candidate.height ?? 8)) +
              rightMargins[candidateIndex]! +
              distributedSpacing;
          }
          return Math.round((current + portAxisSize / 2) * 1e12) / 1e12;
        })()
      : alignmentName === "BEGIN"
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
              : accountForPortLabels
                ? (() => {
                    const minimum = occupiedWithLabels + 2 * spacing;
                    const distributedSpacing =
                      spacing + (availableAxisSize - minimum) / (group.length + 1);
                    let current = axisStart + distributedSpacing;
                    for (let candidateIndex = 0; candidateIndex < index; candidateIndex++) {
                      const candidate = group[candidateIndex]!;
                      current +=
                        2 * margins[candidateIndex]! +
                        (side === "NORTH" || side === "SOUTH"
                          ? (candidate.width ?? 8)
                          : (candidate.height ?? 8)) +
                        distributedSpacing;
                    }
                    return current + margins[index]! + portAxisSize / 2;
                  })()
                : portsOverhang && availableAxisSize < occupied + 2 * spacing
                  ? axisStart +
                    (availableAxisSize - occupied) / 2 +
                    index * (portAxisSize + spacing) +
                    portAxisSize / 2
                  : axisStart +
                    portAxisSize / 2 +
                    ((index + 1) * (availableAxisSize - group.length * portAxisSize)) /
                      (group.length + 1) +
                    index * portAxisSize;
    const integerizeAxis =
      (side === "NORTH" || side === "SOUTH") && (configuredAxisStart > 0 || configuredAxisEnd > 0);
    const resolvedAxisPosition = integerizeAxis ? Math.round(axisPosition) : axisPosition;
    const ratio = axisSize === 0 ? 0.5 : resolvedAxisPosition / axisSize;
    const borderOffset = Number(portSettings?.(port)?.["port.borderOffset"] ?? 0);
    return {
      ...port,
      ...size,
      x:
        side === "EAST"
          ? rect.width + borderOffset
          : side === "WEST"
            ? -size.width - borderOffset
            : spaceEfficientPortLabels
              ? axisPosition - size.width / 2
              : ratio * rect.width - size.width / 2,
      y:
        side === "SOUTH"
          ? rect.height + borderOffset
          : side === "NORTH"
            ? -size.height - borderOffset
            : spaceEfficientPortLabels
              ? axisPosition - size.height / 2
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
