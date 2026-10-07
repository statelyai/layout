import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../../src/elkjs";
import { invertedBoundaryFixture } from "../../scripts/parity/inverted-boundary-fixture";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"]) {
  for (const count of [1, 2, 3]) {
    for (const spacing of [5, 10, 20]) {
      it(`matches complete ELK exterior channel geometry (${direction}, ${count} links, ${spacing}px spacing)`, async () => {
        const input = invertedBoundaryFixture(direction, count, spacing);
        const actual = await new Native().layout(structuredClone(input));
        const expected = await new Oracle().layout(structuredClone(input) as never);
        expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
          [],
        );
      });
    }
  }
}
