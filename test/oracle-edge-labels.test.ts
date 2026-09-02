import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";
import vizTwoStateCycle from "./fixtures/viz-two-state-cycle.json";

for (const placement of ["CENTER", "HEAD", "TAIL"] as const) {
  for (const inline of [false, true]) {
    it(`matches ELK ${placement} edge-label placement with inline=${inline}`, async () => {
      const graph: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.edgeRouting": "ORTHOGONAL",
          "elk.separateConnectedComponents": "false",
        },
        children: [
          { id: "source", width: 30, height: 20 },
          { id: "target", width: 30, height: 20 },
        ],
        edges: [
          {
            id: "edge",
            sources: ["source"],
            targets: ["target"],
            labels: [
              {
                id: "label",
                text: "edge",
                width: 24,
                height: 10,
                layoutOptions: {
                  "elk.edgeLabels.placement": placement,
                  "elk.edgeLabels.inline": String(inline),
                },
              },
            ],
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
      expect(actual.edges?.[0]?.labels?.map((label) => [label.x, label.y])).toEqual(
        expected.edges?.[0]?.labels?.map((label) => [label.x, label.y]),
      );
      expect(actual.edges?.[0]?.sections).toEqual(expected.edges?.[0]?.sections);
    });
  }
}

it("keeps ELK-like backward-edge labels in a vertical sibling corridor", async () => {
  const port = (id: string, side: "NORTH" | "SOUTH") => ({
    id,
    width: 20,
    height: 20,
    layoutOptions: { "elk.port.side": side },
  });
  const label = (id: string) => ({
    id,
    text: id,
    width: 180,
    height: 48,
    layoutOptions: {
      "elk.layered.edgeLabels.centerLabelPlacementStrategy": "MEDIAN_LAYER",
      "elk.edgeLabels.inline": "true",
      "elk.edgeLabels.placement": "CENTER",
    },
  });
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.separateConnectedComponents": "true",
      "elk.spacing.nodeNode": "50",
      "elk.spacing.edgeEdge": "10",
      "elk.spacing.edgeNode": "10",
      "elk.spacing.edgeLabel": "2",
      "elk.spacing.labelNode": "5",
      "elk.layered.spacing.nodeNodeBetweenLayers": "30",
      "elk.layered.layering.strategy": "INTERACTIVE",
      "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.nodePlacement.favorStraightEdges": "true",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      "elk.layered.considerModelOrder.strategy": "PREFER_NODES",
      "elk.layered.compaction.postCompaction.strategy": "LEFT",
      "elk.layered.compaction.postCompaction.constraints": "SCANLINE",
      "elk.layered.edgeLabels.centerLabelPlacementStrategy": "MEDIAN_LAYER",
      "elk.layered.edgeLabels.sideSelection": "SMART_DOWN",
    },
    children: [
      {
        id: "idle",
        width: 180,
        height: 96,
        ports: [port("idle-second__src", "SOUTH"), port("idle-third__src", "SOUTH")],
      },
      {
        id: "second",
        width: 180,
        height: 96,
        ports: [port("idle-second__tgt", "NORTH"), port("third-second__tgt", "NORTH")],
      },
      {
        id: "third",
        width: 180,
        height: 96,
        ports: [port("idle-third__tgt", "NORTH"), port("third-second__src", "SOUTH")],
      },
    ],
    edges: [
      {
        id: "idle-second",
        sources: ["idle-second__src"],
        targets: ["idle-second__tgt"],
        labels: [label("idle-second")],
      },
      {
        id: "idle-third",
        sources: ["idle-third__src"],
        targets: ["idle-third__tgt"],
        labels: [label("idle-third")],
      },
      {
        id: "third-second",
        sources: ["third-second__src"],
        targets: ["third-second__tgt"],
        labels: [label("third-second")],
      },
    ],
  };

  const expected = (await new OracleELK().layout(structuredClone(graph) as never)) as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  const expectedLabel = expected.edges?.find((edge) => edge.id === "third-second")?.labels?.[0];
  const actualLabel = actual.edges?.find((edge) => edge.id === "third-second")?.labels?.[0];
  const actualSource = actual.children?.find((node) => node.id === "third");
  const actualTarget = actual.children?.find((node) => node.id === "second");
  const labelCenterX = (actualLabel?.x ?? 0) + (actualLabel?.width ?? 0) / 2;
  const endpointCenters = [actualSource, actualTarget].map(
    (node) => (node?.x ?? 0) + (node?.width ?? 0) / 2,
  );

  expect(actualLabel?.y).toEqual(expectedLabel?.y);
  expect(labelCenterX).toBeGreaterThanOrEqual(Math.min(...endpointCenters));
  expect(labelCenterX).toBeLessThanOrEqual(Math.max(...endpointCenters));
});

