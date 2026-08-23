import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

it("matches ELK node-level noLayout exclusion", async () => {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: { "elk.algorithm": "layered" },
    children: [
      {
        id: "fixed",
        x: 100,
        y: 80,
        width: 20,
        height: 20,
        layoutOptions: { "elk.noLayout": "true" },
      },
      { id: "source", width: 20, height: 20 },
      { id: "target", width: 20, height: 20 },
    ],
    edges: [{ id: "edge", sources: ["source"], targets: ["target"] }],
  };
  const expected = (await new OracleELK().layout(
    structuredClone(graph) as never,
  )) as unknown as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect(actual.children?.map((node) => [node.x, node.y])).toEqual(
    expected.children?.map((node) => [node.x, node.y]),
  );
  expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  expect(actual.edges?.map((edge) => edge.sections)).toEqual(
    expected.edges?.map((edge) => edge.sections),
  );
});

it("matches ELK edge-level noLayout preservation", async () => {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: { "elk.algorithm": "layered" },
    children: [
      { id: "source", width: 20, height: 20 },
      { id: "target", width: 20, height: 20 },
    ],
    edges: [
      {
        id: "edge",
        sources: ["source"],
        targets: ["target"],
        layoutOptions: { "elk.noLayout": "true" },
        sections: [{ id: "authored", startPoint: { x: 1, y: 2 }, endPoint: { x: 3, y: 4 } }],
      },
    ],
  };
  const expected = (await new OracleELK().layout(
    structuredClone(graph) as never,
  )) as unknown as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect(actual.children?.map((node) => [node.x, node.y])).toEqual(
    expected.children?.map((node) => [node.x, node.y]),
  );
  expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  expect(actual.edges?.[0]?.sections).toEqual(expected.edges?.[0]?.sections);
});
