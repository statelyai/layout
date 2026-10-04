import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";
import { flatFixture } from "../scripts/parity/flat-corpus";

// ELK's greedy switch decides from local two-node counts, including in-layer
// and north/south crossings, after north/south ports take their dummy's side.
it.each([
  [63, "DOWN", "LEFT_RIGHT_CONSTRAINT_LOCKING"],
  [58, "UP", "RIGHT"],
  [37, "DOWN", "LEFT"],
])(
  "decides greedy switches like ELK (flat seed %i %s, %s compaction)",
  async (seed, direction, strategy) => {
    const input = flatFixture(seed, direction);
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.compaction.postCompaction.strategy": strategy,
    };
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  },
  30000,
);
