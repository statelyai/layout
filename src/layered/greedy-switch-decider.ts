/*******************************************************************************
 * Derived from ELK v0.11.0 greedyswitch.SwitchDecider, CrossingMatrixFiller,
 * BetweenLayerEdgeTwoNodeCrossingsCounter, NorthSouthEdgeNeighbouringNodeCrossingsCounter
 * and CrossingsCounter (in-layer two-node counting).
 * Copyright (c) 2015, 2020 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { CrossingGraph, CrossingNode, CrossingPort } from "./crossing-counter";

type Side = CrossingPort["side"];

/** ELK's inNorthSouthEastWestOrder: west and south ports are listed in reverse. */
function sidePorts(node: CrossingNode, side: Side): CrossingPort[] {
  const ports = node.ports.filter((port) => port.side === side);
  return side === "WEST" || side === "SOUTH" ? ports.reverse() : ports;
}

/** Port connectivity and layers; switches within layers leave it unchanged. */
export interface GreedySwitchTopology {
  incoming: Map<string, string[]>;
  outgoing: Map<string, string[]>;
  layerByPort: Map<string, number>;
  ownerByPort: Map<string, CrossingNode>;
}

export function greedySwitchTopology(graph: CrossingGraph): GreedySwitchTopology {
  const topology: GreedySwitchTopology = {
    incoming: new Map(),
    outgoing: new Map(),
    layerByPort: new Map(),
    ownerByPort: new Map(),
  };
  for (const [layer, nodes] of graph.layers.entries())
    for (const node of nodes)
      for (const port of node.ports) {
        topology.layerByPort.set(port.id, layer);
        topology.ownerByPort.set(port.id, node);
        topology.incoming.set(port.id, []);
        topology.outgoing.set(port.id, []);
      }
  for (const edge of graph.edges) {
    topology.outgoing.get(edge.source)?.push(edge.target);
    topology.incoming.get(edge.target)?.push(edge.source);
  }
  return topology;
}

interface Adjacency {
  position: number;
  cardinality: number;
  current: number;
}

/**
 * Decides greedy switches in one free layer from local two-node crossing
 * counts, exactly as ELK does; these estimates can differ from a global recount.
 */
export class GreedySwitchDecider {
  readonly #free: readonly CrossingNode[];
  readonly #incoming: ReadonlyMap<string, readonly string[]>;
  readonly #outgoing: ReadonlyMap<string, readonly string[]>;
  readonly #layerByPort: ReadonlyMap<string, number>;
  readonly #ownerByPort: ReadonlyMap<string, CrossingNode>;
  readonly #neighbourPositions = new Map<string, number>();
  readonly #adjacencies = new Map<string, { sides: Map<Side, Adjacency[]> }>();
  readonly #matrix = new Map<string, [number, number]>();
  readonly #inLayerPositions = new Map<string, number>();
  readonly #cardinality = new Map<Side, Map<string, number>>();
  readonly #inLayerSize = new Map<Side, number>();
  readonly #oneSided?: "WEST" | "EAST";

  constructor(
    graph: CrossingGraph,
    freeLayerIndex: number,
    oneSided?: "WEST" | "EAST",
    topology = greedySwitchTopology(graph),
  ) {
    this.#free = graph.layers[freeLayerIndex] ?? [];
    this.#oneSided = oneSided;
    this.#incoming = topology.incoming;
    this.#outgoing = topology.outgoing;
    this.#layerByPort = topology.layerByPort;
    this.#ownerByPort = topology.ownerByPort;
    for (const [layerIndex, side] of [
      [freeLayerIndex - 1, "EAST"],
      [freeLayerIndex + 1, "WEST"],
    ] as const) {
      let position = 0;
      for (const node of graph.layers[layerIndex] ?? [])
        for (const port of sidePorts(node, side)) this.#neighbourPositions.set(port.id, position++);
    }
    for (const side of ["WEST", "EAST"] as const) {
      const cardinality = new Map<string, number>();
      let position = 0;
      for (const node of this.#free) {
        const ports = sidePorts(node, side);
        cardinality.set(node.id, ports.length);
        for (const port of ports) this.#inLayerPositions.set(port.id, position++);
      }
      this.#cardinality.set(side, cardinality);
      this.#inLayerSize.set(side, position);
    }
  }

