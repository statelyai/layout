import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";
import { flatFixture } from "../scripts/parity/flat-corpus";

// Barycenter perturbations follow the initial layer order. ELK seeds it with
// component order, then LongEdgeSplitter appends dummies in authored port order.
it.each([
  [10, "RIGHT"],
  [22, "LEFT"],
  [22, "UP"],
])(
  "seeds crossing minimization in LongEdgeSplitter order (flat seed %i %s)",
  async (seed, direction) => {
    const input = flatFixture(seed, direction);
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  },
  30000,
);
