import { describe, expect, it } from "vitest";
import { segmentAvoidsRect, shortestVisibilityPath } from "../src/routing/bezier-visibility";

const rect = { x: 10, y: 10, width: 20, height: 20 };

describe("any-angle visibility routing", () => {
  it("chooses the nearest clear attachment and preserves candidate order on ties", () => {
    const end = { x: 100, y: 0 };
    const nearest = { x: 60, y: 0 };
    expect(shortestVisibilityPath([{ x: 0, y: 0 }, nearest], end, [], [])).toEqual([nearest, end]);
    const first = { x: 60, y: -10 };
    expect(shortestVisibilityPath([first, { x: 60, y: 10 }], end, [], [])).toEqual([first, end]);
    const clear = { x: 60, y: 120 };
    expect(
      shortestVisibilityPath(
        [{ x: 95, y: 0 }, clear],
        end,
        [{ x: 90, y: -5, width: 8, height: 10 }],
        [],
      ),
    ).toEqual([clear, end]);
  });

  it("rejects crossing and wholly contained segments, including zero length", () => {
    for (const [start, end] of [
      [
        { x: 0, y: 0 },
        { x: 40, y: 40 },
      ],
      [
        { x: 15, y: 15 },
        { x: 25, y: 25 },
      ],
      [
        { x: 20, y: 20 },
        { x: 20, y: 20 },
      ],
    ])
      expect(segmentAvoidsRect(start!, end!, rect)).toBe(false);
    expect(segmentAvoidsRect({ x: 10, y: 10 }, { x: 30, y: 10 }, rect)).toBe(true);
  });

  it("returns deterministic clear detours around overlapping rectangles", () => {
    const blockers = [rect, { x: 20, y: 20, width: 20, height: 20 }];
    const run = () => shortestVisibilityPath([{ x: 0, y: 0 }], { x: 50, y: 50 }, blockers, []);
    const path = run()!;
    expect(run()).toEqual(path);
    expect(path.length).toBeGreaterThan(2);
    for (let index = 1; index < path.length; index++)
      for (const blocker of blockers)
        expect(segmentAvoidsRect(path[index - 1]!, path[index]!, blocker)).toBe(true);
  });

  it("fails closed when the endpoint is inside a blocker", () => {
    expect(shortestVisibilityPath([{ x: 0, y: 0 }], { x: 20, y: 20 }, [rect], [])).toBeUndefined();
  });

  it("keeps local obstacle detours in large graphs while bounding corner candidates", () => {
    const obstacles = [
      rect,
      ...Array.from({ length: 100 }, (_, index) => ({
        x: 1000 + index * 30,
        y: 1000,
        width: 20,
        height: 20,
      })),
    ];
    expect(
      shortestVisibilityPath([{ x: 0, y: 0 }], { x: 50, y: 50 }, obstacles, [])!.length,
    ).toBeGreaterThan(2);
    expect(shortestVisibilityPath([{ x: 0, y: 0 }], { x: 50, y: 0 }, obstacles, [])).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]);
  });

  it("fails closed when overlapping blockers bury every selected corner", () => {
    const wall = { x: 40, y: -1000, width: 20, height: 2010 };
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 0 };
    expect(shortestVisibilityPath([start], end, [wall], [])!.length).toBeGreaterThan(2);
    const buried = Array.from({ length: 48 }, (_, index) => ({
      x: 45 + index / 10,
      y: -1,
      width: 1,
      height: 2,
    }));
    expect(shortestVisibilityPath([start], end, [...buried, wall], [])).toBeUndefined();
  });
});
