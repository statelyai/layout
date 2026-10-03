import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

// Retained gains from two independent seed ranges. Compare every node, port,
// label, route and junction; other random failures remain in the broad reports.
for (const [seed, direction] of [
  [22, "UP"],
  [44, "RIGHT"],
  [44, "LEFT"],
  [44, "DOWN"],
  [44, "UP"],
  [49, "DOWN"],
  [49, "UP"],
] as const) {
  it(`matches complete helper ordering and BK alignment, seed ${seed} ${direction}`, async () => {
    const input = flatFixture(seed, direction);
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": seed % 2 === 1,
    };
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = await new OracleELK().layout(structuredClone(input) as never);
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}