  /** Crossings with `upper` above `lower`, and after switching them. */
  crossings(upper: CrossingNode, lower: CrossingNode): [number, number] {
    const matrix = this.#matrixEntry(upper, lower);
    const left = this.#inLayerBothOrders(upper, lower, "WEST");
    const right = this.#inLayerBothOrders(upper, lower, "EAST");
    const northSouth = this.#northSouth(upper, lower);
    return [
      matrix[0] + left[0] + right[0] + northSouth[0],
      matrix[1] + left[1] + right[1] + northSouth[1],
    ];
  }

  /** ELK's constraintsPreventSwitch. */
  preventsSwitch(
    upper: CrossingNode,
    lower: CrossingNode,
    successors: ReadonlyMap<string, readonly string[]>,
  ): boolean {
    if (successors.get(upper.id)?.includes(lower.id)) return true;
    const hasEdgesOnSide = (node: CrossingNode, side: Side) =>
      node.ports.some(
        (port) =>
          port.side === side && (port.dummy !== undefined || this.#connected(port.id).length > 0),
      );
    const neitherIsLongEdge = upper.type !== "LONG_EDGE" && lower.type !== "LONG_EDGE";
    const differentUnits = upper.unit !== lower.unit;
    const haveUnits =
      (upper.unit !== undefined && upper.unit !== upper.id) ||
      (lower.unit !== undefined && lower.unit !== lower.id) ||
      hasEdgesOnSide(upper, "SOUTH") ||
      hasEdgesOnSide(lower, "NORTH");
    const unitConstraint =
      (haveUnits && differentUnits) ||
      hasEdgesOnSide(upper, "NORTH") ||
      hasEdgesOnSide(lower, "SOUTH");
    return (
      (neitherIsLongEdge && unitConstraint) ||
      (upper.type === "NORTH_SOUTH_PORT" && lower.type === "NORMAL") ||
      (lower.type === "NORTH_SOUTH_PORT" && upper.type === "NORMAL")
    );
  }

  notifySwitch(upper: CrossingNode, lower: CrossingNode): void {
    this.#switchPositions(upper, lower, "WEST");
    this.#switchPositions(upper, lower, "EAST");
  }

  #isInLayer(a: string, b: string): boolean {
    return this.#layerByPort.get(a) === this.#layerByPort.get(b);
  }

