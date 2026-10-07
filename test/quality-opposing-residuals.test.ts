import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { readReport } from "../scripts/parity/read-report.mjs";
import { HARD, score } from "../scripts/parity/quality-gate";

// Corpus cases that kept short opposite-direction stubs at ports carrying both
// directions until crossing minimization grouped each direction's neighbours
// and the router gave each direction its own attachment run.
it.each([
  ["complex", 92],
  ["directional-fresh", 26],
  ["directional", 36],
  ["flat", 36],
  ["random", 41],
] as const)(
  "keeps opposite-direction edges off shared stubs (%s #%i)",
  async (corpus, index) => {
    const { input } = (
      readReport(`docs/heuristics/quality-corpus/${corpus}.json.gz`) as {
        rows: Array<{ input: ElkNode }>;
      }
    ).rows[index]!;
    const native = score(await new NativeELK().layout(structuredClone(input)), input);
    expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
      Object.fromEntries(HARD.map((key) => [key, 0])),
    );
  },
  60000,
);
