/*
 * Copyright (c) 2011, 2019 Kiel University and others.
 * Native adaptation of ELK InvertedPortProcessor (v0.11.0).
 * SPDX-License-Identifier: EPL-2.0
 */
import type { GraphNode, GraphEdge } from "@statelyai/graph";
import type { LongEdgeExpansion } from "./long-edges";
import { inheritCycleRandom } from "./cycle-random";

/** Insert same-layer long-edge dummies before crossing minimization. */
export function insertInvertedPortDummies(expansion: LongEdgeExpansion): LongEdgeExpansion {
  const { input } = expansion;
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
  const nodes: GraphNode[] = [...input.graph.nodes];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges: GraphEdge[] = [];
  const sizes = new Map(input.sizes);
  const layers = new Map(expansion.assignment.layerByNodeId);
  const reversed = new Set<string>();
  const replacements = new Map<string, string[]>();
  const originals = new Map<string, GraphEdge>();
  const dummyIds = new Set<string>();
  const usedEdges = new Set(input.graph.edges.map((e) => e.id));
  const fixedSide = (
    node: GraphNode | undefined,
    portName: string | undefined,
    source: boolean,
  ) => {
    if (!node || node.id.startsWith("__layout_dummy:")) return undefined;
    const constraints = String(input.nodeSettings?.(node)?.portConstraints ?? "UNDEFINED");
    if (constraints === "UNDEFINED" || constraints === "FREE") return undefined;
    const port = node.ports?.find((p) => p.name === portName);
    if (!port) return source ? forward : backward;
    return input.portSettings?.(port, node)?.["port.side"];
  };
  const dummy = (edge: GraphEdge, at: string, end: string) => {
    let id = `__layout_dummy:inverted:${edge.id}:${end}`;
    while (nodeById.has(id)) id += ":";
    const node: GraphNode = {
      type: "node",
      id,
      data: undefined,
      width: 0,
      height: 0,
      ports: [
        { name: "input", direction: "in", x: 0, y: 0, width: 0, height: 0, data: undefined },
        { name: "output", direction: "out", x: 0, y: 0, width: 0, height: 0, data: undefined },
      ],
    };
    nodes.push(node);
    nodeById.set(id, node);
    dummyIds.add(id);
    sizes.set(id, { width: 0, height: 0 });
    layers.set(id, layers.get(at) ?? 0);
    return id;
  };
  for (const edge of input.graph.edges) {
    const rev = expansion.orientation.reversedEdgeIds.has(edge.id);
    const source = nodeById.get(edge.sourceId),
      target = nodeById.get(edge.targetId);
    const sourceSide = fixedSide(source, edge.sourcePort, true),
      targetSide = fixedSide(target, edge.targetPort, false);
    const invertSource =
      edge.sourceId !== edge.targetId && sourceSide === (rev ? forward : backward);
    const invertTarget =
      edge.sourceId !== edge.targetId && targetSide === (rev ? backward : forward);
    if (!invertSource && !invertTarget) {
      edges.push(edge);
      if (rev) reversed.add(edge.id);
      replacements.set(edge.id, [edge.id]);
      continue;
    }
    const chain = [edge.sourceId];
    if (invertSource) chain.push(dummy(edge, edge.sourceId, "source"));
    if (invertTarget) chain.push(dummy(edge, edge.targetId, "target"));
    chain.push(edge.targetId);
    const segments: string[] = [];
    for (let i = 0; i < chain.length - 1; i++) {
      let id = `${edge.id}::inverted:${i}`;
      while (usedEdges.has(id)) id += ":";
      usedEdges.add(id);
      segments.push(id);
      originals.set(id, edge);
      edges.push({
        ...edge,
        id,
        sourceId: chain[i]!,
        targetId: chain[i + 1]!,
        sourcePort: i === 0 ? edge.sourcePort : rev ? "input" : "output",
        targetPort: i === chain.length - 2 ? edge.targetPort : rev ? "output" : "input",
        // Existing center-label metadata stays on the inter-layer segment.
        ...(i === (invertSource ? 1 : 0) ? {} : { width: 0, height: 0 }),
        points: undefined,
      });
      if (rev) reversed.add(id);
    }
    replacements.set(edge.id, segments);
  }
  if (!dummyIds.size) return expansion;
  return {
    ...expansion,
    input: inheritCycleRandom(input, {
      ...input,
      graph: { ...input.graph, nodes, edges },
      sizes,
      nodeSettings: (n) =>
        dummyIds.has(n.id) ? { portConstraints: "FIXED_POS" } : input.nodeSettings?.(n),
      portSettings: (p, n) =>
        dummyIds.has(n.id)
          ? { "port.side": p.name === "input" ? backward : forward }
          : input.portSettings?.(p, n),
      edgeSettings: (e) => input.edgeSettings?.(originals.get(e.id) ?? e),
    }),
    orientation: { reversedEdgeIds: reversed },
    assignment: { ...expansion.assignment, layerByNodeId: layers },
    segmentIdsByEdgeId: new Map(
      [...expansion.segmentIdsByEdgeId].map(([id, segs]) => [
        id,
        segs.flatMap((s) => replacements.get(s) ?? [s]),
      ]),
    ),
  };
}
