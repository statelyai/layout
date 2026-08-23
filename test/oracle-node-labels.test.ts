import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

async function compareNode(graph: ElkNode) {
  const expected = (await new OracleELK().layout(
    structuredClone(graph) as never,
  )) as unknown as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  const expectedNode = expected.children?.[0];
  const actualNode = actual.children?.[0];
  expect([actualNode?.x, actualNode?.y, actualNode?.width, actualNode?.height]).toEqual([
    expectedNode?.x,
    expectedNode?.y,
    expectedNode?.width,
    expectedNode?.height,
  ]);
  expect(actualNode?.labels?.map((label) => [label.x, label.y, label.width, label.height])).toEqual(
    expectedNode?.labels?.map((label) => [label.x, label.y, label.width, label.height]),
  );
}

for (const placement of [
  "INSIDE, V_TOP, H_CENTER",
  "OUTSIDE, V_TOP, H_CENTER",
  "OUTSIDE, V_TOP, H_CENTER, H_PRIORITY",
] as const) {
  it(`matches ELK ${placement} node-label placement and margins`, async () => {
    await compareNode({
      id: "root",
      layoutOptions: { "elk.algorithm": "layered" },
      children: [
        {
          id: "node",
          width: 40,
          height: 30,
          layoutOptions: { "elk.nodeLabels.placement": placement },
          labels: [{ id: "label", text: "label", width: 60, height: 12 }],
        },
      ],
    });
  });
}

for (const placement of ["INSIDE, V_CENTER, H_CENTER", "INSIDE, V_TOP, H_CENTER"] as const) {
  it(`matches ELK NODE_LABELS sizing with ${placement}`, async () => {
    await compareNode({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.nodeLabels.padding": "[top=3,left=4,bottom=5,right=6]",
      },
      children: [
        {
          id: "node",
          width: 40,
          height: 30,
          layoutOptions: {
            "elk.nodeSize.constraints": "NODE_LABELS",
            "elk.nodeLabels.placement": placement,
          },
          labels: [{ id: "label", text: "label", width: 60, height: 12 }],
        },
      ],
    });
  });
}

it("matches ELK explicit minimum node sizing", async () => {
  await compareNode({
    id: "root",
    layoutOptions: { "elk.algorithm": "layered" },
    children: [
      {
        id: "node",
        width: 40,
        height: 30,
        layoutOptions: {
          "elk.nodeSize.constraints": "MINIMUM_SIZE",
          "elk.nodeSize.minimum": "(80,50)",
        },
      },
    ],
  });
});
