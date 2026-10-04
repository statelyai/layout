import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";
import { flatFixture } from "../scripts/parity/flat-corpus";

// HyperedgeDummyMerger can absorb an inverted-port dummy; its in-layer edge
// still turns in the adjacent channel rather than around the whole graph.
it.each([
  [13, "UP"],
  [17, "UP"],
])(
  "routes a merged inverted dummy's in-layer edge like ELK (flat seed %i %s)",
  async (seed, direction) => {
    const input = flatFixture(seed, direction);
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  },
  30000,
);
