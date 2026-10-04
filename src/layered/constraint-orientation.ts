/*******************************************************************************
 * Derived from ELK v0.11.0 EdgeAndLayerConstraintEdgeReverser.java.
 * Copyright (c) 2010, 2017 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { createGraph } from "@statelyai/graph";
import type { GraphEdge } from "@statelyai/graph";
import type { AcyclicOrientation, CycleBreaker, LayeredPhaseInput } from "./types";
import { inheritCycleRandom } from "./cycle-random";

/** ELK handles outer constraints and whole feedback nodes before cycle breaking. */
export function orientConstrainedEdges(
  input: LayeredPhaseInput,
  initial: ReadonlySet<string>,
): AcyclicOrientation & { reversedNodeIds: readonly string[] } {
  const reversedEdgeIds = new Set(initial);
  const reversedNodeIds: string[] = [];
  const constraints = new Map(
    input.graph.nodes.map((n) => [n.id, input.nodeSettings?.(n)?.["layering.layerConstraint"]]),
  );
  const forward =
    input.direction === "right"
      ? "EAST"
      : input.direction === "left"
        ? "WEST"
        : input.direction === "down"
          ? "SOUTH"
          : "NORTH";
  const backward =
    input.direction === "right"
      ? "WEST"
      : input.direction === "left"
        ? "EAST"
        : input.direction === "down"
          ? "NORTH"
          : "SOUTH";
  const reverse = (nodeId: string, kind: "incoming" | "outgoing" | "all") => {
    for (const edge of input.graph.edges) {
      if (reversedEdgeIds.has(edge.id)) continue;
      if (
        edge.sourceId === nodeId &&
        kind !== "incoming" &&
        constraints.get(edge.targetId) !== "LAST_SEPARATE"
      )
        reversedEdgeIds.add(edge.id);
      else if (
        edge.targetId === nodeId &&
        kind !== "outgoing" &&
        constraints.get(edge.sourceId) !== "FIRST_SEPARATE"
      )
        reversedEdgeIds.add(edge.id);
    }
  };
  for (const node of input.graph.nodes) {
    const c = constraints.get(node.id);
    if (c === "FIRST" || c === "FIRST_SEPARATE") reverse(node.id, "incoming");
    else if (c === "LAST" || c === "LAST_SEPARATE") reverse(node.id, "outgoing");
  }
  for (const node of input.graph.nodes) {
    if (constraints.get(node.id) && constraints.get(node.id) !== "NONE") continue;
    const fixed = input.nodeSettings?.(node)?.portConstraints;
    if (
      !["FIXED_SIDE", "FIXED_ORDER", "FIXED_RATIO", "FIXED_POS"].includes(String(fixed)) ||
      !node.ports?.length
    )
      continue;
    const ports = new Map(
      node.ports.map((p) => [
        p.name,
        { side: input.portSettings?.(p, node)?.["port.side"], net: 0 },
      ]),
    );
    let protectedNeighbor = false;
    for (const edge of input.graph.edges) {
      const reversed = reversedEdgeIds.has(edge.id);
      const source = reversed ? edge.targetId : edge.sourceId;
      const target = reversed ? edge.sourceId : edge.targetId;
      for (const incoming of [false, true]) {
        if ((incoming ? target : source) !== node.id) continue;
        const name = incoming
          ? reversed
            ? edge.sourcePort
            : edge.targetPort
          : reversed
            ? edge.targetPort
            : edge.sourcePort;
        const key = name ?? `__implicit:${edge.id}:${incoming}`;
        const port = ports.get(key) ?? { side: incoming ? backward : forward, net: 0 };
        port.net += incoming ? 1 : -1;
        ports.set(key, port);
        const otherConstraint = constraints.get(incoming ? source : target);
        if (
          incoming
            ? otherConstraint === "FIRST" || otherConstraint === "FIRST_SEPARATE"
            : otherConstraint === "LAST" || otherConstraint === "LAST_SEPARATE"
        )
          protectedNeighbor = true;
      }
    }
    // Fixed-side UNDEFINED ports are assigned the side opposite their flow.
    // An unused or non-flow port prevents whole-node feedback reversal.
    const allReversed = [...ports.values()].every((p) => {
      const side = p.side === "UNDEFINED" ? (p.net > 0 ? forward : backward) : p.side;
      return (side === forward && p.net > 0) || (side === backward && p.net < 0);
    });
    if (allReversed && !protectedNeighbor) {
      reversedNodeIds.push(node.id);
      reverse(node.id, "all");
    }
  }
  return { reversedEdgeIds, reversedNodeIds };
}

/** Preserve original edge identities and carry the actual post-cycle RNG back. */
export function breakCyclesWithConstraints(
  input: LayeredPhaseInput,
  breaker: CycleBreaker,
): AcyclicOrientation {
  const prepared = orientConstrainedEdges(input, new Set()).reversedEdgeIds;
  if (!prepared.size) return breaker(input);
  const edges: GraphEdge[] = input.graph.edges.map((e) =>
    prepared.has(e.id)
      ? {
          ...e,
          sourceId: e.targetId,
          targetId: e.sourceId,
          sourcePort: e.targetPort,
          targetPort: e.sourcePort,
        }
      : e,
  );
  const phaseInput: LayeredPhaseInput = { ...input, graph: createGraph({ ...input.graph, edges }) };
  const cycles = breaker(phaseInput);
  inheritCycleRandom(phaseInput, input);
  const reversedEdgeIds = new Set(prepared);
  for (const id of cycles.reversedEdgeIds) {
    if (reversedEdgeIds.has(id)) reversedEdgeIds.delete(id);
    else reversedEdgeIds.add(id);
  }
  return { reversedEdgeIds };
}