it("matches ELK geometry for Viz's two-state cycle", async () => {
  const graph = structuredClone(vizTwoStateCycle) as ElkNode;
  const expected = (await new OracleELK().layout(structuredClone(graph) as never)) as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  const rounded = (value: number | undefined) =>
    value === undefined ? value : Math.round(value * 1_000_000_000) / 1_000_000_000;

  expect([rounded(actual.width), rounded(actual.height)]).toEqual([
    rounded(expected.width),
    rounded(expected.height),
  ]);
  expect(actual.children?.map((node) => [rounded(node.x), rounded(node.y)])).toEqual(
    expected.children?.map((node) => [rounded(node.x), rounded(node.y)]),
  );
  expect(
    actual.edges?.map((edge) => [
      edge.id,
      rounded(edge.labels?.[0]?.x),
      rounded(edge.labels?.[0]?.y),
    ]),
  ).toEqual(
    expected.edges?.map((edge) => [
      edge.id,
      rounded(edge.labels?.[0]?.x),
      rounded(edge.labels?.[0]?.y),
    ]),
  );
});

for (const sideSelection of [
  "ALWAYS_UP",
  "ALWAYS_DOWN",
  "DIRECTION_UP",
  "DIRECTION_DOWN",
  "SMART_UP",
  "SMART_DOWN",
] as const) {
  it(`matches ELK ${sideSelection} edge-label side selection`, async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.layered.edgeLabels.sideSelection": sideSelection,
      },
      children: [
        { id: "source", width: 30, height: 20 },
        { id: "target", width: 30, height: 20 },
      ],
      edges: [
        {
          id: "edge",
          sources: ["source"],
          targets: ["target"],
          labels: [
            {
              id: "label",
              text: "edge",
              width: 24,
              height: 10,
              layoutOptions: { "elk.edgeLabels.placement": "CENTER" },
            },
          ],
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
    expect(actual.edges?.[0]?.labels?.map((label) => [label.x, label.y])).toEqual(
      expected.edges?.[0]?.labels?.map((label) => [label.x, label.y]),
    );
    expect(actual.edges?.[0]?.sections).toEqual(expected.edges?.[0]?.sections);
  });
}

for (const thickness of [1, 4, 10]) {
  it(`matches ELK edge thickness ${thickness} around labels`, async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: { "elk.algorithm": "layered" },
      children: [
        { id: "source", width: 30, height: 20 },
        { id: "target", width: 30, height: 20 },
      ],
      edges: [
        {
          id: "edge",
          sources: ["source"],
          targets: ["target"],
          layoutOptions: { "elk.edge.thickness": String(thickness) },
          labels: [
            {
              id: "label",
              text: "edge",
              width: 24,
              height: 10,
              layoutOptions: { "elk.edgeLabels.placement": "CENTER" },
            },
          ],
        },
      ],
    };
    const expected = (await new OracleELK().layout(
      structuredClone(graph) as never,
    )) as unknown as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(graph));
    expect(actual.edges?.[0]?.labels?.[0]?.y).toEqual(expected.edges?.[0]?.labels?.[0]?.y);
  });
}

for (const placement of ["CENTER", "HEAD", "TAIL"] as const) {
  it(`matches ELK stacked ${placement} edge labels`, async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.spacing.labelLabel": "4",
      },
      children: [
        { id: "source", width: 30, height: 20 },
        { id: "target", width: 30, height: 20 },
      ],
      edges: [
        {
          id: "edge",
          sources: ["source"],
          targets: ["target"],
          labels: [
            {
              id: "first",
              text: "first",
              width: 20,
              height: 10,
              layoutOptions: { "elk.edgeLabels.placement": placement },
            },
            {
              id: "second",
              text: "second",
              width: 30,
              height: 8,
              layoutOptions: { "elk.edgeLabels.placement": placement },
            },
          ],
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
    expect(actual.edges?.[0]?.labels?.map((label) => [label.x, label.y])).toEqual(
      expected.edges?.[0]?.labels?.map((label) => [label.x, label.y]),
    );
    expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  });
}
