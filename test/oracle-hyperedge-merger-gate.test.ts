import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundOptionsFixture } from "../scripts/parity/compound-options-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

// ELK runs HyperedgeDummyMerger only when import finds a port with several
// incoming or outgoing edges; ports with one of each never merge dummies.
it("keeps long-edge dummies apart without imported hyperedges (options seed 5 RIGHT)", async () => {
  const input = compoundOptionsFixture(5, "RIGHT");
  const actual = await new NativeELK().layout(structuredClone(input));
  const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
  expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
}, 30000);
