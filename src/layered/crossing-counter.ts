/*
 * Copyright (c) 2016, 2020 Kiel University and others.
 * Native adaptation of ELK AllCrossingsCounter and CrossingsCounter.
 * SPDX-License-Identifier: EPL-2.0
 */
import { scoreOrthogonalHypersegments } from "./orthogonal-hypersegments";

export interface CrossingPort {
  id: string;
  side: "NORTH" | "EAST" | "SOUTH" | "WEST";
  /** Normal cross-axis port's detached dummy. */
  dummy?: string;
  /** Detached cross-axis dummy port's original normal port. */
  origin?: string;
}
export interface CrossingNode {
  id: string;
  type: "NORMAL" | "LONG_EDGE" | "NORTH_SOUTH_PORT" | "LABEL" | "EXTERNAL_PORT";
  /** Clockwise canonical port order. */
  ports: CrossingPort[];
  unit?: string;
}
export interface CrossingGraph {
  layers: CrossingNode[][];
  edges: Array<{ source: string; target: string }>;
}
export interface CrossingScore {
  betweenLayers: number;
  inLayer: number;
  northSouth: number;
  total: number;
  /** Some hyperedge joins two or more ports on each side of its gap. */
  sharedTracks: boolean;
}

class IndexTree {
  private readonly sums: number[];
  private readonly entries: number[];
  size = 0;
  constructor(size: number) {
    this.sums = Array(size + 1).fill(0);
    this.entries = Array(size).fill(0);
  }
  add(position: number): void {
    this.entries[position]!++;
    this.size++;
    for (let i = position + 1; i < this.sums.length; i += i & -i) this.sums[i]!++;
  }
  remove(position: number): void {
    const count = this.entries[position]!;
    if (!count) return;
    this.entries[position] = 0;
    this.size -= count;
    for (let i = position + 1; i < this.sums.length; i += i & -i) this.sums[i]! -= count;
  }
  rank(position: number): number {
    let value = 0;
    for (let i = position; i > 0; i -= i & -i) value += this.sums[i]!;
    return value;
  }
}

