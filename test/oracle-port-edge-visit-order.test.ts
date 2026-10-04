import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";
import { flatFixture } from "../scripts/parity/flat-corpus";

// Barycenter recursion follows each port's edges in ELK's list order, so
// same-layer neighbours draw their random perturbation in that order.
it("visits port edges in ELK list order (flat seed 33 DOWN, LEFT compaction)", async () => {
  const input = flatFixture(33, "DOWN");
  input.layoutOptions = {
    ...input.layoutOptions,
    "elk.layered.compaction.postCompaction.strategy": "LEFT",
  };
  const actual = await new NativeELK().layout(structuredClone(input));
  const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
  expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
}, 30000);
