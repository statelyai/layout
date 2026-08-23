/*******************************************************************************
 * Adapted from kieler/elkjs test/mocha/test-node.js at tag 0.11.1.
 * Copyright (c) 2020 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { describe, expect, it } from "vitest";
import OracleELK from "elkjs/lib/elk.bundled.js";
import ELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs";

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

  it("matches ELK 0.11.1 defaults for a simple layered edge", async () => {
    const graph = {
      id: "root",
      children: [
        { id: "a", width: 10, height: 10 },
        { id: "b", width: 10, height: 10 },
      ],
      edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
    } satisfies ElkNode;
    const [native, oracle] = await Promise.all([
      new ELK().layout<ElkNode>(structuredClone(graph)),
      new OracleELK().layout(structuredClone(graph)),
    ]);
    const oracleNode = oracle as unknown as ElkNode;

    expect(native.width).toBe(oracleNode.width);
    expect(native.height).toBe(oracleNode.height);
    expect(
      native.children?.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
    ).toEqual(
      oracleNode.children?.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
    );
    expect(native.edges?.[0]?.sections).toEqual(oracleNode.edges?.[0]?.sections);
  });
});
