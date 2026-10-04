import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const [seed, direction, strategy] of [
  [23, "RIGHT", undefined],
  [67, "LEFT", "LEFT_RIGHT_CONSTRAINT_LOCKING"],
  [53, "DOWN", "LEFT"],
] as const) {
  it(`matches complete ELK geometry for random physical ports seed ${seed} ${direction}`, async () => {
    const input = flatFixture(seed, direction);
    if (strategy)
      input.layoutOptions = {
        ...input.layoutOptions,
        "elk.layered.compaction.postCompaction.strategy": strategy,
      };
    const actual = await new Native().layout(structuredClone(input));
    const expected = await new Oracle().layout(structuredClone(input) as never);
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}
