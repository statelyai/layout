import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { complexCompoundFixture } from "../scripts/parity/complex-compound-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";
import { flatFixture } from "../scripts/parity/flat-corpus";

// ELK walks per-port edge lists shaped by reversal history, label dummies and
// hierarchy segments when it orders components and inserts dummies.
it.each([
  ["flat", 8, "DOWN"],
  ["flat", 12, "UP"],
  ["complex", 20, "RIGHT"],
] as const)(
  "follows ELK port edge lists (%s seed %i %s)",
  async (corpus, seed, direction) => {
    const input =
      corpus === "flat" ? flatFixture(seed, direction) : complexCompoundFixture(seed, direction);
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  },
  60000,
);
