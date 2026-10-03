import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

// Seed 44 still has flow-axis compaction differences; retain the full failing
// corpus while independently guarding its repaired node/route/label cross axis.
function crossAxis(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(crossAxis);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "y" && key !== "height")
        .map(([key, entry]) => [key, crossAxis(entry)]),
    );
  return value;
}

for (const direction of ["DOWN", "UP"] as const) {
  for (const strategy of [
    "LEFT",
    "RIGHT",
    "LEFT_RIGHT_CONSTRAINT_LOCKING",
    "LEFT_RIGHT_CONNECTION_LOCKING",
  ]) {
    for (const seed of [14, 44]) {
      it(`matches ELK smart label ${seed === 14 ? "complete" : "cross-axis"} geometry: seed ${seed} ${direction} ${strategy}`, async () => {
        const input = flatFixture(seed, direction);
        input.layoutOptions = {
          ...input.layoutOptions,
          "elk.layered.compaction.postCompaction.strategy": strategy,
        };
        const actual = compoundGeometry(await new Native().layout(structuredClone(input)));
        const expected = compoundGeometry(
          await new Oracle().layout(structuredClone(input) as never),
        );
        expect(
          geometryDifferences(
            seed === 44 ? crossAxis(actual) : actual,
            seed === 44 ? crossAxis(expected) : expected,
          ),
        ).toEqual([]);
      });
    }
  }
}
