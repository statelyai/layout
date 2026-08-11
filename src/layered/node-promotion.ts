import type { GraphEdge } from "@statelyai/graph";
import type { AcyclicOrientation, LayerAssignment, LayeredPhaseInput } from "./types";

function endpoints(edge: GraphEdge, orientation: AcyclicOrientation): readonly [string, string] {
  return orientation.reversedEdgeIds.has(edge.id)
    ? [edge.targetId, edge.sourceId]
    : [edge.sourceId, edge.targetId];
}

function dummyCount(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  ranks: ReadonlyMap<string, number>,
): number {
  return input.graph.edges.reduce((total, edge) => {
    const [source, target] = endpoints(edge, orientation);
    return total + Math.max(0, (ranks.get(target) ?? 0) - (ranks.get(source) ?? 0) - 1);
  }, 0);
}

function layerWidths(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  ranks: ReadonlyMap<string, number>,
  pixels: boolean,
): number[] {
  const count = Math.max(0, ...ranks.values()) + 1;
  const result = Array.from({ length: count }, () => 0);
  for (const node of input.graph.nodes) {
    const rank = ranks.get(node.id) ?? 0;
    result[rank] =
      (result[rank] ?? 0) +
      (pixels
        ? ((input.direction === "left" || input.direction === "right"
            ? input.sizes.get(node.id)?.height
            : input.sizes.get(node.id)?.width) ?? 0) + input.spacing.node
        : 1);
  }
  for (const edge of input.graph.edges) {
    const [source, target] = endpoints(edge, orientation);
    for (let rank = (ranks.get(source) ?? 0) + 1; rank < (ranks.get(target) ?? 0); rank++) {
      result[rank] =
        (result[rank] ?? 0) +
        (pixels ? Number(input.settings["spacing.edgeNodeBetweenLayers"] ?? 10) : 1);
    }
  }
  return result;
}

function normalize(ranks: Map<string, number>): void {
  const used = [...new Set(ranks.values())].sort((a, b) => a - b);
  const normalized = new Map(used.map((rank, index) => [rank, index]));
  for (const [id, rank] of ranks) ranks.set(id, normalized.get(rank) ?? rank);
}

/** Nikolov-style recursive promotion after phase-2 layering. */
export function applyNodePromotion(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  assignment: LayerAssignment,
): LayerAssignment {
  const strategy = String(input.settings["layering.nodePromotion.strategy"] ?? "NONE");
  if (strategy === "NONE") return assignment;
  if (strategy === "MODEL_ORDER_LEFT_TO_RIGHT" || strategy === "MODEL_ORDER_RIGHT_TO_LEFT") {
    return applyModelOrderPromotion(
      input,
      orientation,
      assignment,
      strategy.endsWith("LEFT_TO_RIGHT"),
    );
  }
  let ranks = new Map(assignment.layerByNodeId);
  normalize(ranks);
  const baselineCountWidth = Math.max(...layerWidths(input, orientation, ranks, false));
  const baselinePixelWidth = Math.max(...layerWidths(input, orientation, ranks, true));
  const initialDummyCount = dummyCount(input, orientation, ranks);
  const incoming = new Map(input.graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of input.graph.edges) {
    const [source, target] = endpoints(edge, orientation);
    incoming.get(target)?.push(source);
  }
  const maxIterations = Number(input.settings["layering.nodePromotion.maxIterations"] ?? 0);
  const percentageLimit =
    strategy === "NODECOUNT_PERCENTAGE"
      ? Math.ceil((input.graph.nodes.length * maxIterations) / 100)
      : strategy === "DUMMYNODE_PERCENTAGE"
        ? Math.ceil((initialDummyCount * maxIterations) / 100)
        : Number.POSITIVE_INFINITY;
  let iterations = 0;
  let reduced = 0;
  let changed: boolean;
  do {
    changed = false;
    for (const node of input.graph.nodes) {
      if ((incoming.get(node.id)?.length ?? 0) === 0) continue;
      const candidate = new Map(ranks);
      const visiting = new Set<string>();
      const promote = (id: string): boolean => {
        if (visiting.has(id)) return false;
        visiting.add(id);
        const next = (candidate.get(id) ?? 0) - 1;
        if (next < 0) return false;
        candidate.set(id, next);
        for (const predecessor of incoming.get(id) ?? []) {
          if ((candidate.get(predecessor) ?? 0) >= next && !promote(predecessor)) return false;
        }
        return true;
      };
      const before = dummyCount(input, orientation, ranks);
      if (!promote(node.id)) continue;
      normalize(candidate);
      const after = dummyCount(input, orientation, candidate);
      if (after >= before) continue;
      const respectsBoundary =
        strategy === "NIKOLOV"
          ? Math.max(...layerWidths(input, orientation, candidate, false)) <= baselineCountWidth
          : strategy === "NIKOLOV_PIXEL"
            ? Math.max(...layerWidths(input, orientation, candidate, true)) <= baselinePixelWidth
            : true;
      if (!respectsBoundary) continue;
      ranks = candidate;
      reduced += before - after;
      changed = true;
    }
    iterations++;
    const belowBoundary =
      strategy === "NODECOUNT_PERCENTAGE"
        ? iterations < percentageLimit
        : strategy === "DUMMYNODE_PERCENTAGE"
          ? reduced < percentageLimit
          : true;
    if (!belowBoundary) break;
  } while (changed && iterations <= input.graph.nodes.length * 2);
  return { layerByNodeId: ranks };
}

function applyModelOrderPromotion(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  assignment: LayerAssignment,
  leftToRight: boolean,
): LayerAssignment {
  const ranks = new Map(assignment.layerByNodeId);
  const order = new Map(input.graph.nodes.map((node, index) => [node.id, index]));
  const edges = input.graph.edges.map((edge) => endpoints(edge, orientation));
  if (
    leftToRight &&
    (input.settings["layering.strategy"] ?? "NETWORK_SIMPLEX") === "NETWORK_SIMPLEX"
  ) {
    for (const [source, target] of edges) {
      if ((order.get(source) ?? 0) <= (order.get(target) ?? 0)) continue;
      ranks.set(target, ranks.get(source) ?? 0);
    }
    normalize(ranks);
    return { layerByNodeId: ranks };
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of leftToRight ? input.graph.nodes : [...input.graph.nodes].reverse()) {
      const rank = ranks.get(node.id) ?? 0;
      const next = rank + (leftToRight ? 1 : -1);
      if (next < 0) continue;
      const peers = input.graph.nodes.filter(
        (candidate) => (ranks.get(candidate.id) ?? 0) === rank,
      );
      const allows = peers.every((peer) =>
        leftToRight
          ? (order.get(peer.id) ?? 0) <= (order.get(node.id) ?? 0)
          : (order.get(peer.id) ?? 0) >= (order.get(node.id) ?? 0),
      );
      if (!allows) continue;
      const nextPeers = input.graph.nodes.filter(
        (candidate) => (ranks.get(candidate.id) ?? 0) === next,
      );
      if (
        !nextPeers.some((peer) =>
          leftToRight
            ? (order.get(peer.id) ?? 0) < (order.get(node.id) ?? 0)
            : (order.get(peer.id) ?? 0) > (order.get(node.id) ?? 0),
        )
      )
        continue;
      const candidate = new Map(ranks).set(node.id, next);
      if (
        edges.every(
          ([source, target]) => (candidate.get(source) ?? 0) < (candidate.get(target) ?? 0),
        )
      ) {
        ranks.set(node.id, next);
        changed = true;
      }
    }
  }
  normalize(ranks);
  return { layerByNodeId: ranks };
}
