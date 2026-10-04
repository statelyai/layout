import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";
import { flatFixture } from "../scripts/parity/flat-corpus";

// A hyperedge-merged dummy keeps an inverted dummy's in-layer edge. That edge
// still joins the routing hyperedge through the dummy's forward-facing port.
it.each([
  [27, "UP", "LEFT_RIGHT_CONSTRAINT_LOCKING"],
  [73, "RIGHT", "LEFT"],
])(
  "routes merged dummy in-layer edges (flat seed %i %s, %s compaction)",
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
