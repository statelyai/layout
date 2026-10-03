/*
 * Copyright (c) 2016, 2020 Kiel University and others.
 * Native adaptation of ELK AbstractBarycenterPortDistributor,
 * NodeRelativePortDistributor and LayerTotalPortDistributor.
 * SPDX-License-Identifier: EPL-2.0
 */
import type { CrossingGraph, CrossingNode, CrossingPort } from "./crossing-counter";

export interface PortDistributionState {
  ranks: Record<string, number>;
  barycenters: Record<string, number>;
  positions: Record<string, number>;
}
export interface PortDistributionOptions {
  nodeRelative: boolean;
  fixedOrder: ReadonlySet<string>;
  hierarchical: ReadonlySet<string>;
}

/** Stateful clockwise port distribution across successive layer sweeps. */
export class CanonicalPortDistributor {
  readonly state: PortDistributionState;
  constructor(graph: CrossingGraph, state?: PortDistributionState) {
    this.state = state ? structuredClone(state) : { ranks: {}, barycenters: {}, positions: {} };
    for (const layer of graph.layers)
      for (const [position, node] of layer.entries()) {
        this.state.positions[node.id] ??= position;
        for (const port of node.ports) {
          this.state.ranks[port.id] ??= 0;
          this.state.barycenters[port.id] ??= 0;
        }
      }
  }

  distribute(
    graph: CrossingGraph,
    index: number,
    forward: boolean,
    options: PortDistributionOptions,
  ): void {
    const owner = new Map<string, CrossingNode>(),
      layerByPort = new Map<string, number>();
    const nodes = new Map(graph.layers.flat().map((node) => [node.id, node]));
    const incoming = new Map<string, string[]>(),
      outgoing = new Map<string, string[]>();
    for (const [layer, members] of graph.layers.entries())
      for (const node of members)
        for (const port of node.ports) {
          owner.set(port.id, node);
          layerByPort.set(port.id, layer);
          incoming.set(port.id, []);
          outgoing.set(port.id, []);
        }
    for (const edge of graph.edges) {
      incoming.get(edge.target)!.push(edge.source);
      outgoing.get(edge.source)!.push(edge.target);
    }
    const degree = (port: string) => incoming.get(port)!.length + outgoing.get(port)!.length;
    const ranks = (layer: CrossingNode[], input: boolean) => {
      let consumed = 0;
      for (const node of layer) {
        const ports = node.ports.filter(
          (port) => (input ? incoming : outgoing).get(port.id)!.length > 0,
        );
        const increment = options.nodeRelative ? 1 / (ports.length + 1) : 1;
        if (input) {
          let north = consumed + ports.filter((port) => port.side === "NORTH").length * increment;
          let rest = options.nodeRelative ? consumed + 1 - increment : consumed + ports.length;
          for (const port of ports) {
            this.state.ranks[port.id] = port.side === "NORTH" ? north : rest;
            if (port.side === "NORTH") north -= increment;
            else rest -= increment;
          }
        } else {
          let position = consumed + increment;
          for (const port of ports) {
            this.state.ranks[port.id] = position;
            position += increment;
          }
        }
        consumed += options.nodeRelative ? 1 : ports.length;
      }
    };
    const distributeNode = (node: CrossingNode, side: "EAST" | "WEST") => {
      if (options.fixedOrder.has(node.id)) return;
      const layerIndex = node.ports.length ? layerByPort.get(node.ports[0]!.id)! : index;
      const size = graph.layers[layerIndex]!.length;
      for (const face of [side, "SOUTH", "NORTH"] as const) {
        let minimum = 0,
          maximum = 0;
        const inLayer: CrossingPort[] = [];
        for (const port of node.ports.filter((port) => port.side === face)) {
          let sum = 0;
          const cross = port.side === "NORTH" || port.side === "SOUTH";
          if (cross) {
            if (!port.dummy) continue;
            const dummy = nodes.get(port.dummy)!;
            let input = false,
              output = false;
            for (const peer of dummy.ports) {
              if (peer.origin !== port.id) continue;
              if (outgoing.get(peer.id)!.length) output = true;
              else if (incoming.get(peer.id)!.length) input = true;
            }
            const position = this.state.positions[dummy.id]!;
            const large = 2 * size + 1;
            if (input && !output) sum += port.side === "NORTH" ? -position : large - position;
            else if (output && !input) sum += position + 1;
            else if (input && output) sum += port.side === "NORTH" ? 0 : large / 2;
          } else {
            const peers = [...outgoing.get(port.id)!, ...incoming.get(port.id)!];
            if (peers.some((peer) => layerByPort.get(peer) === layerIndex)) {
              inLayer.push(port);
              continue;
            }
            for (const peer of outgoing.get(port.id)!) sum += this.state.ranks[peer]!;
            for (const peer of incoming.get(port.id)!) sum -= this.state.ranks[peer]!;
          }
          if (degree(port.id)) {
            const value = sum / degree(port.id);
            this.state.barycenters[port.id] = value;
            minimum = Math.min(minimum, value);
            maximum = Math.max(maximum, value);
          } else if (cross) this.state.barycenters[port.id] = sum;
        }
        for (const port of inLayer) {
          const peers = [...incoming.get(port.id)!, ...outgoing.get(port.id)!].filter(
            (peer) => layerByPort.get(peer) === layerIndex,
          );
          const value =
            peers.reduce((sum, peer) => sum + this.state.positions[owner.get(peer)!.id]! + 1, 0) /
            peers.length;
          const above = value < this.state.positions[node.id]! + 1;
          this.state.barycenters[port.id] =
            port.side === "EAST"
              ? above
                ? minimum - value
                : maximum + (size + 1 - value)
              : above
                ? maximum + value
                : minimum - (size + 1 - value);
        }
      }
      const sideRank = { NORTH: 0, EAST: 1, SOUTH: 2, WEST: 3 };
      node.ports.sort((a, b) => {
        const side = sideRank[a.side] - sideRank[b.side];
        if (side) return side;
        const left = this.state.barycenters[a.id]!,
          right = this.state.barycenters[b.id]!;
        return left === 0 && right === 0 ? 0 : left === 0 ? -1 : right === 0 ? 1 : left - right;
      });
    };
    const free = graph.layers[index]!;
    for (const [position, node] of free.entries()) this.state.positions[node.id] = position;
    const side = forward ? "WEST" : "EAST";
    const fixed = graph.layers[index + (forward ? -1 : 1)];
    if (fixed) {
      ranks(fixed, !forward);
      for (const node of free) distributeNode(node, side);
      ranks(free, forward);
      for (const node of fixed)
        if (!options.hierarchical.has(node.id)) distributeNode(node, forward ? "EAST" : "WEST");
    } else for (const node of free) distributeNode(node, side);
  }
}
