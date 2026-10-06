import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";
import { flatFixture } from "../../scripts/parity/flat-corpus";

// Forced model order can leave a north/south port dummy on the other side of
// its node. ELK then moves the port to that side for placement and routing.
it.each([
  [3, "RIGHT"],
  [23, "DOWN"],
  [17, "RIGHT"],
])(
  "switches north/south ports to their dummy's side (flat seed %i %s)",
  async (seed, direction) => {
    const input = flatFixture(seed, direction);
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": seed % 2 === 1,
    };
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  },
  30000,
);
