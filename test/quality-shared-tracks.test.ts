import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { scoreOrthogonalHypersegments } from "../src/layered/orthogonal-hypersegments";
import { readReport } from "../scripts/parity/read-report.mjs";
import { HARD, score } from "../scripts/parity/quality-gate";

// a0 -> b1, a0 -> b0 and a1 -> b0 form one ELK hyperedge: a single shared
// track, so ELK counts no crossing. a0 -> b1 runs down that track while
// a1 -> b0 runs up it; routing never shares a track in opposite directions,
// so those two edges take separate tracks and cross.
it("counts a hyperedge that would share a track edge by edge", () => {
  const ports = [
    { id: "a0", side: "source" as const, position: 0 },
    { id: "a1", side: "source" as const, position: 1 },
    { id: "b0", side: "target" as const, position: 0 },
    { id: "b1", side: "target" as const, position: 1 },
  ];
  const connections = [
    { source: "a0", target: "b1" },
    { source: "a0", target: "b0" },
    { source: "a1", target: "b0" },
  ];
  expect(scoreOrthogonalHypersegments(ports, connections)).toEqual({
    count: 0,
    shared: true,
  });
  expect(scoreOrthogonalHypersegments(ports, connections, true)).toEqual({
    count: 1,
    shared: true,
  });
  // A fan-out leaves one port both ways, so its edges never share a track.
  expect(
    scoreOrthogonalHypersegments(ports.slice(0, 1).concat(ports.slice(2)), [
      { source: "a0", target: "b0" },
      { source: "a0", target: "b1" },
    ]).shared,
  ).toBe(false);
});

// Graphs with such hyperedges are also laid out counting them edge by edge,
// and keep the better result: 99 -> 65 and 112 -> 84 crossings.
it.each([
  ["fresh", 36, 65],
  ["complex", 50, 84],
  ["flat", 87, 25],
] as const)(
  "lays out graphs with shared tracks with fewer crossings (%s #%i)",
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
