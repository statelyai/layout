import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

async function comparePositions(graph: ElkNode, ignoreIds: readonly string[] = []) {
  const expected = (await new OracleELK().layout(
    structuredClone(graph) as never,
  )) as unknown as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect(
    actual.children
      ?.filter((node) => !ignoreIds.includes(String(node.id)))
      .map(({ id, x, y }) => ({ id, x, y })),
  ).toEqual(
    expected.children
      ?.filter((node) => !ignoreIds.includes(String(node.id)))
      .map(({ id, x, y }) => ({ id, x, y })),
  );
}

describe("ELK interactive-reference-point parity", () => {
  for (const referencePoint of ["CENTER", "TOP_LEFT"] as const) {
    it(`uses ${referencePoint} during interactive cycle breaking`, async () => {
      await comparePositions({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.cycleBreaking.strategy": "INTERACTIVE",
          "elk.layered.interactiveReferencePoint": referencePoint,
        },
        children: [
          { id: "a", x: 0, y: 0, width: 100, height: 20 },
          { id: "b", x: 40, y: 0, width: 10, height: 20 },
        ],
        edges: [{ id: "edge", sources: ["a"], targets: ["b"] }],
      });
    });

    it(`uses ${referencePoint} during interactive crossing minimization`, async () => {
      await comparePositions(
        {
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.separateConnectedComponents": "false",
            "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
            "elk.layered.interactiveReferencePoint": referencePoint,
          },
          children: [
            { id: "source", x: 0, y: 20, width: 20, height: 20 },
            { id: "a", x: 40, y: 0, width: 20, height: 100 },
            { id: "b", x: 40, y: 40, width: 20, height: 10 },
          ],
          edges: [
            { id: "source-a", sources: ["source"], targets: ["a"] },
            { id: "source-b", sources: ["source"], targets: ["b"] },
          ],
        },
        ["source"],
      );
    });
  }
});
