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

// Merged edges share implicit ports, so they can form shared tracks without
// any explicit port; such graphs try the separated count too (32 -> 19).
it("separates shared tracks of merged implicit ports", async () => {
  const sizes = [
    [96, 44],
    [92, 34],
    [92, 38],
    [68, 50],
    [84, 38],
    [56, 54],
    [76, 54],
    [96, 44],
    [68, 44],
    [80, 38],
    [72, 34],
  ];
  const ends = [
    [3, 7],
    [7, 4],
    [1, 2],
    [10, 3],
    [3, 6],
    [10, 1],
    [9, 6],
    [4, 6],
    [6, 9],
    [0, 2],
    [7, 10],
    [2, 4],
    [7, 1],
    [3, 5],
    [5, 4],
    [2, 8],
    [3, 6],
    [1, 3],
    [6, 3],
    [0, 5],
    [1, 6],
    [1, 10],
    [8, 9],
    [3, 2],
    [3, 6],
  ];
  const input: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.mergeEdges": "true",
    },
    children: sizes.map(([width, height], i) => ({ id: `n${i}`, width, height })),
    edges: ends.map(([source, target], i) => ({
      id: `e${i}`,
      sources: [`n${source}`],
      targets: [`n${target}`],
    })),
  };
  const native = score(await new NativeELK().layout(structuredClone(input)), input);
  expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
    Object.fromEntries(HARD.map((key) => [key, 0])),
  );
  expect(native.edgeCrossings).toBeLessThanOrEqual(19);
}, 60000);

// Separated edges are counted by inversions, not pairwise.
it("scores a dense shared hyperedge in near-linear time", () => {
  const ports = Array.from({ length: 400 }, (_, i) => ({
    id: `${i < 200 ? "s" : "t"}${i % 200}`,
    side: i < 200 ? ("source" as const) : ("target" as const),
    position: i % 200,
  }));
  const connections = Array.from({ length: 20000 }, (_, i) => ({
    source: `s${i % 200}`,
    target: `t${Math.floor(i / 100) % 200}`,
  }));
  const started = performance.now();
  expect(scoreOrthogonalHypersegments(ports, connections, true).shared).toBe(true);
  expect(performance.now() - started).toBeLessThan(500);
});
