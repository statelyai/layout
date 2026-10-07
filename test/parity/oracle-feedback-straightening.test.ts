import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { flatFixture } from "../../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const) {
  for (const seed of direction === "DOWN" || direction === "UP" ? [1, 6, 21] : [6]) {
    it(`straightens feedback edges in layout orientation: seed ${seed} ${direction}`, async () => {
      const input = flatFixture(seed, direction);
      const actual = await new NativeELK().layout(structuredClone(input));
      const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
      expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
    });
  }
}
