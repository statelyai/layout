import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import { measureLayout } from "../src/elkjs/layout-quality";
import type { ElkNode } from "../src/elkjs/types";
import { readReport } from "../scripts/parity/read-report.mjs";
import { HARD, score } from "../scripts/parity/quality-gate";

// Crossing minimization's mixed-port model (two ports per mixed port, grouped
// neighbours) steered these graphs into much worse orders: 57 -> 115, 46 -> 76
// and 71 -> 106 crossings. Graphs where the model applies are also laid out
// without it and keep the better result, so they return to the earlier counts.
it.each([
  ["expanded", 26, 57],
  ["fresh", 61, 48],
  ["fresh", 86, 71],
  ["random", 32, 7],
] as const)(
  "keeps mixed-port graphs near their crossings without the model (%s #%i)",
  async (corpus, index, crossings) => {
    const { input } = (
      readReport(`docs/heuristics/quality-corpus/${corpus}.json.gz`) as {
        rows: Array<{ input: ElkNode }>;
      }
    ).rows[index]!;
    const native = score(await new NativeELK().layout(structuredClone(input)), input);
    expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
      Object.fromEntries(HARD.map((key) => [key, 0])),
    );
    expect(native.edgeCrossings).toBeLessThanOrEqual(crossings);
  },
  60000,
);

// Candidate selection counts crossings as the quality gate does: a crossing
// on the clearance border around a shared endpoint node does not count.
it("ignores crossings on the clearance border of shared endpoints", () => {
  const graph: ElkNode = {
    id: "root",
    children: [
      { id: "a", x: 0, y: 0, width: 40, height: 40 },
      { id: "b", x: 0, y: 200, width: 40, height: 40 },
    ],
    edges: [
      {
        id: "down",
        sources: ["a"],
        targets: ["b"],
        sections: [{ id: "s0", startPoint: { x: 20, y: 40 }, endPoint: { x: 20, y: 200 } }],
      },
      {
        id: "across",
        sources: ["b"],
        targets: ["a"],
        sections: [
          {
            id: "s1",
            startPoint: { x: 0, y: 220 },
            bendPoints: [
              { x: -30, y: 220 },
              { x: -30, y: 188 },
              { x: 60, y: 188 },
              { x: 60, y: 20 },
            ],
            endPoint: { x: 40, y: 20 },
          },
        ],
      },
    ],
  };
  // `across` meets `down` at y = 188, exactly 12px above b.
  expect(measureLayout(graph).crossings).toBe(0);
});
