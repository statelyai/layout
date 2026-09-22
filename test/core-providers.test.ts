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

  it("preserves exact ELK 0.11.1 Box geometry in the compatibility adapter", async () => {
    const input = {
      id: "root",
      layoutOptions: { "elk.algorithm": "box" },
      children: structuredClone(nodes),
      edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
    };
    const actual = await new ELK().layout(structuredClone(input));
    const expected = await new OracleELK().layout(structuredClone(input));
    const geometry = (graph: typeof actual) => ({
      width: graph.width,
      height: graph.height,
      children: graph.children?.map(({ id, x, y, width, height }) => ({
        id,
        x,
        y,
        width,
        height,
      })),
      edges: graph.edges?.map(({ id, sections }) => ({ id, sections })),
    });

    expect(geometry(actual)).toEqual(geometry(expected));
  });

  it("preserves authored Box routes without letting them shift provider geometry", async () => {
    const input = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "box",
        "elk.padding": "[top=1,left=2,bottom=3,right=4]",
        "elk.spacing.nodeNode": "7",
        "elk.aspectRatio": "2",
      },
      children: structuredClone(nodes),
      edges: [
        {
          id: "ab",
          sources: ["a"],
          targets: ["b"],
          sections: [{ id: "authored", startPoint: { x: 1, y: 2 }, endPoint: { x: 3, y: 4 } }],
        },
      ],
    };
    const actual = await new ELK().layout(structuredClone(input));
    const expected = await new OracleELK().layout(structuredClone(input));
    const geometry = (graph: typeof actual) => ({
      width: graph.width,
      height: graph.height,
      children: graph.children?.map(({ id, x, y, width, height }) => ({
        id,
        x,
        y,
        width,
        height,
      })),
      sections: graph.edges?.[0]?.sections,
    });

    expect(geometry(actual)).toEqual(geometry(expected));
  });

  it("matches an ELK 0.11.1 Box SIMPLE option corpus", async () => {
    const optionCases: Array<Record<string, string>> = [
      {},
      {
        "elk.padding": "[top=1,left=2,bottom=3,right=4]",
        "elk.spacing.nodeNode": "7",
        "elk.aspectRatio": "2",
      },
      { "elk.box.expandNodes": "true" },
      { "elk.interactive": "true" },
    ];
    const geometry = (graph: Awaited<ReturnType<ELK["layout"]>>) => ({
      width: graph.width,
      height: graph.height,
      children: graph.children?.map(({ id, x, y, width, height }) => ({
        id,
        x,
        y,
        width,
        height,
      })),
    });

    for (let count = 0; count <= 15; count++) {
      for (const options of optionCases) {
        const children = Array.from({ length: count }, (_, index) => ({
          id: `n${index}`,
          width: 10 + ((index * 17) % 70),
          height: 10 + ((index * 29) % 60),
          x: 100 - index * 3,
          y: index % 4,
          layoutOptions: { "elk.priority": String(index % 3) },
        }));
        const input = {
          id: "root",
          layoutOptions: { "elk.algorithm": "box", ...options },
          children,
          edges: [],
        };
        const [actual, expected] = await Promise.all([
          new ELK().layout(structuredClone(input)),
          new OracleELK().layout(structuredClone(input)),
        ]);

        expect(geometry(actual)).toEqual(geometry(expected));
      }
    }
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

  it("preserves ELK 0.11.1 Random edge geometry in the compatibility adapter", async () => {
    const input = {
      id: "root",
      layoutOptions: { "elk.algorithm": "random", "elk.randomSeed": "123" },
      children: structuredClone(nodes),
      edges: [
        { id: "ab", sources: ["a"], targets: ["b"] },
        { id: "bc", sources: ["b"], targets: ["c"] },
      ],
    };
    const actual = await new ELK().layout(structuredClone(input));
    const expected = await new OracleELK().layout(structuredClone(input));
    const geometry = (graph: typeof actual) => ({
      width: graph.width,
      height: graph.height,
      edges: graph.edges?.map((edge) => ({
        id: edge.id,
        sections: edge.sections?.map((section) => ({
          startPoint: section.startPoint,
          endPoint: section.endPoint,
          bendPoints: section.bendPoints,
        })),
      })),
    });

    expect(geometry(actual)).toEqual(geometry(expected));
  });

  it("preserves default ELK 0.11.1 Rectangle Packing geometry", async () => {
    const input = {
      id: "root",
      layoutOptions: { "elk.algorithm": "rectpacking" },
      children: structuredClone(nodes),
      edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
    };
    const actual = await new ELK().layout(structuredClone(input));
    const expected = await new OracleELK().layout(structuredClone(input));
    const geometry = (graph: typeof actual) => ({
      width: graph.width,
      height: graph.height,
      children: graph.children?.map(({ id, x, y, width, height }) => ({
        id,
        x,
        y,
        width,
        height,
      })),
      edges: graph.edges?.map(({ id, sections }) => ({ id, sections })),
    });

    expect(geometry(actual)).toEqual(geometry(expected));
  });

  it.each(["org.eclipse.elk.box", "org.eclipse.elk.random", "org.eclipse.elk.rectpacking"])(
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
