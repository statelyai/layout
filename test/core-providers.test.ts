/*******************************************************************************
 * Differential coverage for ELK v0.11.0 BoxLayoutProvider.java and
 * RandomLayoutProvider.java at 54123e884b1ae743b453260f713b20c9bf5787f2.
 * Copyright (c) 2009, 2020 Kiel University and others.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import { createGraph } from "@statelyai/graph";
import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { getBoxLayout } from "../src/box";
import ELK from "../src/elkjs";
import { getRandomLayout } from "../src/random";

const nodes = [
  { id: "a", width: 30, height: 20 },
  { id: "b", width: 50, height: 40 },
  { id: "c", width: 20, height: 60 },
];
const edges = [{ id: "ab", sourceId: "a", targetId: "b" }];

function positions(graph: { nodes: Array<{ id: string; x: number; y: number }> }) {
  return graph.nodes.map(({ id, x, y }) => ({ id, x, y }));
}

describe("ELK core layout providers", () => {
  it("matches ELK Box SIMPLE placement and preserves graph order", async () => {
    const native = getBoxLayout(createGraph({ nodes, edges }));
    const oracle = await new OracleELK().layout({
      id: "root",
      layoutOptions: { "elk.algorithm": "box" },
      children: structuredClone(nodes),
      edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
    });

    expect(positions(native)).toEqual(
      oracle.children?.map(({ id, x, y }) => ({ id, x: x ?? 0, y: y ?? 0 })),
    );
  });

  it("matches ELK Random node placement with a Java-compatible seed", async () => {
    const native = getRandomLayout(createGraph({ nodes, edges }), { seed: 123 });
    const oracle = await new OracleELK().layout({
      id: "root",
      layoutOptions: { "elk.algorithm": "random", "elk.randomSeed": "123" },
      children: structuredClone(nodes),
      edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
    });

    expect(positions(native)).toEqual(
      oracle.children?.map(({ id, x, y }) => ({ id, x: x ?? 0, y: y ?? 0 })),
    );
  });

  it.each(["org.eclipse.elk.box", "org.eclipse.elk.random"])(
    "accepts the fully-qualified compatibility id %s",
    async (algorithm) => {
      const result = await new ELK().layout(
        {
          id: "root",
          children: structuredClone(nodes),
          edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
        },
        {
          layoutOptions: {
            "org.eclipse.elk.algorithm": algorithm,
            "org.eclipse.elk.randomSeed": 123,
          },
        },
      );

      expect(result.children?.every((node) => Number.isFinite(node.x))).toBe(true);
    },
  );
});
