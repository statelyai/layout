/*******************************************************************************
 * Copyright (c) 2010, 2020 Kiel University and others.
 * Adapted from ELK v0.11.0 HyperEdgeCycleDetector.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { JavaRandom } from "../java-random";
export interface OrthogonalDependency {
  source: number;
  target: number;
  weight: number;
  critical: boolean;
}
/** ELK's weighted segment ordering; returned dependencies point backwards in that order. */
export function detectOrthogonalCycles(
  count: number,
  dependencies: readonly OrthogonalDependency[],
  criticalOnly: boolean,
  random: JavaRandom,
): { marks: number[]; backwards: OrthogonalDependency[] } {
  const considered = dependencies.filter((d) => !criticalOnly || d.critical);
  const incoming = Array.from({ length: count }, () => [] as OrthogonalDependency[]);
  const outgoing = Array.from({ length: count }, () => [] as OrthogonalDependency[]);
  for (const dependency of considered) {
    incoming[dependency.target]!.push(dependency);
    outgoing[dependency.source]!.push(dependency);
  }
  const inWeight = incoming.map((edges) => edges.reduce((sum, e) => sum + e.weight, 0));
  const outWeight = outgoing.map((edges) => edges.reduce((sum, e) => sum + e.weight, 0));
  const criticalIn = incoming.map((edges) =>
    edges.reduce((sum, e) => sum + (e.critical ? e.weight : 0), 0),
  );
  const criticalOut = outgoing.map((edges) =>
    edges.reduce((sum, e) => sum + (e.critical ? e.weight : 0), 0),
  );
  const marks = Array.from({ length: count }, (_, i) => -i - 1);
  const remaining = new Set(marks.map((_, i) => i));
  const sinks: number[] = [],
    sources: number[] = [];
  for (let i = 0; i < count; i++)
    if (outWeight[i] === 0) sinks.push(i);
    else if (inWeight[i] === 0) sources.push(i);
  let nextSink = count - 1,
    nextSource = count + 1;
  const update = (node: number) => {
    for (const edge of outgoing[node]!) {
      const target = edge.target;
      if (marks[target]! < 0 && edge.weight > 0) {
        inWeight[target]! -= edge.weight;
        if (edge.critical) criticalIn[target]! -= edge.weight;
        if (inWeight[target]! <= 0 && outWeight[target]! > 0) sources.push(target);
      }
    }
    for (const edge of incoming[node]!) {
      const source = edge.source;
      if (marks[source]! < 0 && edge.weight > 0) {
        outWeight[source]! -= edge.weight;
        if (edge.critical) criticalOut[source]! -= edge.weight;
        if (outWeight[source]! <= 0 && inWeight[source]! > 0) sinks.push(source);
      }
    }
  };
  while (remaining.size) {
    while (sinks.length) {
      const node = sinks.shift()!;
      remaining.delete(node);
      marks[node] = nextSink--;
      update(node);
    }
    while (sources.length) {
      const node = sources.shift()!;
      remaining.delete(node);
      marks[node] = nextSource++;
      update(node);
    }
    let maximum = -2147483648;
    let candidates: number[] = [];
    // TreeSet compares initial negative marks, hence reverse segment creation order.
    for (const node of [...remaining].sort((a, b) => marks[a]! - marks[b]!)) {
      if (!criticalOnly && criticalOut[node]! > 0 && criticalIn[node]! <= 0) {
        candidates = [node];
        break;
      }
      const outflow = outWeight[node]! - inWeight[node]!;
      if (outflow >= maximum) {
        if (outflow > maximum) {
          candidates = [];
          maximum = outflow;
        }
        candidates.push(node);
      }
    }
    if (candidates.length) {
      const node = candidates[random.nextInt(candidates.length)]!;
      remaining.delete(node);
      marks[node] = nextSource++;
      update(node);
    }
  }
  for (let i = 0; i < count; i++) if (marks[i]! < count) marks[i]! += count + 1;
  // Upstream iterates each source's outgoing list, not the global edge list.
  const backwards = outgoing.flatMap((edges) =>
    edges.filter((e) => marks[e.source]! > marks[e.target]!),
  );
  return { marks, backwards };
}