/** Score a canonical candidate without changing its node or port orders. */
export function countAllCrossings(
  graph: CrossingGraph,
  /** "separated" counts hyperedges like ELK unless they would share a track (see scoreOrthogonalHypersegments). */
  boundaryMode: "hyperedges" | "separated" | "edges" = "hyperedges",
): CrossingScore {
  // Only north/south counting resolves nodes by id.
  let nodes: Map<string, CrossingNode> | undefined;
  const layerByPort = new Map<string, number>();
  const incoming = new Map<string, string[]>(),
    outgoing = new Map<string, string[]>();
  for (const [layer, members] of graph.layers.entries())
    for (const node of members)
      for (const port of node.ports) {
        layerByPort.set(port.id, layer);
        incoming.set(port.id, []);
        outgoing.set(port.id, []);
      }
  for (const edge of graph.edges) {
    outgoing.get(edge.source)!.push(edge.target);
    incoming.get(edge.target)!.push(edge.source);
  }
  const degree = (id: string) => incoming.get(id)!.length + outgoing.get(id)!.length;
  const face = (layer: readonly CrossingNode[], side: "EAST" | "WEST", topDown = true) =>
    (topDown ? layer : [...layer].reverse()).flatMap((node) => {
      const ports = node.ports.filter((port) => port.side === side);
      return (side === "EAST") === topDown ? ports : ports.reverse();
    });
  const countPorts = (ports: readonly CrossingPort[], inLayerOnly: boolean): number => {
    const positions = new Map(ports.map((port, index) => [port.id, index]));
    const tree = new IndexTree(ports.length);
    let crossings = 0;
    for (const [position, port] of ports.entries()) {
      tree.remove(position);
      const pending: number[] = [];
      // Incoming then outgoing peers, without concatenating them.
      const before = incoming.get(port.id)!,
        after = outgoing.get(port.id)!;
      for (let index = 0; index < before.length + after.length; index++) {
        const peer = index < before.length ? before[index]! : after[index - before.length]!;
        if (inLayerOnly && layerByPort.get(peer) !== layerByPort.get(port.id)) {
          crossings += tree.size;
          continue;
        }
        const end = positions.get(peer);
        if (end !== undefined && end > position) {
          crossings += tree.rank(end);
          pending.push(end);
        }
      }
      for (const end of pending) tree.add(end);
    }
    return crossings;
  };
  const countNorthSouth = (layer: readonly CrossingNode[]): number => {
    const ports: CrossingPort[] = [],
      stack: CrossingPort[] = [];
    const flush = () => {
      ports.push(...stack);
      stack.length = 0;
    };
    let lastUnit: string | undefined;
    for (const node of layer) {
      if (lastUnit && lastUnit !== node.id && node.unit && node.unit !== lastUnit) flush();
      if (node.unit) lastUnit = node.unit;
      if (node.type === "NORMAL") {
        ports.push(...node.ports.filter((port) => port.side === "NORTH" && port.dummy));
        flush();
        ports.push(...node.ports.filter((port) => port.side === "SOUTH" && port.dummy));
      } else if (node.type === "NORTH_SOUTH_PORT" || node.type === "LONG_EDGE") {
        const west = node.ports.find((port) => port.side === "WEST");
        const east = node.ports.find((port) => port.side === "EAST");
        if (west) ports.push(west);
        if (east) stack.unshift(east);
      }
    }
    flush();
    const positions = new Map(ports.map((port, index) => [port.id, index]));
    const ownerByPort = new Map(
      layer.flatMap((node) => node.ports.map((port) => [port.id, node] as const)),
    );
    const tree = new IndexTree(ports.length);
    let crossings = 0;
    for (const [position, port] of ports.entries()) {
      tree.remove(position);
      const node = ownerByPort.get(port.id)!;
      const targets =
        node.type === "NORMAL"
          ? (nodes ??= new Map(graph.layers.flat().map((node) => [node.id, node])))
              .get(port.dummy!)!
              .ports.map((peer) => ({ id: peer.id, degree: degree(peer.id) }))
          : node.type === "LONG_EDGE"
            ? node.ports
                .filter((peer) => peer.id !== port.id)
                .slice(0, 1)
                .map((peer) => ({ id: peer.id, degree: degree(peer.id) }))
            : port.origin
              ? [{ id: port.origin, degree: degree(port.id) }]
              : [];
      const pending: number[] = [];
      for (const target of targets) {
        const end = positions.get(target.id);
        if (end !== undefined && end > position) {
          crossings += tree.rank(end) * target.degree;
          pending.push(end);
        }
      }
      for (const end of pending) tree.add(end);
    }
    return crossings;
  };
  const score: CrossingScore = {
    betweenLayers: 0,
    inLayer: 0,
    northSouth: 0,
    total: 0,
    sharedTracks: false,
  };
  if (!graph.layers.length) return score;
  score.inLayer += countPorts(face(graph.layers[0]!, "WEST"), true);
  score.inLayer += countPorts(face(graph.layers.at(-1)!, "EAST"), true);
  for (const [index, layer] of graph.layers.entries()) {
    const next = graph.layers[index + 1];
    if (next) {
      const hyper =
        layer.some((node) =>
          node.ports.some((port) => port.side === "EAST" && degree(port.id) > 1),
        ) ||
        next.some((node) => node.ports.some((port) => port.side === "WEST" && degree(port.id) > 1));
      if (hyper && boundaryMode !== "edges") {
        const sourcePorts = layer
          .flatMap((node) => node.ports)
          .filter((port) => outgoing.get(port.id)!.some((peer) => layerByPort.get(peer) !== index));
        const targetPorts = next.flatMap((node) => {
          const connectedPorts = node.ports.filter((port) =>
            incoming.get(port.id)!.some((peer) => layerByPort.get(peer) !== index + 1),
          );
          return [
            ...connectedPorts.filter((port) => port.side === "NORTH").reverse(),
            ...connectedPorts.filter((port) => port.side !== "NORTH").reverse(),
          ];
        });
        const sources = new Set(sourcePorts.map((port) => port.id)),
          targets = new Set(targetPorts.map((port) => port.id));
        const hyperedges = scoreOrthogonalHypersegments(
          [
            ...sourcePorts.map((port, position) => ({
              id: port.id,
              side: "source" as const,
              position,
            })),
            ...targetPorts.map((port, position) => ({
              id: port.id,
              side: "target" as const,
              position,
            })),
          ],
          graph.edges.filter((edge) => sources.has(edge.source) && targets.has(edge.target)),
          boundaryMode === "separated",
        );
        score.betweenLayers += hyperedges.count;
        score.sharedTracks ||= hyperedges.shared;
        score.inLayer +=
          countPorts(face(layer, "EAST"), true) + countPorts(face(next, "WEST"), true);
      } else {
        score.betweenLayers += countPorts(
          [...face(layer, "EAST"), ...face(next, "WEST", false)],
          false,
        );
      }
    }
    if (layer.some((node) => node.type === "NORTH_SOUTH_PORT"))
      score.northSouth += countNorthSouth(layer);
  }
  score.total = score.betweenLayers + score.inLayer + score.northSouth;
  return score;
}
