/*******************************************************************************
 * Copyright (c) 2017 Kiel University and others.
 *
 * Adapted from ELK v0.11.0 NetworkSimplexCompaction.java.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { runNetworkSimplex, type SimplexEdge, type SimplexNode } from "./network-simplex";
import { InfeasibleCompactionError } from "./compaction-errors";

export interface CompactionConstraint {
  source: string;
  target: string;
  delta: number;
  weight: number;
}

/** Minimize weighted separation subject to integral lower-bound constraints. */
export function solveWeightedCompaction(
  groupIds: readonly string[],
  constraints: readonly CompactionConstraint[],
): Map<string, number> {
  const nodes = groupIds.map((id, order): SimplexNode => ({
    id,
    order,
    layer: 0,
    incoming: [],
    outgoing: [],
    treeNode: false,
  }));
  if (nodes.length === 0) return new Map();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: SimplexEdge[] = [];
  const add = (source: SimplexNode, target: SimplexNode, delta: number, weight: number): void => {
    const edge: SimplexEdge = {
      id: `constraint:${edges.length}`,
      order: edges.length,
      source,
      target,
      delta: Math.max(0, Math.ceil(delta)),
      weight,
      treeEdge: false,
    };
    edges.push(edge);
    source.outgoing.push(edge);
    target.incoming.push(edge);
  };
  for (const constraint of constraints) {
    const source = byId.get(constraint.source);
    const target = byId.get(constraint.target);
    if (!source || !target) throw new Error("Unknown compaction group");
    if (source !== target) add(source, target, constraint.delta, constraint.weight);
  }
  // Fail explicitly on invalid constraint cycles rather than hanging tight-tree growth.
  const remaining = new Map(nodes.map((node) => [node, node.incoming.length]));
  const queue = nodes.filter((node) => node.incoming.length === 0);
  let visited = 0;
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index]!;
    visited++;
    for (const edge of node.outgoing) {
      const count = remaining.get(edge.target)! - 1;
      remaining.set(edge.target, count);
      if (count === 0) queue.push(edge.target);
    }
  }
  if (visited !== nodes.length)
    throw new InfeasibleCompactionError("Cyclic compaction constraints");
  const sources = nodes.filter((node) => node.incoming.length === 0);
  if (sources.length > 1) {
    const source: SimplexNode = {
      id: "",
      order: nodes.length,
      layer: 0,
      incoming: [],
      outgoing: [],
      treeNode: false,
    };
    nodes.push(source);
    for (const target of sources) add(source, target, 1, 0);
  }
  runNetworkSimplex(nodes, edges, Number.MAX_SAFE_INTEGER, undefined, false);
  return new Map(groupIds.map((id) => [id, byId.get(id)!.layer]));
}
