import { expect, it } from "vitest";
import { JavaRandom } from "../src/java-random";
import { detectOrthogonalCycles } from "../src/layered/orthogonal-cycle-order";
import {
  elkOrthogonalCycles,
  type OrthogonalCycleOracleInput,
} from "./helpers/elk-constraint-oracle";
it("matches real ELK segment marks, backwards dependencies and random state on 512 seeded graphs", () => {
  const generator = new JavaRandom(3468112780);
  for (let index = 0; index < 512; index++) {
    const count = 2 + generator.nextInt(8),
      dependencies: OrthogonalCycleOracleInput["dependencies"] = [];
    for (let source = 0; source < count; source++)
      for (let target = 0; target < count; target++)
        if (source !== target && generator.nextInt(5) === 0)
          dependencies.push({
            source,
            target,
            weight: generator.nextInt(5),
            critical: generator.nextBoolean(),
          });
    const input = {
      count,
      dependencies,
      criticalOnly: index % 2 === 0,
      seed: generator.nextInt(2 ** 30),
    };
    const random = new JavaRandom(input.seed),
      actual = detectOrthogonalCycles(count, dependencies, input.criticalOnly, random);
    expect(
      { ...actual, nextFloat: random.nextFloat() },
      `case ${index}: ${JSON.stringify(input)}`,
    ).toEqual(elkOrthogonalCycles(input));
  }
});
