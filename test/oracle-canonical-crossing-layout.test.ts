import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const seed of [3, 23]) {
  for (const direction of ["LEFT", "UP"]) {
    it(`matches full ELK geometry for fixed-position random graph ${seed} ${direction}`, async () => {
      const input = flatFixture(seed, direction);
      const actual = await new Native().layout(structuredClone(input));
      const expected = await new Oracle().layout(structuredClone(input) as never);
      expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
    });
  }
}
