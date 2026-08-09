/*******************************************************************************
 * Adapted from kieler/elkjs test/mocha/testLayouters.js at tag 0.11.1.
 * Copyright (c) 2018 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import ELK from "../../src/elkjs";

const overlappingGraph = {
  id: "root",
  children: [
    { id: "n1", x: 20, y: 20, width: 10, height: 10 },
    { id: "n2", x: 25, y: 25, width: 10, height: 10 },
  ],
  edges: [{ id: "e1", sources: ["n1"], targets: ["n2"] }],
};

describe("elkjs compatibility: layout algorithms", () => {
  it("compacts positioned nodes with SPOrE spacing and padding", async () => {
    const elk = new ELK();
    const result = await elk.layout(
      {
        id: "root",
        children: [
          { id: "n1", x: 20, y: 20, width: 10, height: 10 },
          { id: "n2", x: 50, y: 50, width: 10, height: 10 },
        ],
        edges: [{ id: "e1", sources: ["n1"], targets: ["n2"] }],
      },
      {
        layoutOptions: {
          algorithm: "elk.sporeCompaction",
          "elk.spacing.nodeNode": 14,
          "elk.padding": "[left=2, top=2, right=2, bottom=2]",
        },
      },
    );

    expect(result.children?.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 2, y: 2 },
      { x: 26, y: 26 },
    ]);
  });

  it("removes overlap with SPOrE spacing and padding", async () => {
    const elk = new ELK();
    const result = await elk.layout(structuredClone(overlappingGraph), {
      layoutOptions: {
        algorithm: "elk.sporeOverlap",
        "elk.spacing.nodeNode": 13,
        "elk.padding": "[left=3, top=3, right=3, bottom=3]",
      },
    });

    expect(result.children?.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 3, y: 3 },
      { x: 26, y: 26 },
    ]);
  });

  it("packs rectangles without overlap", async () => {
    const elk = new ELK();
    const result = await elk.layout(structuredClone(overlappingGraph), {
      layoutOptions: { algorithm: "elk.rectpacking" },
    });
    const [first, second] = result.children ?? [];

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(
      (first?.x ?? 0) + (first?.width ?? 0) <= (second?.x ?? 0) ||
        (first?.y ?? 0) + (first?.height ?? 0) <= (second?.y ?? 0),
    ).toBe(true);
  });
});
