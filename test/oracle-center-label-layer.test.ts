import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

describe("ELK center-label layer selection parity", () => {
  for (const strategy of [
    "MEDIAN_LAYER",
    "TAIL_LAYER",
    "HEAD_LAYER",
    "SPACE_EFFICIENT_LAYER",
    "WIDEST_LAYER",
    "CENTER_LAYER",
  ] as const) {
    it(`matches ${strategy}`, async () => {
      const graph: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.edgeLabels.centerLabelPlacementStrategy": strategy,
        },
        children: [
          { id: "a", width: 20, height: 20 },
          { id: "b", width: 80, height: 20 },
          { id: "c", width: 30, height: 20 },
          { id: "d", width: 60, height: 20 },
          { id: "e", width: 20, height: 20 },
        ],
        edges: [
          { id: "ab", sources: ["a"], targets: ["b"] },
          { id: "bc", sources: ["b"], targets: ["c"] },
          { id: "cd", sources: ["c"], targets: ["d"] },
          { id: "de", sources: ["d"], targets: ["e"] },
          {
            id: "long",
            sources: ["a"],
            targets: ["e"],
            labels: [
              {
                id: "label",
                text: "wide",
                width: 40,
                height: 10,
                layoutOptions: { "elk.edgeLabels.placement": "CENTER" },
              },
            ],
          },
        ],
      };
      const expected = (await new OracleELK().layout(structuredClone(graph) as never)) as ElkNode;
      const actual = await new NativeELK().layout(structuredClone(graph));
      expect(actual.width).toBeCloseTo(expected.width ?? Number.NaN, 12);
      for (const expectedNode of expected.children ?? []) {
        expect(actual.children?.find((node) => node.id === expectedNode.id)?.x).toBeCloseTo(
          expectedNode.x ?? Number.NaN,
          12,
        );
      }
      expect(actual.edges?.find((edge) => edge.id === "long")?.labels?.[0]?.x).toBeCloseTo(
        expected.edges?.find((edge) => edge.id === "long")?.labels?.[0]?.x ?? Number.NaN,
        12,
      );
    });
  }
});
