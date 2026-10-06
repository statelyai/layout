import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../../src/elkjs";
import { flatFixture } from "../../scripts/parity/flat-corpus";
import {
  compoundFixture,
  compoundGeometry,
  geometryDifferences,
} from "../../scripts/parity/compound-corpus";

for (const [seed, direction] of [
  [22, "DOWN"],
  [36, "RIGHT"],
  [36, "LEFT"],
  [38, "DOWN"],
] as const) {
  it(`retains physical helper cross-axis extent, seed ${seed} ${direction}`, async () => {
    const input = flatFixture(seed, direction);
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": false,
    };
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = await new OracleELK().layout(structuredClone(input) as never);
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}

it("retains zero-size helper bounds with default model ordering, seed 22 DOWN", async () => {
  const input = flatFixture(22, "DOWN");
  const actual = await new NativeELK().layout(structuredClone(input));
  const expected = await new OracleELK().layout(structuredClone(input) as never);
  expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
});

for (const direction of ["RIGHT", "LEFT"] as const) {
  it(`retains nested helper bounds through RIGHT compaction, seed 62 ${direction}`, async () => {
    const input = compoundFixture(62, direction);
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.compaction.postCompaction.strategy": "RIGHT",
    };
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = await new OracleELK().layout(structuredClone(input) as never);
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}
