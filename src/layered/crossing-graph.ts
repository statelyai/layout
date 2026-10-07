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
  return createCrossingGraphBuilder(input)(orientation, layers, incoming, outgoing);
}

/**
 * Reusable {@link crossingGraph} for repeated counts over one phase input.
 * Port keys and node/port settings are memoized, so the input's settings must
 * not change while the builder is in use.
 */
export function createCrossingGraphBuilder(input: LayeredPhaseInput) {
  const keys = new Map<string, Map<string, string>>();
  const key = (id: string, name: string) => {
    let byName = keys.get(id);
    if (!byName) keys.set(id, (byName = new Map()));
    let value = byName.get(name);
    if (value === undefined) byName.set(name, (value = JSON.stringify([id, name])));
    return value;
  };
  const nodeInfo = new Map<GraphNode, { constraints: unknown; hypernode: boolean }>();
  const infoOf = (node: GraphNode) => {
    let info = nodeInfo.get(node);
    if (!info) {
      const settings = input.nodeSettings?.(node);
      info = { constraints: settings?.portConstraints, hypernode: settings?.hypernode === true };
      nodeInfo.set(node, info);
    }
    return info;
  };
  const portInfo = new Map<
    GraphNode,
    Map<
      string,
      { authored?: NonNullable<GraphNode["ports"]>[number]; index: number; side?: string }
    >
  >();
  const authoredPort = (node: GraphNode, name: string) => {
    let byName = portInfo.get(node);
    if (!byName) portInfo.set(node, (byName = new Map()));
    let info = byName.get(name);
    if (!info) {
      const index = node.ports?.findIndex((port) => port.name === name) ?? -1;
      const authored = index < 0 ? undefined : node.ports![index];
      info = {
        authored,
        index,
        side: authored && input.portSettings?.(authored, node)?.["port.side"],
      };
      byName.set(name, info);
    }
    return info;
  };
  const degreesByOrientation = new WeakMap<
    AcyclicOrientation,
    ReadonlyMap<string, { incoming: number; outgoing: number }>
  >();
  const degreesOf = (orientation: AcyclicOrientation) => {
    let degrees = degreesByOrientation.get(orientation);
    if (!degrees) {
      const counted = new Map<string, { incoming: number; outgoing: number }>();
      for (const edge of input.graph.edges) {
        if (edge.sourceId === edge.targetId) continue;
        const reversed = orientation.reversedEdgeIds.has(edge.id);
        for (const [nodeId, name, source] of [
          [edge.sourceId, edge.sourcePort, !reversed],
          [edge.targetId, edge.targetPort, reversed],
        ] as const) {
          if (name === undefined) continue;
          const id = key(nodeId, name),
            degree = counted.get(id) ?? { incoming: 0, outgoing: 0 };
          if (source) degree.outgoing++;
          else degree.incoming++;
          counted.set(id, degree);
        }
      }
      degreesByOrientation.set(orientation, (degrees = counted));
    }
    return degrees;
  };
  // Port identities, sides and fallback ranks depend only on the orientation;
  // each build replays them against the current port orders.
  const plans = new WeakMap<AcyclicOrientation, CrossingGraphPlan>();
  return (
    orientation: AcyclicOrientation,
    layers: readonly (readonly string[])[],
    incoming?: ReadonlyMap<string, readonly string[]>,
    outgoing?: ReadonlyMap<string, readonly string[]>,
  ): CrossingGraph => {
    let plan = plans.get(orientation);
    if (
      !plan ||
      plan.units !== getCrossingUnits(input) ||
      plan.nodes !== input.graph.nodes ||
      plan.edgeList !== input.graph.edges
    ) {
      plan = planCrossingGraph(input, orientation, key, infoOf, authoredPort, degreesOf);
      plans.set(orientation, plan);
    }
    return buildCrossingGraph(plan, layers, incoming, outgoing);
  };
}

/** One `add` of the original builder with its build-independent values resolved. */
interface PortOperation {
  nodeId: string;
  id: string;
  side: CrossingPort["side"];
  /** Incident edge whose position in the selected port order ranks the port. */
  edgeId?: string;
  source: boolean;
  /** Rank when the edge is absent from the selected port order. */
  fallback: number;
  /** FIXED_POS/FIXED_RATIO geometric rank, overriding the order rank. */
  fixedRank?: number;
  /** FIXED_POS/FIXED_RATIO shared ports keep their first rank. */
  keepRank: boolean;
  /** North/south dummy detached from this port, linked after the add. */
  northSouthDummy?: string;
}

