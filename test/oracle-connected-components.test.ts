import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

async function expectOracleParity(graph: ElkNode): Promise<void> {
  const expected = (await new OracleELK().layout(
    structuredClone(graph) as never,
  )) as unknown as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect(actual.children?.map((node) => [node.id, node.x, node.y])).toEqual(
    expected.children?.map((node) => [node.id, node.x, node.y]),
  );
  expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  expect(actual.edges?.map((edge) => edge.sections)).toEqual(
    expected.edges?.map((edge) => edge.sections),
  );
}

it("matches ELK default isolated-component shelf packing", async () => {
  await expectOracleParity({
    id: "root",
    layoutOptions: { "elk.algorithm": "layered" },
    children: [
      { id: "a", width: 20, height: 20 },
      { id: "b", width: 30, height: 25 },
      { id: "c", width: 30, height: 30 },
      { id: "d", width: 20, height: 27 },
    ],
  });
});

it("matches ELK custom component spacing and aspect ratio", async () => {
  await expectOracleParity({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.aspectRatio": "3",
      "elk.spacing.componentComponent": "7",
    },
    children: [
      { id: "a", width: 20, height: 20 },
      { id: "b", width: 30, height: 25 },
      { id: "c", width: 30, height: 30 },
    ],
  });
});

it("matches ELK when connected-component separation is disabled", async () => {
  await expectOracleParity({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.separateConnectedComponents": "false",
    },
    children: [
      { id: "a", width: 20, height: 20 },
      { id: "b", width: 30, height: 25 },
    ],
  });
});

for (const strategy of [
  "NONE",
  "INSIDE_PORT_SIDE_GROUPS",
  "GROUP_MODEL_ORDER",
  "MODEL_ORDER",
] as const) {
  it(`matches ELK ${strategy} component model order`, async () => {
    await expectOracleParity({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.layered.considerModelOrder.components": strategy,
      },
      children: [
        { id: "a", width: 30, height: 30 },
        { id: "b", width: 20, height: 20 },
        { id: "c", width: 30, height: 25 },
        { id: "d", width: 20, height: 27 },
      ],
    });
  });
}
