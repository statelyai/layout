import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { readReport } from "../scripts/parity/read-report.mjs";
import { HARD, score } from "../scripts/parity/quality-gate";

const rows = (
  readReport("docs/heuristics/quality-corpus/merge-edges.json.gz") as {
    rows: Array<{ input: ElkNode; elk: { graph: ElkNode } }>;
  }
).rows;

// Merged edges keep the crossing-minimized order of long-edge dummies; moving
// every dummy ahead of the real nodes in its layer crossed them over the
// graph: 168 -> 38, 55 -> 5 and 139 -> 10 crossings, the last with node hits
// and opposite-direction tracks.
it.each([
  [49, 38],
  [125, 5],
  [41, 10],
] as const)("keeps the crossing order of merged edges (row %i)", async (index, crossings) => {
  const { input, elk } = rows[index]!;
  const native = score(await new NativeELK().layout(structuredClone(input)), input);
  expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
    Object.fromEntries(HARD.map((key) => [key, 0])),
  );
  expect(native.edgeCrossings).toBeLessThanOrEqual(crossings);
  expect(native.edgeCrossings).toBeLessThanOrEqual(score(elk.graph, input).edgeCrossings);
});