interface CrossingGraphPlan {
  units: ReturnType<typeof getCrossingUnits>;
  nodes: LayeredPhaseInput["graph"]["nodes"];
  edgeList: LayeredPhaseInput["graph"]["edges"];
  operations: PortOperation[];
  edges: Array<{ source: string; target: string }>;
  nodeKinds: Map<string, { type: CrossingNode["type"]; unit?: string }>;
}

function planCrossingGraph(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  key: (id: string, name: string) => string,
  infoOf: (node: GraphNode) => { constraints: unknown; hypernode: boolean },
  authoredPort: (
    node: GraphNode,
    name: string,
  ) => { authored?: NonNullable<GraphNode["ports"]>[number]; index: number; side?: string },
  degreesOf: (
    orientation: AcyclicOrientation,
  ) => ReadonlyMap<string, { incoming: number; outgoing: number }>,
): CrossingGraphPlan {
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
  const degrees = degreesOf(orientation);
  const operations: PortOperation[] = [];
  // Distinct port ids per node, in first-add order, as the build's members map.
  const ports = new Map<string, Set<string>>();
  const add = (node: GraphNode, name: string, source: boolean, edge?: GraphEdge): string => {
    let members = ports.get(node.id);
    if (!members) ports.set(node.id, (members = new Set()));
    const id = key(node.id, name);
    const { authored, index: authoredIndex, side: configuredSide } = authoredPort(node, name);
    const { constraints } = infoOf(node);
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
    const keepRank = constraints === "FIXED_POS" || constraints === "FIXED_RATIO";
    let fixedRank: number | undefined;
    if (authored && keepRank) {
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
      fixedRank =
        side === "NORTH"
          ? canonicalFlow
          : side === "SOUTH"
            ? -canonicalFlow
            : side === "EAST"
              ? cross
              : -cross;
    }
    operations.push({
      nodeId: node.id,
      id,
      side,
      edgeId: edge?.id,
      source,
      fallback: authored ? authoredIndex : members.size,
      fixedRank,
      keepRank,
    });
    members.add(id);
    return id;
  };
  const endpoint = (edge: GraphEdge, source: boolean) => {
    const authoredSource = source !== orientation.reversedEdgeIds.has(edge.id);
    const node = nodes.get(authoredSource ? edge.sourceId : edge.targetId)!;
    const name = authoredSource ? edge.sourcePort : edge.targetPort;
    const merged = input.settings.mergeEdges === true || infoOf(node).hypernode;
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
    add(owner, origin.port.name, false);
    operations.at(-1)!.northSouthDummy = dummy;
  }
  const nodeKinds = new Map<string, { type: CrossingNode["type"]; unit?: string }>();
  for (const node of input.graph.nodes) {
    const id = node.id;
    nodeKinds.set(id, {
      type: id.startsWith("__layout_dummy:north-south:")
        ? "NORTH_SOUTH_PORT"
        : units?.longEdgeNodes?.has(id)
          ? "LONG_EDGE"
          : id.startsWith("__layout_dummy:label:")
            ? "LABEL"
            : "NORMAL",
      unit: units?.units.get(id),
    });
  }
  return {
    units,
    nodes: input.graph.nodes,
    edgeList: input.graph.edges,
    operations,
    edges,
    nodeKinds,
  };
}

