import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const) {
  for (const distribution of ["NORTH", "NORTH_SOUTH", "EQUALLY"] as const) {
    for (const ordering of ["STACKED", "SEQUENCED", "REVERSE_STACKED"] as const) {
      it(`preserves complete ${direction} ${distribution} ${ordering} loop envelope geometry`, async () => {
        const input: ElkNode = {
          id: "root",
          layoutOptions: { "elk.algorithm": "layered", "elk.direction": direction },
          children: [
            {
              id: "node",
              width: 80,
              height: 50,
              layoutOptions: {
                "elk.layered.edgeRouting.selfLoopDistribution": distribution,
                "elk.layered.edgeRouting.selfLoopOrdering": ordering,
              },
            },
          ],
          edges: Array.from({ length: 4 }, (_, index) => ({
            id: `loop-${index}`,
            sources: ["node"],
            targets: ["node"],
          })),
        };
        const actual = await new NativeELK().layout(structuredClone(input));
        const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
        expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
          [],
        );
      });
    }
  }
}

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const) {
  for (const seed of direction === "RIGHT" || direction === "LEFT" ? [11, 14] : [11]) {
    it(`matches complete random seed ${seed} after loop envelope placement (${direction})`, async () => {
      const input = flatFixture(seed, direction);
      const actual = await new NativeELK().layout(structuredClone(input));
      const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
      expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
    });
  }
}
