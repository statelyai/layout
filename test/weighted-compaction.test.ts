import { expect, it } from "vitest";
import {
  solveWeightedCompaction,
  type CompactionConstraint,
} from "../src/layered/weighted-compaction";

it("minimizes weighted edge length rather than compacting every group left", () => {
  const result = solveWeightedCompaction(
    ["a", "b", "c"],
    [
      { source: "a", target: "c", delta: 10, weight: 1 },
      { source: "b", target: "c", delta: 0, weight: 100 },
    ],
  );
  expect(result.get("c")! - result.get("a")!).toBe(10);
  expect(result.get("c")! - result.get("b")!).toBe(0);
});

it("matches exhaustive optimum on 64 reproducible random constraint graphs", () => {
  let state = 20261002;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  for (let seed = 0; seed < 64; seed++) {
    const groups = ["a", "b", "c", "d"];
    const constraints: CompactionConstraint[] = [];
    for (let source = 0; source < 4; source++) {
      for (let target = source + 1; target < 4; target++) {
        if (random() % 3 === 0) continue;
        constraints.push({
          source: groups[source]!,
          target: groups[target]!,
          delta: random() % 3,
          weight: [1, 2, 100][random() % 3]!,
        });
      }
    }
    const score = (positions: Map<string, number>) =>
      constraints.reduce(
        (sum, edge) =>
          sum + edge.weight * (positions.get(edge.target)! - positions.get(edge.source)!),
        0,
      );
    const result = solveWeightedCompaction(groups, constraints);
    for (const edge of constraints) {
      expect(
        result.get(edge.target)! - result.get(edge.source)!,
        `seed ${seed}`,
      ).toBeGreaterThanOrEqual(edge.delta);
    }
    let optimum = Infinity;
    for (let a = 0; a <= 6; a++)
      for (let b = 0; b <= 6; b++)
        for (let c = 0; c <= 6; c++)
          for (let d = 0; d <= 6; d++) {
            const positions = new Map(groups.map((id, index) => [id, [a, b, c, d][index]!]));
            if (
              constraints.some(
                (edge) => positions.get(edge.target)! - positions.get(edge.source)! < edge.delta,
              )
            )
              continue;
            optimum = Math.min(optimum, score(positions));
          }
    expect(score(result), `seed ${seed}`).toBe(optimum);
  }
});

it("rounds separation upward and connects disconnected groups", () => {
  const result = solveWeightedCompaction(
    ["a", "b", "c"],
    [{ source: "a", target: "b", delta: 2.25, weight: 2 }],
  );
  expect(result.get("b")! - result.get("a")!).toBe(3);
  expect(Number.isFinite(result.get("c"))).toBe(true);
});

it("rejects cyclic constraints before tight-tree growth", () => {
  expect(() =>
    solveWeightedCompaction(
      ["a", "b"],
      [
        { source: "a", target: "b", delta: 1, weight: 1 },
        { source: "b", target: "a", delta: 1, weight: 1 },
      ],
    ),
  ).toThrow("Cyclic compaction constraints");
});
