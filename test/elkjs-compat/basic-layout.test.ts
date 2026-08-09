/*******************************************************************************
 * Adapted from kieler/elkjs test/mocha/test-node.js at tag 0.11.1.
 * Copyright (c) 2020 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import ELK from "../../src/elkjs";

describe("elkjs compatibility: basic layout", () => {
  it("lays out a flat layered graph", async () => {
    const elk = new ELK();
    const graph = {
      id: "root",
      layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT" },
      children: [
        { id: "n1", width: 30, height: 30 },
        { id: "n2", width: 30, height: 30 },
        { id: "n3", width: 30, height: 30 },
      ],
      edges: [
        { id: "e1", sources: ["n1"], targets: ["n2"] },
        { id: "e2", sources: ["n1"], targets: ["n3"] },
      ],
    };

    const result = await elk.layout(graph);

    expect(result.children?.[0]?.x).toBeTypeOf("number");
    expect(result.children?.[0]?.x).toBeLessThan(result.children?.[1]?.x ?? 0);
    expect(result.edges?.every((edge) => edge.sections?.length === 1)).toBe(true);
  });
});
