import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

async function compare(graph: ElkNode): Promise<void> {
  const expected = (await new OracleELK().layout(structuredClone(graph) as never)) as ElkNode;
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
  expect(actualNode?.labels?.map(({ x, y }) => [x, y])).toEqual(
    expectedNode?.labels?.map(({ x, y }) => [x, y]),
  );
  expect(actualNode?.ports?.map(({ x, y }) => [x, y])).toEqual(
    expectedNode?.ports?.map(({ x, y }) => [x, y]),
  );
}

describe("ELK node-size option parity", () => {
  for (const options of [undefined, ""] as const) {
    it(`matches DEFAULT_MINIMUM_SIZE with options=${String(options)}`, async () => {
      await compare({
        id: "root",
        layoutOptions: { "elk.algorithm": "layered" },
        children: [
          {
            id: "node",
            width: 1,
            height: 1,
            layoutOptions: {
              "elk.nodeSize.constraints": "MINIMUM_SIZE",
              ...(options === undefined ? {} : { "elk.nodeSize.options": options }),
            },
          },
        ],
      });
    });
  }

  it("matches MINIMUM_SIZE_ACCOUNTS_FOR_PADDING", async () => {
    await compare({
      id: "root",
      layoutOptions: { "elk.algorithm": "layered" },
      children: [
        {
          id: "node",
          layoutOptions: {
            "elk.nodeSize.constraints": "MINIMUM_SIZE, NODE_LABELS",
            "elk.nodeSize.minimum": "(40,20)",
            "elk.nodeSize.options": "MINIMUM_SIZE_ACCOUNTS_FOR_PADDING",
            "elk.nodeLabels.placement": "INSIDE, V_TOP, H_CENTER",
          },
          labels: [{ id: "label", text: "label", width: 10, height: 5 }],
        },
      ],
    });
  });

  for (const options of ["COMPUTE_PADDING", "OUTSIDE_NODE_LABELS_OVERHANG"] as const) {
    it(`matches ${options}`, async () => {
      await compare({
        id: "root",
        layoutOptions: { "elk.algorithm": "layered" },
        children: [
          {
            id: "node",
            width: 10,
            height: 10,
            layoutOptions: {
              "elk.nodeSize.constraints": "NODE_LABELS",
              "elk.nodeSize.options": options,
              "elk.nodeLabels.placement":
                options === "COMPUTE_PADDING"
                  ? "INSIDE, V_TOP, H_CENTER"
                  : "OUTSIDE, V_TOP, H_CENTER",
            },
            labels: [{ id: "label", text: "label", width: 40, height: 10 }],
          },
        ],
      });
    });
  }

  it("matches PORTS_OVERHANG", async () => {
    await compare({
      id: "root",
      layoutOptions: { "elk.algorithm": "layered" },
      children: [
        {
          id: "node",
          width: 20,
          height: 20,
          layoutOptions: {
            "elk.portConstraints": "FIXED_SIDE",
            "elk.nodeSize.options": "PORTS_OVERHANG",
          },
          ports: Array.from({ length: 3 }, (_, index) => ({
            id: `port-${index}`,
            width: 8,
            height: 8,
            layoutOptions: { "elk.port.side": "NORTH" },
          })),
        },
      ],
    });
  });

  for (const options of [
    "ASYMMETRICAL",
    "FORCE_TABULAR_NODE_LABELS",
    "ASYMMETRICAL, FORCE_TABULAR_NODE_LABELS",
  ] as const) {
    it(`matches ${options} node-label cells`, async () => {
      await compare({
        id: "root",
        layoutOptions: { "elk.algorithm": "layered" },
        children: [
          {
            id: "node",
            layoutOptions: {
              "elk.nodeSize.constraints": "NODE_LABELS",
              "elk.nodeSize.options": options,
            },
            labels: [
              {
                id: "top-left",
                text: "top-left",
                width: 50,
                height: 10,
                layoutOptions: { "elk.nodeLabels.placement": "INSIDE, V_TOP, H_LEFT" },
              },
              {
                id: "bottom-right",
                text: "bottom-right",
                width: 50,
                height: 10,
                layoutOptions: { "elk.nodeLabels.placement": "INSIDE, V_BOTTOM, H_RIGHT" },
              },
            ],
          },
        ],
      });
    });
  }

  it("matches UNIFORM_PORT_SPACING with unequal inside labels", async () => {
    await compare({
      id: "root",
      layoutOptions: { "elk.algorithm": "layered" },
      children: [
        {
          id: "node",
          width: 60,
          height: 120,
          layoutOptions: {
            "elk.portConstraints": "FIXED_SIDE",
            "elk.nodeSize.constraints": "PORT_LABELS",
            "elk.nodeSize.options": "UNIFORM_PORT_SPACING",
            "elk.portLabels.placement": "INSIDE",
          },
          ports: [5, 30, 15, 8].map((height, index) => ({
            id: `port-${index}`,
            width: 8,
            height: 8,
            layoutOptions: { "elk.port.side": "EAST" },
            labels: [{ id: `label-${index}`, text: "label", width: 20, height }],
          })),
        },
      ],
    });
  });

  it("matches deprecated SPACE_EFFICIENT_PORT_LABELS", async () => {
    await compare({
      id: "root",
      layoutOptions: { "elk.algorithm": "layered" },
      children: [
        {
          id: "node",
          width: 60,
          height: 60,
          layoutOptions: {
            "elk.portConstraints": "FIXED_SIDE",
            "elk.nodeSize.constraints": "PORT_LABELS",
            "elk.nodeSize.options": "SPACE_EFFICIENT_PORT_LABELS",
            "elk.portLabels.placement": "OUTSIDE",
          },
          ports: [0, 1, 2].map((index) => ({
            id: `port-${index}`,
            width: 8,
            height: 8,
            layoutOptions: { "elk.port.side": "NORTH" },
            labels: [{ id: `label-${index}`, text: "label", width: 20, height: 8 }],
          })),
        },
      ],
    });
  });
});
