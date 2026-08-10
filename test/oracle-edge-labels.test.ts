import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

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
