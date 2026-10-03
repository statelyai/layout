/*******************************************************************************
 * Copyright (c) 2016, 2020 Kiel University and others.
 * Adapted from ELK v0.11.0 ForsterConstraintResolver and BarycenterHeuristic.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { JavaRandom } from "../java-random";
import type { LayeredPhaseInput } from "./types";
export interface CrossingUnits {
  successors: ReadonlyMap<string, readonly string[]>;
  units: ReadonlyMap<string, string>;
  unitMembers?: ReadonlyMap<string, readonly string[]>;
  associates: ReadonlyMap<string, readonly string[]>;
  normalNodes: ReadonlySet<string>;
  incomingEdgeOrderByDummyId?: ReadonlyMap<string, readonly string[]>;
  longEdgeNodes?: ReadonlySet<string>;
  northEdges?: ReadonlySet<string>;
  southEdges?: ReadonlySet<string>;
  constraintsBetweenNormalNodes?: boolean;
}
const unitState = new WeakMap<LayeredPhaseInput, CrossingUnits>();
export const recordCrossingUnits = (input: LayeredPhaseInput, state: CrossingUnits): void => {
  unitState.set(input, state);
};
export const getCrossingUnits = (input: LayeredPhaseInput): CrossingUnits | undefined =>
  unitState.get(input);

/** Recursively include same-layer neighbors and owner associates before perturbation. */
export function associatedBarycenters(
  layer: readonly string[],
  ranks: ReadonlyMap<string, readonly number[]>,
  sameLayerNeighbors: ReadonlyMap<string, readonly string[]>,
  associates: ReadonlyMap<string, readonly string[]>,
  random?: JavaRandom,
  orderedVisits?: ReadonlyMap<string, readonly (number | string)[]>,
): Map<string, number | undefined> {
  const states = new Map(
    layer.map((id) => [
      id,
      { visited: false, degree: 0, weight: 0, barycenter: undefined as number | undefined },
    ]),
  );
  const calculate = (id: string): void => {
    const state = states.get(id);
    if (!state || state.visited) return;
    state.visited = true;
    const includeNeighbor = (neighbor: string): void => {
      calculate(neighbor);
      const other = states.get(neighbor);
      if (other) {
        state.degree += other.degree;
        state.weight += other.weight;
      }
    };
    // ELK walks ports, then their incident edges. Same-layer recursion must
    // occur at that exact position, before any later fixed-layer rank.
    const visits = orderedVisits?.get(id) ?? [
      ...(ranks.get(id) ?? []),
      ...(sameLayerNeighbors.get(id) ?? []),
    ];
    for (const visit of visits) {
      if (typeof visit === "number") {
        state.degree++;
        state.weight += visit;
      } else if (visit !== id) includeNeighbor(visit);
    }
    for (const associate of associates.get(id) ?? []) includeNeighbor(associate);
    if (state.degree > 0) {
      state.weight += random ? random.nextFloat() * Math.fround(0.07) - Math.fround(0.07) / 2 : 0;
      state.barycenter = state.weight / state.degree;
    }
  };
  for (const id of layer) calculate(id);
  return new Map([...states].map(([id, s]) => [id, s.barycenter]));
}

