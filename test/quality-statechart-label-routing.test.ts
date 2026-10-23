import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { readReport } from "../scripts/parity/read-report.mjs";
import { HARD, score } from "../scripts/parity/quality-gate";

const rows = (
  readReport("docs/heuristics/quality-statecharts/corpus.json.gz") as {
    rows: Array<{ input: ElkNode; elk: { graph?: ElkNode } }>;
  }
).rows;
const clean = Object.fromEntries(HARD.map((key) => [key, 0]));
const hard = (metrics: Record<string, number>) =>
  Object.fromEntries(HARD.map((key) => [key, metrics[key]]));

// An antiparallel pair keeps its forward edge straight. UP and LEFT layouts
// took the edge that runs toward larger coordinates as the forward one, so the
// pair aligned the reversed edge and bent the forward edge into a diagonal
// across the other label (simpleMachine, m0, history4).
it.each([82, 83, 234, 235, 300, 308])(
  "keeps antiparallel pairs straight in flow order (row %i)",
  async (index) => {
    const { input, elk } = rows[index]!;
    const layout = await new NativeELK().layout(structuredClone(input));
    expect(hard(score(layout, input))).toEqual(clean);
    const position = (graph: ElkNode) =>
      graph.children?.map(({ id, x, y }) => [id, Math.round(x!), Math.round(y!)]);
    expect(position(layout)).toEqual(position(elk.graph!));
  },
);

// A labeled feedback edge is routed one segment at a time. The segment into
// the label dummy approached its forward-side port from behind and the segment
// out of it left its backward-side port forward, so the joined route retraced
// the label's layer (138 px in inline-compound-digraph).
it.each([1088, 1089, 1090, 1091])(
  "routes feedback chains through label dummies from the ports' sides (row %i)",
  async (index) => {
    const { input } = rows[index]!;
    expect(hard(score(await new NativeELK().layout(structuredClone(input)), input))).toEqual(clean);
  },
);
