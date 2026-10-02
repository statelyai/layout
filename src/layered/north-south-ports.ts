/*******************************************************************************
 * Copyright (c) 2011, 2020 Kiel University and others.
 * Adapted from ELK v0.11.0 NorthSouthPortPreprocessor.java (new approach).
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { GraphNode, GraphPort } from "@statelyai/graph";
import type { LongEdgeExpansion } from "./long-edges";
import { inheritCycleRandom } from "./cycle-random";

export interface CrossPortOrigin {
  node: GraphNode;
  port: GraphPort;
  /** Physical port face. */
  side: "NORTH" | "SOUTH" | "WEST" | "EAST";
  /** Position relative to the owner's canonical cross coordinate. */
  beforeOwner: boolean;
  input: boolean;
  output: boolean;
}
export interface NorthSouthPortExpansion {
  expansion: LongEdgeExpansion;
  originsByDummyId: ReadonlyMap<string, CrossPortOrigin>;
  successorsByNodeId: ReadonlyMap<string, readonly string[]>;
  layoutUnitByNodeId: ReadonlyMap<string, string>;
}

/** Detach fixed cross-axis ports into same-layer units before crossing minimization. */
export function insertNorthSouthPortDummies(expansion: LongEdgeExpansion): NorthSouthPortExpansion {
  const { input, orientation } = expansion;
  const vertical = input.direction === "down" || input.direction === "up";
  const forward =
    input.direction === "right"
      ? "EAST"
      : input.direction === "left"
        ? "WEST"
        : input.direction === "down"
          ? "SOUTH"
          : "NORTH";
  const backward = ({ EAST: "WEST", WEST: "EAST", NORTH: "SOUTH", SOUTH: "NORTH" } as const)[
    forward
  ];
  const nodes = [...input.graph.nodes];
  const used = new Set(nodes.map((n) => n.id));
  const sizes = new Map(input.sizes);
  const layers = new Map(expansion.assignment.layerByNodeId);
  const origins = new Map<string, CrossPortOrigin>();
  const byPort = new Map<GraphPort, string>();
  const successors = new Map<string, string[]>();
  const units = new Map<string, string>();
  const attach = (
    owner: GraphNode,
    port: GraphPort,
    side: CrossPortOrigin["side"],
    incoming: boolean,
  ) => {
    let id = byPort.get(port);
    if (!id) {
      id = `__layout_dummy:north-south:${owner.id}:${port.name}`;
      while (used.has(id)) id += ":";
      used.add(id);
      byPort.set(port, id);
      // Canonical cross coordinates remain physical x in vertical layouts, y otherwise.
      const beforeOwner = vertical ? side === "WEST" : side === "NORTH";
      origins.set(id, { node: owner, port, side, beforeOwner, input: false, output: false });
      nodes.push({ type: "node", id, data: undefined, width: 0, height: 0, ports: [] });
      sizes.set(id, { width: 0, height: 0 });
      layers.set(id, layers.get(owner.id) ?? 0);
      units.set(owner.id, owner.id);
      units.set(id, owner.id);
      const from = beforeOwner ? id : owner.id;
      const to = beforeOwner ? owner.id : id;
      if (input.portSettings?.(port, owner)?.allowNonFlowPortsToSwitchSides !== true)
        successors.set(from, [...(successors.get(from) ?? []), to]);
    }
    const origin = origins.get(id)!;
    const role = incoming ? "input" : "output";
    if (!origin[role]) {
      origin[role] = true;
      nodes
        .find((n) => n.id === id)!
        .ports!.push({
          name: role,
          direction: incoming ? "in" : "out",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          data: undefined,
        });
    }
    return { id, role };
  };
  const nodeById = new Map(input.graph.nodes.map((n) => [n.id, n]));
  const edges = input.graph.edges.map((edge) => {
    const reverse = orientation.reversedEdgeIds.has(edge.id);
    const endpoint = (nodeId: string, portName: string | undefined, incoming: boolean) => {
      const owner = nodeById.get(nodeId);
      if (!owner || owner.id.startsWith("__layout_dummy:")) return undefined;
      const constraints = input.nodeSettings?.(owner)?.portConstraints;
      if (!constraints || constraints === "UNDEFINED" || constraints === "FREE") return undefined;
      const port = owner.ports?.find((p) => p.name === portName);
      if (!port) return undefined;
      const side = input.portSettings?.(port, owner)?.["port.side"];
      if (side !== "NORTH" && side !== "SOUTH" && side !== "WEST" && side !== "EAST")
        return undefined;
      if (vertical ? side !== "WEST" && side !== "EAST" : side !== "NORTH" && side !== "SOUTH")
        return undefined;
      return attach(owner, port, side, incoming);
    };
    // Dedicated same-side and north/south loop dummies are a separate upstream phase.
    if (edge.sourceId === edge.targetId) return edge;
    const source = endpoint(edge.sourceId, edge.sourcePort, reverse);
    const target = endpoint(edge.targetId, edge.targetPort, !reverse);
    return source || target
      ? {
          ...edge,
          sourceId: source?.id ?? edge.sourceId,
          sourcePort: source?.role ?? edge.sourcePort,
          targetId: target?.id ?? edge.targetId,
          targetPort: target?.role ?? edge.targetPort,
        }
      : edge;
  });
  if (!origins.size)
    return {
      expansion,
      originsByDummyId: origins,
      successorsByNodeId: successors,
      layoutUnitByNodeId: units,
    };
  // The upstream mixed-role dummy creates its WEST input before its EAST output.
  for (const node of nodes)
    if (origins.has(node.id))
      node.ports?.sort((a, b) => Number(a.name === "output") - Number(b.name === "output"));
  const seed = expansion.assignment.seedOrder ?? input.graph.nodes.map((n) => n.id);
  const seedOrder = seed.flatMap((id) => [
    ...[...origins].filter(([, o]) => o.node.id === id && o.beforeOwner).map(([dummy]) => dummy),
    id,
    ...[...origins].filter(([, o]) => o.node.id === id && !o.beforeOwner).map(([dummy]) => dummy),
  ]);
  return {
    expansion: {
      ...expansion,
      input: inheritCycleRandom(input, {
        ...input,
        graph: { ...input.graph, nodes, edges },
        sizes,
        nodeSettings: (n) =>
          origins.has(n.id) ? { portConstraints: "FIXED_POS" } : input.nodeSettings?.(n),
        portSettings: (p, n) =>
          origins.has(n.id)
            ? { "port.side": p.name === "input" ? backward : forward }
            : input.portSettings?.(p, n),
      }),
      assignment: { ...expansion.assignment, layerByNodeId: layers, seedOrder },
    },
    originsByDummyId: origins,
    successorsByNodeId: successors,
    layoutUnitByNodeId: units,
  };
}

