import { describe, expect, it } from "vitest";
import {
  separateExteriorLabels,
  type ExteriorLabelEdge,
} from "../src/layered/separate-exterior-labels";

interface TestEdge extends ExteriorLabelEdge {
  inline: boolean;
  placement: "CENTER" | "HEAD" | "TAIL";
}

function fixture(order: readonly string[]): TestEdge[] {
  const edges: Record<string, TestEdge> = {
    moving: {
      id: "moving",
      x: 110,
      y: 100,
      width: 40,
      height: 30,
      points: [
        { x: 130, y: 80 },
        { x: 130, y: 150 },
      ],
      inline: true,
      placement: "CENTER",
    },
    head: {
      id: "head",
      x: 120,
      y: 100,
      width: 40,
      height: 30,
      points: [],
      inline: true,
      placement: "HEAD",
    },
    farther: {
      id: "farther",
      x: 170,
      y: 100,
      width: 40,
      height: 30,
      points: [],
      inline: false,
      placement: "CENTER",
    },
    tail: {
      id: "tail",
      x: 220,
      y: 100,
      width: 40,
      height: 30,
      points: [],
      inline: true,
      placement: "TAIL",
    },
  };
  return order.map((id) => structuredClone(edges[id]!));
}

function separate(edges: TestEdge[]): void {
  separateExteriorLabels({
    edges,
    nodeRects: [{ x: 0, y: 0, width: 100, height: 300 }],
    direction: "down",
    spacing: 10,
    settings: (edge) => ({ inline: edge.inline, placement: edge.placement }),
  });
}

describe("exterior label separation", () => {
  it("iterates past head, tail, and non-inline blockers", () => {
    const edges = fixture(["moving", "head", "farther", "tail"]);
    separate(edges);
    const moving = edges.find((edge) => edge.id === "moving")!;
    expect(moving.x).toBe(270);
    expect(moving.points).toEqual([
      { x: 290, y: 80 },
      { x: 290, y: 150 },
    ]);
  });

  it("does not depend on input edge order", () => {
    const forward = fixture(["moving", "head", "farther", "tail"]);
    const reverse = fixture(["tail", "farther", "head", "moving"]);
    separate(forward);
    separate(reverse);
    const geometry = (edges: TestEdge[]) =>
      Object.fromEntries(
        edges.map((edge) => [edge.id, { x: edge.x, y: edge.y, points: edge.points }]),
      );
    expect(geometry(reverse)).toEqual(geometry(forward));
  });

  it("leaves already clear labels and routes unchanged", () => {
    const edges = fixture(["moving", "head", "farther", "tail"]);
    edges[0]!.y = 200;
    edges[0]!.points = [
      { x: 130, y: 180 },
      { x: 130, y: 250 },
    ];
    const before = structuredClone(edges);
    separate(edges);
    expect(edges).toEqual(before);
  });
});
