import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const) {
  for (const strategy of [
    "LEFT",
    "RIGHT",
    "LEFT_RIGHT_CONSTRAINT_LOCKING",
    "LEFT_RIGHT_CONNECTION_LOCKING",
  ]) {
    for (const seed of direction === "DOWN" || direction === "UP" ? [14, 44] : [44]) {
      it(`matches ELK smart label complete geometry: seed ${seed} ${direction} ${strategy}`, async () => {
        const input = flatFixture(seed, direction);
        input.layoutOptions = {
          ...input.layoutOptions,
          "elk.layered.compaction.postCompaction.strategy": strategy,
        };
        const actual = compoundGeometry(await new Native().layout(structuredClone(input)));
        const expected = compoundGeometry(
          await new Oracle().layout(structuredClone(input) as never),
        );
        expect(geometryDifferences(actual, expected)).toEqual([]);
      });
    }
  }
}
