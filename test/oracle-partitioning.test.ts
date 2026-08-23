import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

it("matches ELK activated partition ordering against edge direction", async () => {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.partitioning.activate": "true",
      "elk.separateConnectedComponents": "false",
    },
    children: [
      {
        id: "last",
        width: 20,
        height: 20,
        layoutOptions: { "elk.partitioning.partition": "2" },
      },
      {
        id: "first",
        width: 20,
        height: 20,
        layoutOptions: { "elk.partitioning.partition": "0" },
      },
      {
        id: "middle",
        width: 20,
        height: 20,
        layoutOptions: { "elk.partitioning.partition": "1" },
      },
    ],
    edges: [
      { id: "reverse-2", sources: ["last"], targets: ["middle"] },
      { id: "reverse-1", sources: ["middle"], targets: ["first"] },
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
  expect(actual.edges?.map((edge) => edge.sections)).toEqual(
    expected.edges?.map((edge) => edge.sections),
  );
});
