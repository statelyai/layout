import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

for (const strategy of ["SINGLE_EDGE", "MULTI_EDGE"] as const) {
  for (const additionalSpacing of [0, 10]) {
    it(`matches ELK ${strategy} path wrapping with additional spacing ${additionalSpacing}`, async () => {
      const graph: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.aspectRatio": "1",
          "elk.layered.layering.strategy": "LONGEST_PATH",
          "elk.layered.wrapping.strategy": strategy,
          "elk.layered.wrapping.additionalEdgeSpacing": String(additionalSpacing),
        },
        children: Array.from({ length: 10 }, (_, index) => ({
          id: `node-${index}`,
          width: 20,
          height: 20,
        })),
        edges: Array.from({ length: 9 }, (_, index) => ({
          id: `edge-${index}`,
          sources: [`node-${index}`],
          targets: [`node-${index + 1}`],
        })),
      };
      const expected = (await new OracleELK().layout(
        structuredClone(graph) as never,
      )) as unknown as ElkNode;
      const actual = await new NativeELK().layout(structuredClone(graph));
      expect(actual.children?.map((node) => [node.x, node.y])).toEqual(
        expected.children?.map((node) => [node.x, node.y]),
      );
      expect(actual.edges?.map((edge) => edge.sections)).toEqual(
        expected.edges?.map((edge) => edge.sections),
      );
      expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
    });
  }
}

it("matches ELK wrapping correction factor", async () => {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.aspectRatio": "1",
      "elk.layered.layering.strategy": "LONGEST_PATH",
      "elk.layered.wrapping.strategy": "SINGLE_EDGE",
      "elk.layered.wrapping.correctionFactor": "2",
    },
    children: Array.from({ length: 10 }, (_, index) => ({
      id: `node-${index}`,
      width: 20,
      height: 20,
    })),
    edges: Array.from({ length: 9 }, (_, index) => ({
      id: `edge-${index}`,
      sources: [`node-${index}`],
      targets: [`node-${index + 1}`],
    })),
  };
  const expected = (await new OracleELK().layout(
    structuredClone(graph) as never,
  )) as unknown as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect(actual.children?.map((node) => [node.x, node.y])).toEqual(
    expected.children?.map((node) => [node.x, node.y]),
  );
  expect(actual.edges?.map((edge) => edge.sections)).toEqual(
    expected.edges?.map((edge) => edge.sections),
  );
  expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
});
