import type { GraphEdge, GraphNode } from "@statelyai/graph";
import type { CrossingGraph, CrossingNode, CrossingPort } from "./crossing-counter";
import { getCrossingUnits } from "./crossing-constraints";
import type { AcyclicOrientation, LayeredPhaseInput } from "./types";

/** Translate the native candidate's physical ports into canonical clockwise order. */
export function crossingGraph(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  layers: readonly (readonly string[])[],
  incoming?: ReadonlyMap<string, readonly string[]>,
  outgoing?: ReadonlyMap<string, readonly string[]>,
): CrossingGraph {
  const units = getCrossingUnits(input);
  const nodes = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const canonicalSide = (side: string): CrossingPort["side"] => {
    const sides: Record<string, CrossingPort["side"]> =
      input.direction === "right"
        ? { NORTH: "NORTH", EAST: "EAST", SOUTH: "SOUTH", WEST: "WEST" }
        : input.direction === "left"
          ? { NORTH: "NORTH", EAST: "WEST", SOUTH: "SOUTH", WEST: "EAST" }
          : input.direction === "down"
            ? { NORTH: "WEST", EAST: "SOUTH", SOUTH: "EAST", WEST: "NORTH" }
            : { NORTH: "EAST", EAST: "SOUTH", SOUTH: "WEST", WEST: "NORTH" };
    return sides[side]!;
  };
  const key = (id: string, name: string) => JSON.stringify([id, name]);
  const degrees = new Map<string, { incoming: number; outgoing: number }>();
  for (const edge of input.graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    const reversed = orientation.reversedEdgeIds.has(edge.id);
    for (const [nodeId, name, source] of [
      [edge.sourceId, edge.sourcePort, !reversed],
      [edge.targetId, edge.targetPort, reversed],
    ] as const) {
      if (name === undefined) continue;
      const id = key(nodeId, name),
        degree = degrees.get(id) ?? { incoming: 0, outgoing: 0 };
      if (source) degree.outgoing++;
      else degree.incoming++;
      degrees.set(id, degree);
    }
  }
  const ports = new Map<string, Map<string, { port: CrossingPort; rank: number }>>();
  const add = (node: GraphNode, name: string, source: boolean, edge?: GraphEdge): string => {
    let members = ports.get(node.id);
    if (!members) ports.set(node.id, (members = new Map()));
    const id = key(node.id, name);
    const authored = node.ports?.find((port) => port.name === name);
    const configuredSide = authored && input.portSettings?.(authored, node)?.["port.side"];
    const constraints = input.nodeSettings?.(node)?.portConstraints;
    const flexible =
      constraints === undefined || constraints === "UNDEFINED" || constraints === "FREE";
    const degree = degrees.get(id);
    // The initial model-order pass requires ELK PortSideProcessor's free sides.
    // Existing non-model sweep integration retains its separate side policy.
    // Resolve these ports from cycle-broken connectivity,
    // even when an authored side was supplied. Equal degrees choose WEST.
    const side =
      flexible &&
      (input.settings["considerModelOrder.strategy"] ?? "NONE") !== "NONE" &&
      authored &&
      degree
        ? degree.outgoing > degree.incoming
          ? "EAST"
          : "WEST"
        : configuredSide
          ? canonicalSide(configuredSide)
          : source
            ? "EAST"
            : "WEST";
    const selected = (source ? outgoing : incoming)?.get(node.id);
    let rank = edge ? (selected?.indexOf(edge.id) ?? -1) : -1;
    if (rank < 0) rank = authored ? node.ports!.indexOf(authored) : members.size;
    if (authored && (constraints === "FIXED_POS" || constraints === "FIXED_RATIO")) {
      const vertical = input.direction === "down" || input.direction === "up";
      const reverse = input.direction === "left" || input.direction === "up";
      const size = input.sizes.get(node.id)!;
      const cross = vertical
        ? (authored.x ?? 0) + (authored.width ?? 0) / 2
        : (authored.y ?? 0) + (authored.height ?? 0) / 2;
      const flow = vertical
        ? (authored.y ?? 0) + (authored.height ?? 0) / 2
        : (authored.x ?? 0) + (authored.width ?? 0) / 2;
      const canonicalFlow = reverse ? (vertical ? size.height : size.width) - flow : flow;
      rank =
        side === "NORTH"
          ? canonicalFlow
          : side === "SOUTH"
            ? -canonicalFlow
            : side === "EAST"
              ? cross
              : -cross;
    }
    const existing = members.get(id);
    if (existing) {
      // A shared port occupies its first position in the selected port order;
      // later incident edges must not move that one physical port.
      if (constraints !== "FIXED_POS" && constraints !== "FIXED_RATIO")
        existing.rank = Math.min(existing.rank, rank);
      return id;
    }
    members.set(id, { port: { id, side }, rank });
    return id;
  };
  const endpoint = (edge: GraphEdge, source: boolean) => {
    const authoredSource = source !== orientation.reversedEdgeIds.has(edge.id);
    const node = nodes.get(authoredSource ? edge.sourceId : edge.targetId)!;
    const name = authoredSource ? edge.sourcePort : edge.targetPort;
    const merged =
      input.settings.mergeEdges === true || input.nodeSettings?.(node)?.hypernode === true;
    return add(
      node,
      name ?? (merged ? `__implicit:${source}` : `__implicit:${edge.id}:${source}`),
      source,
      edge,
    );
  };
  const edges = input.graph.edges
    .filter((edge) => edge.sourceId !== edge.targetId)
    .map((edge) => ({ source: endpoint(edge, true), target: endpoint(edge, false) }));
  // Real ELK retains ports with no incident edge in this scope.
  for (const node of input.graph.nodes)
    for (const port of node.ports ?? []) {
      if (!ports.get(node.id)?.has(key(node.id, port.name)))
        add(node, port.name, port.direction === "out");
    }
  for (const [dummy, origin] of units?.northSouthOrigins ?? []) {
    const owner = nodes.get(origin.node.id)!;
    const original = add(owner, origin.port.name, false);
    ports.get(owner.id)!.get(original)!.port.dummy = dummy;
    for (const member of ports.get(dummy)?.values() ?? []) member.port.origin = original;
  }
  const sideRank = { NORTH: 0, EAST: 1, SOUTH: 2, WEST: 3 };
  return {
    layers: layers.map((layer) =>
      layer.map((id) => {
        const type: CrossingNode["type"] = id.startsWith("__layout_dummy:north-south:")
          ? "NORTH_SOUTH_PORT"
          : units?.longEdgeNodes?.has(id)
            ? "LONG_EDGE"
            : id.startsWith("__layout_dummy:label:")
              ? "LABEL"
              : "NORMAL";
        return {
          id,
          type,
          unit: units?.units.get(id),
          ports: [...(ports.get(id)?.values() ?? [])]
            .sort((a, b) => sideRank[a.port.side] - sideRank[b.port.side] || a.rank - b.rank)
            .map((member) => member.port),
        };
      }),
    ),
    edges,
  };
}
