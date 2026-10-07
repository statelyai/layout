import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../../src/elkjs";
import { flatFixture } from "../../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";

for (const [seed, directions] of [
  [21, ["RIGHT", "LEFT"]],
  [4, ["DOWN", "UP"]],
] as const) {
  for (const direction of directions) {
    it(`matches complete ELK bounds and geometry with loops and long edges: seed ${seed} ${direction}`, async () => {
      const input = flatFixture(seed, direction);
      const actual = await new Native().layout(structuredClone(input));
      const expected = await new Oracle().layout(structuredClone(input) as never);
      expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
    });
  }
}
