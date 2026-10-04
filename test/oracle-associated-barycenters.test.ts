import { expect, it } from "vitest";
import { JavaRandom } from "../src/java-random";
import { associatedBarycenters } from "../src/layered/crossing-constraints";
import { barycenterCorpus } from "./helpers/barycenter-corpus";
import { elkAssociatedBarycenters } from "./helpers/elk-constraint-oracle";

it("matches real elkjs barycenters and random consumption for 512 ordered port graphs", () => {
  for (const [index, input] of barycenterCorpus().entries()) {
    const visits = new Map(input.visits);
    const ranks = new Map(
      input.visits.map(([id, values]) => [
        id,
        values.filter((v): v is number => typeof v === "number"),
      ]),
    );
    const neighbors = new Map(
      input.visits.map(([id, values]) => [
        id,
        values.filter((v): v is string => typeof v === "string"),
      ]),
    );
    const random = new JavaRandom(input.seed);
    const actual = associatedBarycenters(
      input.layer,
      ranks,
      neighbors,
      new Map(input.associates),
      random,
      visits,
    );
    expect(
      { scores: Object.fromEntries(actual), nextFloat: random.nextFloat() },
      `case ${index}: ${JSON.stringify(input)}`,
    ).toEqual(elkAssociatedBarycenters(input));
  }
});
