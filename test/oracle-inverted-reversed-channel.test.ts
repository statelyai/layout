import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const [seed, direction, strategy] of [
  [43, "RIGHT", "LEFT_RIGHT_CONSTRAINT_LOCKING"],
  [33, "LEFT", "LEFT"],
  [43, "LEFT", "LEFT_RIGHT_CONSTRAINT_LOCKING"],
  [63, "RIGHT", "LEFT_RIGHT_CONSTRAINT_LOCKING"],
] as const) {
  it(`matches complete ELK geometry for reversed inverted channels (${seed}, ${direction}, ${strategy})`, async () => {
    const input = flatFixture(seed, direction);
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.compaction.postCompaction.strategy": strategy,
    };
    const actual = await new Native().layout(structuredClone(input));
    const expected = await new Oracle().layout(structuredClone(input) as never);
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}