/** Reconnect orthogonal/polyline endpoints after routing, preserving the dummy-row bend. */
export function restoreNorthSouthPortRoutes(
  phase: NorthSouthPortExpansion,
  placement: import("./types").NodePlacement,
  routes: import("./types").EdgeRoutes,
  anchor: (origin: CrossPortOrigin) => import("@statelyai/graph").Point,
): import("./types").EdgeRoutes {
  const vertical =
    phase.expansion.input.direction === "down" || phase.expansion.input.direction === "up";
  const pointsByEdgeId = new Map(routes.pointsByEdgeId);
  for (const edge of phase.expansion.input.graph.edges) {
    const original = pointsByEdgeId.get(edge.id);
    if (!original?.length) continue;
    let points = [...original];
    const source = phase.originsByDummyId.get(edge.sourceId);
    const target = phase.originsByDummyId.get(edge.targetId);
    if (source) {
      const endpoint = anchor(source);
      const rect = placement.rectByNodeId.get(edge.sourceId);
      if (!rect) throw new Error(`Missing cross-port dummy placement: ${edge.sourceId}`);
      const bend = vertical ? { x: rect.x, y: endpoint.y } : { x: endpoint.x, y: rect.y };
      points = [endpoint, bend, ...points.slice(1)];
    }
    if (target) {
      const endpoint = anchor(target);
      const rect = placement.rectByNodeId.get(edge.targetId);
      if (!rect) throw new Error(`Missing cross-port dummy placement: ${edge.targetId}`);
      const bend = vertical ? { x: rect.x, y: endpoint.y } : { x: endpoint.x, y: rect.y };
      points = [...points.slice(0, -1), bend, endpoint];
    }
    pointsByEdgeId.set(edge.id, points);
  }
  return { ...routes, pointsByEdgeId };
}