  #matrixEntry(upper: CrossingNode, lower: CrossingNode): [number, number] {
    const key = `${upper.id}\0${lower.id}`;
    let entry = this.#matrix.get(key);
    if (!entry) {
      entry = [0, 0];
      const sides: Side[] = this.#oneSided ? [this.#oneSided] : ["WEST", "EAST"];
      for (const side of sides) {
        const [ul, lu] = this.#mergeAdjacencies(
          this.#adjacencyList(upper, side),
          this.#adjacencyList(lower, side),
        );
        entry[0] += ul;
        entry[1] += lu;
      }
      this.#matrix.set(key, entry);
      this.#matrix.set(`${lower.id}\0${upper.id}`, [entry[1], entry[0]]);
    }
    return entry;
  }

  #adjacencyList(node: CrossingNode, side: Side): Adjacency[] {
    let cached = this.#adjacencies.get(node.id);
    if (!cached) this.#adjacencies.set(node.id, (cached = { sides: new Map() }));
    let list = cached.sides.get(side);
    if (!list) {
      list = [];
      for (const port of sidePorts(node, side)) {
        const ends = side === "WEST" ? this.#incoming.get(port.id)! : this.#outgoing.get(port.id)!;
        for (const end of ends) {
          if (this.#ownerByPort.get(end) === node || this.#isInLayer(end, port.id)) continue;
          const position = this.#neighbourPositions.get(end) ?? 0;
          const last = list.at(-1);
          // ELK merges only consecutive equal positions before its stable sort.
          if (last?.position === position) last.cardinality++;
          else list.push({ position, cardinality: 1, current: 1 });
        }
      }
      list.sort((a, b) => a.position - b.position);
      cached.sides.set(side, list);
    }
    return list;
  }

  #mergeAdjacencies(upperList: Adjacency[], lowerList: Adjacency[]): [number, number] {
    const cursor = (list: Adjacency[]) => {
      for (const adjacency of list) adjacency.current = adjacency.cardinality;
      return {
        list,
        index: 0,
        size: list.reduce((sum, adjacency) => sum + adjacency.cardinality, 0),
      };
    };
    const upper = cursor(upperList),
      lower = cursor(lowerList);
    const removeFirst = (state: ReturnType<typeof cursor>) => {
      if (state.size === 0) return;
      const entry = state.list[state.index]!;
      if (entry.current === 1) state.index++;
      else entry.current--;
      state.size--;
    };
    let upperLower = 0,
      lowerUpper = 0;
    while (upper.size !== 0 && lower.size !== 0) {
      const u = upper.list[upper.index]!,
        l = lower.list[lower.index]!;
      if (u.position > l.position) {
        upperLower += upper.size;
        removeFirst(lower);
      } else if (l.position > u.position) {
        lowerUpper += lower.size;
        removeFirst(upper);
      } else {
        upperLower += upper.size - u.current;
        lowerUpper += lower.size - l.current;
        removeFirst(upper);
        removeFirst(lower);
      }
    }
    return [upperLower, lowerUpper];
  }

  #connected(port: string): string[] {
    return [...this.#incoming.get(port)!, ...this.#outgoing.get(port)!];
  }

  #inLayerBothOrders(upper: CrossingNode, lower: CrossingNode, side: Side): [number, number] {
    const position = (port: string) => this.#inLayerPositions.get(port) ?? 0;
    // A TreeSet ordered by position: equal positions collapse into one entry.
    const byPosition = new Map<number, string>();
    for (const node of [upper, lower])
      for (const port of sidePorts(node, side))
        for (const end of this.#connected(port.id)) {
          if (this.#ownerByPort.get(end) === node) continue;
          if (!byPosition.has(position(port.id))) byPosition.set(position(port.id), port.id);
          if (this.#isInLayer(end, port.id) && !byPosition.has(position(end)))
            byPosition.set(position(end), end);
        }
    const sorted = () => [...byPosition.values()].sort((a, b) => position(a) - position(b));
    const before = this.#countInLayer(sorted(), side);
    this.#switchPositions(upper, lower, side);
    const after = this.#countInLayer(sorted(), side);
    this.#switchPositions(lower, upper, side);
    return [before, after];
  }

  #countInLayer(ports: readonly string[], side: Side): number {
    const position = (port: string) => this.#inLayerPositions.get(port) ?? 0;
    const open = Array.from({ length: Math.max(1, this.#inLayerSize.get(side)!) }, () => 0);
    let size = 0,
      crossings = 0;
    const rank = (end: number) => {
      let count = 0;
      for (let index = 0; index < end && index < open.length; index++) count += open[index]!;
      return count;
    };
    for (const port of ports) {
      const at = position(port);
      if (at < open.length) {
        size -= open[at]!;
        open[at] = 0;
      }
      let betweenLayers = 0;
      const ends: number[] = [];
      for (const end of this.#connected(port)) {
        if (this.#isInLayer(end, port)) {
          const endPosition = position(end);
          if (endPosition > at) {
            crossings += rank(endPosition);
            ends.push(endPosition);
          }
        } else betweenLayers++;
      }
      crossings += size * betweenLayers;
      for (const end of ends)
        if (end < open.length) {
          open[end]!++;
          size++;
        }
    }
    return crossings;
  }

  #switchPositions(wasUpper: CrossingNode, wasLower: CrossingNode, side: Side): void {
    const cardinality = this.#cardinality.get(side)!;
    for (const port of sidePorts(wasUpper, side))
      this.#inLayerPositions.set(
        port.id,
        (this.#inLayerPositions.get(port.id) ?? 0) + (cardinality.get(wasLower.id) ?? 0),
      );
    for (const port of sidePorts(wasLower, side))
      this.#inLayerPositions.set(
        port.id,
        (this.#inLayerPositions.get(port.id) ?? 0) - (cardinality.get(wasUpper.id) ?? 0),
      );
  }

  /** NorthSouthEdgeNeighbouringNodeCrossingsCounter. */
  #northSouth(upper: CrossingNode, lower: CrossingNode): [number, number] {
    const originSide = (dummy: CrossingNode): Side | undefined => {
      const origin = dummy.ports[0]?.origin;
      return origin === undefined ? undefined : this.#portSide(origin);
    };
    const northSouthEdges = (node: CrossingNode, side: Side) =>
      node.ports.filter((port) => port.side === side && port.dummy !== undefined).length;
    let result: [number, number] = [0, 0];
    if (
      upper.type === "NORTH_SOUTH_PORT" &&
      lower.type === "NORTH_SOUTH_PORT" &&
      upper.unit !== undefined &&
      upper.unit === lower.unit
    )
      result =
        originSide(upper) === "NORTH"
          ? this.#twoNorthSouthDummies(upper, lower)
          : this.#twoNorthSouthDummies(lower, upper);
    if (upper.type === "NORTH_SOUTH_PORT" && lower.type === "LONG_EDGE")
      result = originSide(upper) === "NORTH" ? [1, 0] : [0, 1];
    else if (lower.type === "NORTH_SOUTH_PORT" && upper.type === "LONG_EDGE")
      result = originSide(lower) === "NORTH" ? [0, 1] : [1, 0];
    if (upper.type === "NORMAL" && lower.type === "LONG_EDGE")
      result = [northSouthEdges(upper, "SOUTH"), northSouthEdges(upper, "NORTH")];
    if (lower.type === "NORMAL" && upper.type === "LONG_EDGE")
      result = [northSouthEdges(lower, "NORTH"), northSouthEdges(lower, "SOUTH")];
    return result;
  }

  #portSide(portId: string): Side | undefined {
    return this.#ownerByPort.get(portId)?.ports.find((port) => port.id === portId)?.side;
  }

  #twoNorthSouthDummies(further: CrossingNode, closer: CrossingNode): [number, number] {
    const originPosition = (dummy: CrossingNode) => {
      const origin = dummy.ports[0]?.origin;
      const owner = origin === undefined ? undefined : this.#ownerByPort.get(origin);
      const side = origin === undefined ? undefined : this.#portSide(origin);
      if (!owner || !side) return 0;
      return sidePorts(owner, side).findIndex((port) => port.id === origin);
    };
    const degree = (node: CrossingNode, side: Side) => {
      const port = node.ports.find((candidate) => candidate.side === side);
      return port ? this.#connected(port.id).length : 0;
    };
    return originPosition(further) > originPosition(closer)
      ? [degree(closer, "EAST"), degree(further, "WEST")]
      : [degree(closer, "WEST"), degree(further, "EAST")];
  }
}

/**
 * ELK's SweepCopy.assertCorrectPortSides: once crossing minimization finishes,
 * a north/south port whose dummy ended on the other side of its node changes side.
 */
export function assertNorthSouthPortSides(graph: CrossingGraph): void {
  for (const layer of graph.layers) {
    const index = new Map(layer.map((node, position) => [node.id, position]));
    for (const dummy of layer) {
      if (dummy.type !== "NORTH_SOUTH_PORT") continue;
      const origin = dummy.ports[0]?.origin;
      const owner = layer.find((node) => node.ports.some((port) => port.id === origin));
      const port = owner?.ports.find((candidate) => candidate.id === origin);
      if (!owner || !port) continue;
      if (port.side === "NORTH" && index.get(dummy.id)! > index.get(owner.id)!) port.side = "SOUTH";
      else if (port.side === "SOUTH" && index.get(owner.id)! > index.get(dummy.id)!)
        port.side = "NORTH";
    }
  }
}
