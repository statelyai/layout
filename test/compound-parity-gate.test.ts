import { describe, expect, it } from "vitest";
import {
  compoundFixture,
  compoundGeometry,
  geometryDifferences,
} from "../scripts/parity/compound-corpus";
import type { ElkNode } from "../src/elkjs/types";
import { readFixture } from "./helpers/fixture";

const baseline = readFixture("compound-baseline-report") as {
  rows: { seed: number; direction: string; input: ElkNode; elk: { graph: ElkNode } }[];
};

describe("strict compound parity gate", () => {
  it("replays every preserved input without resampling or changing random draws", () => {
    expect(baseline.rows).toHaveLength(100);
    for (const row of baseline.rows)
      expect(compoundFixture(row.seed, row.direction)).toEqual(row.input);
  });

  it("detects route, ownership and geometry regressions independently", () => {
    const expected = compoundGeometry(baseline.rows[0]!.elk.graph);
    expect(geometryDifferences(expected, structuredClone(expected))).toEqual([]);
    const paths = [
      ["children", 0, "width"],
      ["children", 0, "children", 0, "y"],
      ["edges", 0, "container"],
      ["edges", 0, "sources", 0],
      ["edges", 0, "sections", 0, "start", "y"],
      ["edges", 0, "sections", 0, "bends", 0, "x"],
      ["edges", 0, "sections", 0, "incoming"],
      ["edges", 0, "sections", 0, "outgoingSections"],
      ["edges", 0, "junctions"],
    ];
    for (const path of paths) {
      const changed = structuredClone(expected);
      let owner = changed as Record<string | number, unknown>;
      for (const key of path.slice(0, -1)) owner = owner[key] as typeof owner;
      const key = path.at(-1)!;
      const original = owner[key];
      owner[key] = typeof original === "number" ? original + 1 : "changed";
      expect(geometryDifferences(changed, expected), path.join(".")).not.toEqual([]);
    }
  });

  it("retains the oracle numeric tolerance and rejects non-finite coordinates", () => {
    expect(geometryDifferences({ x: 1 }, { x: 1 + 1e-13 })).toEqual([]);
    for (const x of [1 + 1e-12, NaN, Infinity, -Infinity]) {
      expect(geometryDifferences({ x }, { x: 1 })).not.toEqual([]);
    }
    expect(geometryDifferences({ x: NaN }, { x: NaN })).not.toEqual([]);
  });
});
