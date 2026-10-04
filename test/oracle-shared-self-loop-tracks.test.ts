import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundOptionsFixture } from "../scripts/parity/compound-options-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";
import { flatFixture } from "../scripts/parity/flat-corpus";

// ELK combines self loops that share a port into one hyperloop on one track.
it.each([
  ["flat", 7, "DOWN"],
  ["flat", 7, "UP"],
  ["options", 10, "DOWN"],
] as const)(
  "shares self-loop tracks across shared ports (%s seed %i %s)",
  async (corpus, seed, direction) => {
    const input =
      corpus === "flat" ? flatFixture(seed, direction) : compoundOptionsFixture(seed, direction);
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  },
  30000,
);
