import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import { complexCompoundFixture } from "../scripts/parity/complex-compound-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const seed of [4, 16, 24]) {
  for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"]) {
    it(`retains helper extents through nested compounds, seed ${seed} ${direction}`, async () => {
      const input = complexCompoundFixture(seed, direction);
      const actual = await new NativeELK().layout(structuredClone(input));
      const expected = await new OracleELK().layout(structuredClone(input) as never);
      expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
    }, 30000);
  }
}
