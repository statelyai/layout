import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";
import { flatFixture } from "../../scripts/parity/flat-corpus";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const) {
  for (const distribution of ["NORTH", "NORTH_SOUTH", "EQUALLY"]) {
    for (const count of [1, 2, 4]) {
      it(`matches ${direction} ${distribution} with ${count} exterior labeled loops`, async () => {
        const input: ElkNode = {
          id: "root",
          layoutOptions: { "elk.algorithm": "layered", "elk.direction": direction },
          children: [
            {
              id: "n",
              width: 100,
              height: 64,
              layoutOptions: { "elk.layered.edgeRouting.selfLoopDistribution": distribution },
            },
          ],
          edges: Array.from({ length: count }, (_, index) => ({
            id: `e${index}`,
            sources: ["n"],
            targets: ["n"],
            labels: [{ text: `E${index}`, width: 32, height: 14 }],
          })),
        };
        const actual = await new Native().layout(structuredClone(input));
        const expected = await new Oracle().layout(structuredClone(input) as never);
        expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
          [],
        );
      });
    }
  }
}
for (const direction of ["DOWN", "UP"] as const) {
  it(`matches complete random seed 4 after reserving the loop label (${direction})`, async () => {
    const input = flatFixture(4, direction);
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.compaction.postCompaction.strategy": "LEFT_RIGHT_CONNECTION_LOCKING",
    };
    const actual = await new Native().layout(structuredClone(input));
    const expected = await new Oracle().layout(structuredClone(input) as never);
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}
