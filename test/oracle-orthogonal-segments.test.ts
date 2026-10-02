import { expect, it } from "vitest";
import { JavaRandom } from "../src/java-random";
import { routeOrthogonalSegments } from "../src/layered/orthogonal-segments";
import { elkOrthogonalSegments } from "./helpers/elk-constraint-oracle";
it("matches ELK complete segment splitting, dependencies, slots and RNG on 1024 seeded mixed hypersegments", () => {
  const gen = new JavaRandom(3468112780);
  for (let index = 0; index < 1024; index++) {
    const segments = Array.from({ length: 2 + gen.nextInt(8) }, () => {
      const incoming = [
        ...new Set(
          Array.from({ length: gen.nextInt(4) }, () =>
            index < 512 ? gen.nextInt(20) * 3 : (gen.nextInt(200) - 100) / 10,
          ),
        ),
      ].sort((a, b) => a - b);
      const outgoing = [
        ...new Set(
          Array.from({ length: incoming.length ? gen.nextInt(4) : 1 + gen.nextInt(3) }, () =>
            index < 512 ? gen.nextInt(20) * 3 : (gen.nextInt(200) - 100) / 10,
          ),
        ),
      ].sort((a, b) => a - b);
      return { incoming, outgoing };
    });
    const input = {
      segments,
      conflictThreshold: index < 512 ? 6 : 2.3,
      criticalThreshold: index < 512 ? 0.6 : 0.23,
      seed: gen.nextInt(2 ** 30),
    };
    const random = new JavaRandom(input.seed),
      actual = routeOrthogonalSegments(
        segments,
        input.conflictThreshold,
        input.criticalThreshold,
        random,
      );
    actual.dependencies.sort((a, b) => a.source - b.source);
    expect(
      { ...actual, nextFloat: random.nextFloat() },
      `case ${index}: ${JSON.stringify(input)}`,
    ).toEqual(elkOrthogonalSegments(input));
  }
});
