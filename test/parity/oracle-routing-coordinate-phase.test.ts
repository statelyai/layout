import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { flatFixture } from "../../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT"] as const) {
  it(`routes seed 1 before coordinate normalization (${direction})`, async () => {
    const input = flatFixture(1, direction);
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}
