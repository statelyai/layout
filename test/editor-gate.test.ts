import { describe, expect, it } from "vitest";
import { compare, orderRelations, scoreRow } from "../scripts/parity/editor-gate";

type Rect = [number, number, number, number];
const node = (id: string, rect: Rect, parentId?: string) => ({
  id,
  rect,
  ...(parentId ? { parentId } : {}),
});
const row = (
  nodes: ReturnType<typeof node>[],
  edges: Array<{
    id: string;
    sourceId: string;
    targetId: string;
    label?: Rect;
    branchOf?: string;
    segments: Array<Array<[number, number]>>;
  }>,
  direction = "DOWN",
) => ({ source: "s", machine: "m", direction, canvas: null, layoutErrors: [], nodes, edges });

describe("editor gate scoring", () => {
  it("ignores routes that graze a box by under a pixel", () => {
    const metrics = scoreRow(
      row(
        [node("a", [0, 0, 100, 40]), node("b", [0, 200, 100, 40]), node("c", [100.5, 100, 50, 40])],
        [
          {
            id: "e",
            sourceId: "a",
            targetId: "b",
            segments: [
              [
                [50, 40],
                [50, 120],
                [101, 120],
                [101, 200],
              ],
            ],
          },
        ],
      ),
    );
    expect(metrics.nodeHits).toBe(0);
  });

  it("counts label hits only between different transition families", () => {
    const nodes = [node("a", [0, 0, 100, 40]), node("b", [0, 300, 100, 40])];
    const trunk: Array<[number, number]> = [
      [50, 40],
      [50, 300],
    ];
    const stacked = [
      {
        id: "t1",
        sourceId: "a",
        targetId: "b",
        label: [20, 100, 60, 30] as Rect,
        segments: [trunk],
      },
      {
        id: "t2",
        sourceId: "a",
        targetId: "b",
        label: [20, 180, 60, 30] as Rect,
        segments: [trunk],
      },
    ];
    expect(scoreRow(row(nodes, stacked)).edgeLabelHits).toBe(0);
    const unrelated = [
      stacked[0]!,
      {
        id: "u",
        sourceId: "b",
        targetId: "a",
        label: [20, 180, 60, 30] as Rect,
        segments: [
          [
            [150, 300],
            [150, 40],
          ] as Array<[number, number]>,
        ],
      },
    ];
    expect(scoreRow(row(nodes, unrelated)).edgeLabelHits).toBe(1);
  });

  it("counts routes through a compound state that holds neither endpoint", () => {
    const metrics = scoreRow(
      row(
        [
          node("a", [0, 0, 100, 40]),
          node("b", [0, 400, 100, 40]),
          node("g", [-50, 150, 300, 150]),
          node("g.x", [150, 200, 60, 40], "g"),
        ],
        [
          {
            id: "e",
            sourceId: "a",
            targetId: "b",
            segments: [
              [
                [50, 40],
                [50, 400],
              ],
            ],
          },
        ],
      ),
    );
    expect(metrics.groupHits).toBe(1);
    expect(compare(metrics, { ...metrics, groupHits: 0 }).status).toBe("LOSS");
    const dirty = { ...metrics, edgeLabelHits: 1 };
    expect(compare({ ...dirty, groupHits: 2 }, dirty)).toEqual({ status: "LOSS", metric: "hard" });
    expect(compare({ ...dirty, groupHits: 2, edgeLabelHits: 0 }, dirty).metric).not.toBe("hard");
  });

  it("reports sibling order changes along and across the flow", () => {
    const before = row([node("a", [0, 0, 50, 40]), node("b", [100, 0, 50, 40])], []);
    const swapped = row([node("a", [100, 0, 50, 40]), node("b", [0, 0, 50, 40])], []);
    const stacked = row([node("a", [0, 0, 50, 40]), node("b", [0, 100, 50, 40])], []);
    expect(orderRelations(before).get("a|b")).toBe("left");
    expect(orderRelations(swapped).get("a|b")).toBe("right");
    expect(orderRelations(stacked).get("a|b")).toBe("before");
  });
});
