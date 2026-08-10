import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

async function compare(graph: ElkNode) {
  const expected = (await new OracleELK().layout(structuredClone(graph) as never)) as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect(actual.width).toBeCloseTo(expected.width ?? Number.NaN, 12);
  expect(actual.height).toBeCloseTo(expected.height ?? Number.NaN, 12);
  for (const expectedNode of expected.children ?? []) {
    const actualNode = actual.children?.find((node) => node.id === expectedNode.id);
    for (const property of ["x", "y", "width", "height"] as const) {
      expect(actualNode?.[property], `${String(expectedNode.id)}.${property}`).toBeCloseTo(
        expectedNode[property] ?? Number.NaN,
        12,
      );
    }
  }
}

describe("ELK individual spacing parity", () => {
  for (const [first, second, expectedGap] of [
    [50, undefined, 50],
    [30, 50, 50],
  ] as const) {
    it(`uses the maximum local node spacing (${expectedGap})`, async () => {
      await compare({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.nodePlacement.strategy": "SIMPLE",
        },
        children: [
          {
            id: "a",
            width: 20,
            height: 20,
            layoutOptions: { "elk.spacing.individual": `spacing.nodeNode:${first}` },
          },
          {
            id: "b",
            width: 20,
            height: 20,
            ...(second === undefined
              ? {}
              : { layoutOptions: { "elk.spacing.individual": `spacing.nodeNode:${second}` } }),
          },
          { id: "c", width: 20, height: 20 },
        ],
        edges: [
          { id: "ac", sources: ["a"], targets: ["c"] },
          { id: "bc", sources: ["b"], targets: ["c"] },
        ],
      });
    });
  }
});