interface Group {
  nodes: string[];
  outgoing: Group[];
  incoming: Group[];
  incomingCount: number;
}
/** Resolve successor and layout-unit constraints by merging violated groups in barycenter order. */
export function resolveCrossingConstraints(
  order: readonly string[],
  barycenters: Map<string, number | undefined>,
  state: CrossingUnits,
): string[] {
  if (state.constraintsBetweenNormalNodes) {
    const normalOnly = new Map(
      [...state.successors]
        .filter(([id]) => state.normalNodes.has(id))
        .map(([id, targets]) => [id, targets.filter((target) => state.normalNodes.has(target))]),
    );
    const first = resolveCrossingConstraints(order, barycenters, {
      ...state,
      successors: normalOnly,
      units: new Map(),
      unitMembers: new Map(),
      constraintsBetweenNormalNodes: false,
    });
    return resolveCrossingConstraints(first, barycenters, {
      ...state,
      constraintsBetweenNormalNodes: false,
    });
  }
  const groups: Group[] = order.map((id) => ({
    nodes: [id],
    outgoing: [],
    incoming: [],
    incomingCount: 0,
  }));
  const byId = new Map(groups.map((g) => [g.nodes[0]!, g]));
  const score = (g: Group) => barycenters.get(g.nodes[0]!) ?? 0;
  const units = new Map<string, string[]>();
  if (state.unitMembers)
    for (const [owner, members] of state.unitMembers)
      units.set(
        owner,
        members.filter((id) => byId.has(id)),
      );
  else
    for (const [id, owner] of state.units)
      if (byId.has(id)) units.set(owner, [...(units.get(owner) ?? []), id]);
  const add = (from: Group, to: Group) => {
    from.outgoing.push(to);
    to.incomingCount++;
  };
  let previous: string | undefined;
  for (const id of order) {
    const group = byId.get(id)!;
    for (const successor of state.successors.get(id) ?? []) {
      const target = byId.get(successor);
      if (target) add(group, target);
    }
    if (state.normalNodes.has(id)) {
      if (previous !== undefined)
        for (const left of units.get(previous) ?? [])
          for (const right of units.get(id) ?? []) add(byId.get(left)!, byId.get(right)!);
      previous = id;
    }
  }
  const violation = (): [Group, Group] | undefined => {
    const active: Group[] = [];
    for (const g of groups) {
      g.incoming = [];
      if (g.outgoing.length && g.incomingCount === 0) active.push(g);
    }
    for (let index = 0; index < active.length; index++) {
      const group = active[index]!;
      for (const predecessor of group.incoming) {
        // elkjs Double.floatValue is an identity conversion, not float32 rounding.
        if (
          score(predecessor) === score(group)
            ? groups.indexOf(predecessor) > groups.indexOf(group)
            : score(predecessor) > score(group)
        )
          return [predecessor, group];
      }
      for (const target of group.outgoing) {
        target.incoming.unshift(group);
        if (target.incoming.length === target.incomingCount) active.push(target);
      }
    }
    return undefined;
  };
  const removeOne = (values: Group[], target: Group): boolean => {
    const index = values.indexOf(target);
    if (index < 0) return false;
    values.splice(index, 1);
    return true;
  };
  let pair: [Group, Group] | undefined;
  while ((pair = violation())) {
    const [first, second] = pair;
    // ConstraintGroup degrees/weights start at zero in ELK: merged scores use
    // the mean of two group scores, not their node or edge counts.
    const value = (score(first) + score(second)) / 2;
    const merged: Group = {
      nodes: [...first.nodes, ...second.nodes],
      outgoing: [...first.outgoing],
      incoming: [],
      incomingCount: 0,
    };
    removeOne(merged.outgoing, second);
    for (const target of second.outgoing)
      if (target !== first) {
        if (merged.outgoing.includes(target)) target.incomingCount--;
        else merged.outgoing.push(target);
      }
    for (const id of merged.nodes) barycenters.set(id, value);
    const survivors: Group[] = [];
    let inserted = false;
    for (const group of groups) {
      if (group === first || group === second) continue;
      if (!inserted && score(group) > value) {
        survivors.push(merged);
        inserted = true;
      }
      if (group.outgoing.length) {
        const hadFirst = removeOne(group.outgoing, first),
          hadSecond = removeOne(group.outgoing, second);
        if (hadFirst || hadSecond) {
          group.outgoing.push(merged);
          merged.incomingCount++;
        }
      }
      survivors.push(group);
    }
    if (!inserted) survivors.push(merged);
    groups.splice(0, groups.length, ...survivors);
  }
  return groups.flatMap((g) => g.nodes);
}

/** ELK greedy switches must preserve port-unit and explicit successor constraints. */
export function canSwapCrossingUnits(upper: string, lower: string, state: CrossingUnits): boolean {
  if (state.successors.get(upper)?.includes(lower)) return false;
  const up = state.units.get(upper),
    down = state.units.get(lower);
  const upperDummy = up !== undefined && up !== upper,
    lowerDummy = down !== undefined && down !== lower;
  const different = up !== down;
  const constrained =
    upperDummy || lowerDummy || state.southEdges?.has(upper) || state.northEdges?.has(lower);
  if (state.northEdges?.has(upper) || state.southEdges?.has(lower)) return false;
  if (
    !state.longEdgeNodes?.has(upper) &&
    !state.longEdgeNodes?.has(lower) &&
    constrained &&
    different
  )
    return false;
  if ((upperDummy && state.normalNodes.has(lower)) || (lowerDummy && state.normalNodes.has(upper)))
    return false;
  return true;
}
