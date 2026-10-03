import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import {
  compoundFixture,
  compoundGeometry,
  geometryDifferences,
} from "../scripts/parity/compound-corpus";
import { flatFixture } from "../scripts/parity/flat-corpus";

for (const [seed, direction, strategy] of [
  [10, "RIGHT", "RIGHT"],
  [10, "LEFT", "RIGHT"],
  [10, "DOWN", "RIGHT"],
  [10, "UP", "RIGHT"],
  [19, "DOWN", "LEFT_RIGHT_CONSTRAINT_LOCKING"],
  [19, "UP", "LEFT_RIGHT_CONSTRAINT_LOCKING"],
] as const) {
  it(`retains joined long-edge bends after compaction (${seed}, ${direction}, ${strategy})`, async () => {
    const input = compoundFixture(seed, direction);
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.compaction.postCompaction.strategy": strategy,
    };
    const actual = await new Native().layout(structuredClone(input));
    const expected = (await new Oracle().layout(structuredClone(input) as never)) as ElkNode;
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}

for (const direction of ["RIGHT", "LEFT"] as const) {
  it(`retains orthogonal dummy-anchor corners (flat seed 14, ${direction})`, async () => {
    const input = flatFixture(14, direction);
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.compaction.postCompaction.strategy": "RIGHT",
    };
    const actual = await new Native().layout(structuredClone(input));
    const expected = (await new Oracle().layout(structuredClone(input) as never)) as ElkNode;
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const) {
  it(`retains compacted segment bends (flat seed 5, ${direction})`, async () => {
    const input = flatFixture(5, direction);
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.compaction.postCompaction.strategy": "LEFT",
    };
    const actual = await new Native().layout(structuredClone(input));
    const expected = (await new Oracle().layout(structuredClone(input) as never)) as ElkNode;
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}
