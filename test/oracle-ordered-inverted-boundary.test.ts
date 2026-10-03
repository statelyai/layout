import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import { orderedInvertedBoundaryFixture } from "../scripts/parity/inverted-boundary-fixture";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"]) {
  for (const count of [2, 3, 4]) {
    it(`matches complete ELK geometry with forced node ordering (${direction}, ${count} targets)`, async () => {
      const input = orderedInvertedBoundaryFixture(direction, count);
      const actual = await new Native().layout(structuredClone(input));
      const expected = await new Oracle().layout(structuredClone(input) as never);
      expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
    });
  }
}
