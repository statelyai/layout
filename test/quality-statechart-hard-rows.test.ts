import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { readReport } from "../scripts/parity/read-report.mjs";
import { HARD, score } from "../scripts/parity/quality-gate";

const rows = (
  readReport("docs/heuristics/quality-statecharts/corpus.json.gz") as {
    rows: Array<{ input: ElkNode }>;
  }
).rows;
const clean = Object.fromEntries(HARD.map((key) => [key, 0]));
const hard = (metrics: Record<string, number>) =>
  Object.fromEntries(HARD.map((key) => [key, metrics[key]]));

// The Magscope coordinator in all four directions (real ELK crashes on it).
// Native had feedback legs cutting through taller compound siblings and their
// labels, a compound boundary port flipped by its parent (RIGHT and LEFT,
// whose compounds lay out DOWN), and stacked self-loop labels crossed by the
// outer loops' legs.
it.each([68, 69, 70, 71])("lays out statechart row %i without hard defects", async (index) => {
  const { input } = rows[index]!;
  const layout = await new NativeELK().layout(structuredClone(input));
  expect(hard(score(layout, input))).toEqual(clean);
});
