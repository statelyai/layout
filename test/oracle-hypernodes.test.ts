import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

it("matches ELK hypernode alignment, merged routing, and junction points", async () => {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: { "elk.algorithm": "layered", "elk.separateConnectedComponents": "false" },
    children: [
      { id: "hyper", width: 20, height: 20, layoutOptions: { "elk.hypernode": "true" } },
      { id: "lower", width: 20, height: 20 },
      { id: "upper", width: 20, height: 20 },
      { id: "target", width: 20, height: 20 },
    ],
    edges: [
      { id: "lower-in", sources: ["lower"], targets: ["hyper"] },
      { id: "upper-in", sources: ["upper"], targets: ["hyper"] },
      { id: "out", sources: ["hyper"], targets: ["target"] },
    ],
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
  expect(actual.edges?.map((edge) => edge.junctionPoints)).toEqual(
    expected.edges?.map((edge) => edge.junctionPoints),
  );
  expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
});
