import { expect, it } from "vitest";
import { findPathBetweenLeads, type SearchContext } from "../src/routing/search";

it("does not consume its final lead during a distant orthogonal excursion", () => {
  // Minimized from seed 155921 / graph 5, E44. Immediate-reversal checks
  // alone allow the earlier horizontal track to consume the appended lead.
  const context: SearchContext = {
    obstacles: () => [],
    guides: () => [{ x: 5, y: 20, width: 15, height: 10 }],
    maxSearchNodes: 10000,
    bendPenalty: 10,
    visited: 0,
    budgetExceeded: false,
    edgeCost: (a, b) =>
      (a.y === 20 && b.y === 20 && Math.max(a.x, b.x) > 20) ||
      (a.y === 0 && b.y === 0) ||
      (a.x === 0 && b.x === 0 && Math.min(a.y, b.y) < 20) ||
      (a.x === 20 && b.x === 20 && Math.max(a.y, b.y) > 20)
        ? 1000
        : 0,
  };
  const end = { x: 0, y: 20 };
  const path = findPathBetweenLeads(
    { x: 20, y: 0 },
    end,
    "orthogonal",
    context,
    [[end, { x: 10, y: 20 }]],
    { incoming: { x: 0, y: 1 }, outgoing: { x: 1, y: 0 } },
  );
  expect(path).toBeDefined();
  expect(path!.at(-1)).toEqual(end);
  for (let i = 1; i < path!.length; i++) {
    const a = path![i - 1]!,
      b = path![i]!;
    expect(a.x === b.x || a.y === b.y).toBe(true);
    if (a.y === 20 && b.y === 20)
      expect(
        Math.min(10, Math.max(a.x, b.x)) - Math.max(0, Math.min(a.x, b.x)),
      ).toBeLessThanOrEqual(0);
  }
  expect(context.visited).toBeGreaterThan(0);
  expect(context.visited).toBeLessThanOrEqual(context.maxSearchNodes);
  expect(context.budgetExceeded).toBe(false);
});