function buildCrossingGraph(
  plan: CrossingGraphPlan,
  layers: readonly (readonly string[])[],
  incoming: ReadonlyMap<string, readonly string[]> | undefined,
  outgoing: ReadonlyMap<string, readonly string[]> | undefined,
): CrossingGraph {
  // First index of each edge id, like `indexOf`, per selected port order.
  const ranks = new Map<readonly string[], Map<string, number>>();
  const rankIn = (selected: readonly string[]) => {
    let rank = ranks.get(selected);
    if (!rank) {
      rank = new Map();
      for (let index = 0; index < selected.length; index++)
        if (!rank.has(selected[index]!)) rank.set(selected[index]!, index);
      ranks.set(selected, rank);
    }
    return rank;
  };
  const ports = new Map<string, Map<string, { port: CrossingPort; rank: number }>>();
  for (const operation of plan.operations) {
    let members = ports.get(operation.nodeId);
    if (!members) ports.set(operation.nodeId, (members = new Map()));
    const selected =
      operation.edgeId === undefined
        ? undefined
        : (operation.source ? outgoing : incoming)?.get(operation.nodeId);
    let rank = selected ? (rankIn(selected).get(operation.edgeId!) ?? -1) : -1;
    if (rank < 0) rank = operation.fallback;
    if (operation.fixedRank !== undefined) rank = operation.fixedRank;
    const existing = members.get(operation.id);
    if (existing) {
      // A shared port occupies its first position in the selected port order;
      // later incident edges must not move that one physical port.
      if (!operation.keepRank) existing.rank = Math.min(existing.rank, rank);
    } else members.set(operation.id, { port: { id: operation.id, side: operation.side }, rank });
    if (operation.northSouthDummy !== undefined) {
      members.get(operation.id)!.port.dummy = operation.northSouthDummy;
      for (const member of ports.get(operation.northSouthDummy)?.values() ?? [])
        member.port.origin = operation.id;
    }
  }
  const sideRank = { NORTH: 0, EAST: 1, SOUTH: 2, WEST: 3 };
  return {
    layers: layers.map((layer) =>
      layer.map((id) => {
        const kind = plan.nodeKinds.get(id);
        return {
          id,
          type: kind?.type ?? kindOf(id, plan.units),
          unit: kind ? kind.unit : plan.units?.units.get(id),
          ports: [...(ports.get(id)?.values() ?? [])]
            .sort((a, b) => sideRank[a.port.side] - sideRank[b.port.side] || a.rank - b.rank)
            .map((member) => member.port),
        };
      }),
    ),
    edges: plan.edges.map((edge) => ({ source: edge.source, target: edge.target })),
  };
}

/**
 * A port carrying edges of both directions attaches each direction separately
 * once routed, so a crossing between them is real. Count it: give each
 * east or west mixed port a twin for its reversed edges, after it on the
 * east side and before it on the west (so forward edges sit above), and move
 * those edges to the twin. `reversed` is index-aligned with `graph.edges`.
 */
export function splitMixedCrossingPorts(
  graph: CrossingGraph,
  reversed: readonly boolean[],
): CrossingGraph {
  const directions = new Map<string, number>();
  graph.edges.forEach((edge, index) => {
    const bit = reversed[index] ? 2 : 1;
    for (const port of [edge.source, edge.target])
      directions.set(port, (directions.get(port) ?? 0) | bit);
  });
  const mixed = new Set<string>();
  for (const layer of graph.layers)
    for (const node of layer)
      for (const port of node.ports)
        if (directions.get(port.id) === 3 && (port.side === "EAST" || port.side === "WEST"))
          mixed.add(port.id);
  if (!mixed.size) return graph;
  const twin = (id: string) => `${id}\0reversed`;
  return {
    layers: graph.layers.map((layer) =>
      layer.map((node) =>
        node.ports.some((port) => mixed.has(port.id))
          ? {
              ...node,
              ports: node.ports.flatMap((port) => {
                if (!mixed.has(port.id)) return [port];
                const other = { ...port, id: twin(port.id) };
                return port.side === "EAST" ? [port, other] : [other, port];
              }),
            }
          : node,
      ),
    ),
    edges: graph.edges.map((edge, index) =>
      reversed[index] && (mixed.has(edge.source) || mixed.has(edge.target))
        ? {
            source: mixed.has(edge.source) ? twin(edge.source) : edge.source,
            target: mixed.has(edge.target) ? twin(edge.target) : edge.target,
          }
        : edge,
    ),
  };
}

function kindOf(id: string, units: ReturnType<typeof getCrossingUnits>): CrossingNode["type"] {
  return id.startsWith("__layout_dummy:north-south:")
    ? "NORTH_SOUTH_PORT"
    : units?.longEdgeNodes?.has(id)
      ? "LONG_EDGE"
      : id.startsWith("__layout_dummy:label:")
        ? "LABEL"
        : "NORMAL";
}
