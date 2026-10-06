import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";
import { flatFixture } from "../../scripts/parity/flat-corpus";

// Retain seeds spanning forced/unforced ordering, cycles, parallel edges and labels.
// The larger randomized gate preserves failures outside these repaired cases.
describe("random model-order complete geometry parity", () => {
  for (const seed of [1, 4, 5, 6, 11, 16, 25]) {
    for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"]) {
      it(`matches seed ${seed}, ${direction}`, async () => {
        const input = flatFixture(seed, direction);
        input.layoutOptions = {
          ...input.layoutOptions,
          "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
          "elk.layered.crossingMinimization.forceNodeModelOrder": seed % 2 === 1,
        };
        const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
        const actual = await new NativeELK().layout(structuredClone(input));
        expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
          [],
        );
      });
    }
  }
});
