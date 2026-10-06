import { expect, it } from "vitest";
import { JavaRandom } from "../../src/java-random";
import {
  resolveCrossingConstraints,
  type CrossingUnits,
} from "../../src/layered/crossing-constraints";
import { elkResolveConstraints, type ConstraintOracleInput } from "../helpers/elk-constraint-oracle";
it("matches real elkjs constrained group order and every barycenter on 512 seeded unit graphs", () => {
  const random = new JavaRandom(3468112780);
  for (let index = 0; index < 512; index++) {
    const seed: string[] = [],
      normals: string[] = [],
      units: [string, string][] = [],
      successors = new Map<string, string[]>(),
      scores: Record<string, number> = {};
    const count = 2 + Math.floor(random.nextDouble() * 4);
    const normalConstraints = index % 2 === 0;
    for (let u = 0; u < count; u++) {
      const owner = `n${u}`;
      normals.push(owner);
      const north = Array.from(
        { length: Math.floor(random.nextDouble() * 3) },
        (_, i) => `${owner}:north${i}`,
      );
      const south = Array.from(
        { length: Math.floor(random.nextDouble() * 3) },
        (_, i) => `${owner}:south${i}`,
      );
      for (const id of [...north, owner, ...south]) {
        seed.push(id);
        units.push([id, owner]);
        scores[id] =
          index % 3 === 0 ? Math.floor(random.nextDouble() * 8) : random.nextDouble() * 10;
      }
      for (const id of north) successors.set(id, [owner]);
      successors.set(owner, south);
      if (normalConstraints && u > 0)
        successors.set(normals[u - 1]!, [...(successors.get(normals[u - 1]!) ?? []), owner]);
    }
    const order = [...seed].sort((a, b) => scores[a]! - scores[b]!);
    const input: ConstraintOracleInput = {
      seed,
      order,
      normals,
      units,
      successors: [...successors],
      scores,
      normalConstraints,
    };
    const expected = elkResolveConstraints(input);
    const unitMembers = new Map<string, string[]>();
    for (const [id, owner] of units)
      unitMembers.set(owner, [...(unitMembers.get(owner) ?? []), id]);
    const state: CrossingUnits = {
      units: new Map(units),
      unitMembers,
      successors,
      normalNodes: new Set(normals),
      associates: new Map(),
      constraintsBetweenNormalNodes: normalConstraints,
    };
    const barycenters = new Map(Object.entries(scores));
    const actual = resolveCrossingConstraints(order, barycenters, state);
    expect(
      { order: actual, scores: Object.fromEntries(barycenters) },
      `seed 3468112780, case ${index}: ${JSON.stringify(input)}`,
    ).toEqual(expected);
  }
});
