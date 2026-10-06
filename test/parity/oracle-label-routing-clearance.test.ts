import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { flatFixture } from "../../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT"] as const)
  for (const strategy of [
    "NONE",
    "LEFT",
    "RIGHT",
    "LEFT_RIGHT_CONSTRAINT_LOCKING",
    "LEFT_RIGHT_CONNECTION_LOCKING",
  ])
    it(`reserves both terminal clearances beside label layers (seed 9, ${direction}, ${strategy})`, async () => {
      const input = flatFixture(9, direction);
      input.layoutOptions = {
        ...input.layoutOptions,
        "elk.layered.compaction.postCompaction.strategy": strategy,
      };
      const actual = await new Native().layout(structuredClone(input));
      const expected = (await new Oracle().layout(structuredClone(input) as never)) as ElkNode;
      expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
    });
