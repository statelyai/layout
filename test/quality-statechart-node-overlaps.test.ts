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

// Component compaction measured nodes only, in the unmirrored frame: an UP
// self-loop component overlapped its neighbour (#370), and self-loops and
// labels landed on the next component (#368, espresso-bar #1064, #1072).
// A parallel labeled pair realigned its nodes over their layer neighbours
// (system-routing-lanes #1096-#1099).
it.each([370, 368, 345, 887, 1037, 1048, 1064, 1072, 1096, 1097, 1098, 1099])(
  "keeps statechart corpus #%i free of hard defects",
  async (index) => {
    const { input } = rows[index]!;
    const native = score(await new NativeELK().layout(structuredClone(input)), input);
    expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
      Object.fromEntries(HARD.map((key) => [key, 0])),
    );
  },
  60000,
);

// Feedback chains whose outer track is shared by other feedback routes took a
// detour to their in-layer label and back, through the parallel region's nodes.
it("keeps magscope's feedback chains off its nodes (#68)", async () => {
  const { input } = rows[68]!;
  const native = score(await new NativeELK().layout(structuredClone(input)), input);
  expect(native.nodeOverlaps).toBe(0);
  expect(native.nodeHits).toBe(0);
  expect(native.labelNodeOverlaps).toBe(0);
}, 60000);
