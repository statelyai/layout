import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const seed of [3, 23]) {
  for (const spacing of [5, 10, 20]) {
    it(`matches complete ELK inverted-port loop clearance for seed ${seed}, spacing ${spacing}`, async () => {
      const input = flatFixture(seed, "DOWN");
      input.layoutOptions = {
        ...input.layoutOptions,
        "elk.spacing.edgeNodeBetweenLayers": String(spacing),
      };
      const actual = await new Native().layout(structuredClone(input));
      const expected = await new Oracle().layout(structuredClone(input) as never);
      expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
    });
  }
}
