import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

function expectNumber(actual: number | undefined, expected: number | undefined, label: string) {
  expect(actual, label).toBeCloseTo(expected ?? Number.NaN, 12);
}

function expectShapeGeometry(actual: ElkNode, expected: ElkNode) {
  expectNumber(actual.width, expected.width, "root.width");
  expectNumber(actual.height, expected.height, "root.height");
  for (const expectedNode of expected.children ?? []) {
    const actualNode = actual.children?.find((node) => node.id === expectedNode.id);
    for (const property of ["x", "y", "width", "height"] as const) {
      expectNumber(
        actualNode?.[property],
        expectedNode[property],
        `${String(expectedNode.id)}.${property}`,
      );
    }
    for (const expectedPort of expectedNode.ports ?? []) {
      const actualPort = actualNode?.ports?.find((port) => port.id === expectedPort.id);
      for (const property of ["x", "y", "width", "height"] as const) {
        expectNumber(
          actualPort?.[property],
          expectedPort[property],
          `${String(expectedPort.id)}.${property}`,
        );
      }
    }
  }
  for (const expectedEdge of expected.edges ?? []) {
    const actualEdge = actual.edges?.find((edge) => edge.id === expectedEdge.id);
    const expectedSection = expectedEdge.sections?.[0];
    const actualSection = actualEdge?.sections?.[0];
    const expectedPoints = expectedSection
      ? [
          expectedSection.startPoint,
          ...(expectedSection.bendPoints ?? []),
          expectedSection.endPoint,
        ]
      : [];
    const actualPoints = actualSection
      ? [actualSection.startPoint, ...(actualSection.bendPoints ?? []), actualSection.endPoint]
      : [];
    expect(actualPoints, String(expectedEdge.id)).toHaveLength(expectedPoints.length);
    actualPoints.forEach((point, index) => {
      expectNumber(point.x, expectedPoints[index]?.x, `${String(expectedEdge.id)}.${index}.x`);
      expectNumber(point.y, expectedPoints[index]?.y, `${String(expectedEdge.id)}.${index}.y`);
    });
    for (const expectedLabel of expectedEdge.labels ?? []) {
      const actualLabel = actualEdge?.labels?.find((label) => label.id === expectedLabel.id);
      for (const property of ["x", "y", "width", "height"] as const) {
        expectNumber(
          actualLabel?.[property],
          expectedLabel[property],
          `${String(expectedLabel.id)}.${property}`,
        );
      }
    }
  }
}

async function compare(graph: ElkNode) {
  const [expected, actual] = await Promise.all([
    new OracleELK().layout(structuredClone(graph) as never) as Promise<ElkNode>,
    new NativeELK().layout(structuredClone(graph)),
  ]);
  expectShapeGeometry(actual, expected);
}

describe("ELK spacing-option parity", () => {
  for (const [option, values] of [
    ["elk.layered.spacing.baseValue", [5, 20, 45]],
    ["elk.layered.spacing.nodeNodeBetweenLayers", [5, 20, 45]],
  ] as const) {
    for (const value of values) {
      it(`matches ${option}=${value}`, () =>
        compare({
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.separateConnectedComponents": "false",
            "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
            [option]: String(value),
          },
          children: ["a", "b", "c"].map((id) => ({ id, width: 20, height: 20 })),
          edges: [
            { id: "ab", sources: ["a"], targets: ["b"] },
            { id: "bc", sources: ["b"], targets: ["c"] },
          ],
        }));
    }
  }

  it("scales every dependent default from spacing.baseValue", () =>
    compare({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.separateConnectedComponents": "false",
        "elk.layered.spacing.baseValue": "0.5",
      },
      children: [
        { id: "a", width: 30, height: 20 },
        { id: "b", width: 40, height: 25 },
        { id: "c", width: 35, height: 30 },
        { id: "d", width: 30, height: 25 },
      ],
      edges: [
        { id: "ab", sources: ["a"], targets: ["b"] },
        { id: "ac", sources: ["a"], targets: ["c"] },
        { id: "bd", sources: ["b"], targets: ["d"] },
        { id: "dc", sources: ["d"], targets: ["c"] },
      ],
    }));

  for (const option of [
    "elk.spacing.edgeEdge",
    "elk.spacing.edgeNode",
    "elk.layered.spacing.edgeEdgeBetweenLayers",
    "elk.layered.spacing.edgeNodeBetweenLayers",
  ] as const) {
    for (const value of [4, 17, 35]) {
      it(`matches ${option}=${value}`, () =>
        compare({
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.separateConnectedComponents": "false",
            "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
            "elk.layered.crossingMinimization.strategy": "NONE",
            "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
            [option]: String(value),
          },
          children: [
            { id: "a", width: 30, height: 20 },
            { id: "b", width: 20, height: 50 },
            { id: "c", width: 40, height: 25 },
            { id: "d", width: 20, height: 30 },
            { id: "e", width: 30, height: 15 },
          ],
          edges: [
            ["a", "c"],
            ["b", "c"],
            ["b", "d"],
            ["c", "e"],
            ["d", "e"],
          ].map(([source, target], index) => ({
            id: `edge-${index}`,
            sources: [source!],
            targets: [target!],
          })),
        }));
    }
  }

  for (const value of [2, 10, 24]) {
    it(`matches elk.spacing.portPort=${value}`, () =>
      compare({
        id: "root",
        layoutOptions: { "elk.algorithm": "layered" },
        children: [
          {
            id: "node",
            width: 100,
            height: 100,
            layoutOptions: {
              "elk.portConstraints": "FIXED_ORDER",
              "elk.spacing.portPort": String(value),
            },
            ports: [0, 1, 2].map((index) => ({
              id: `port-${index}`,
              width: 8,
              height: 8,
              layoutOptions: { "elk.port.side": "EAST" },
            })),
          },
        ],
      }));
  }

  for (const value of [4, 20, 45]) {
    it(`matches elk.spacing.nodeSelfLoop=${value}`, () =>
      compare({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.spacing.nodeSelfLoop": String(value),
        },
        children: [{ id: "node", width: 40, height: 30 }],
        edges: [{ id: "loop", sources: ["node"], targets: ["node"] }],
      }));
  }

  for (const value of [3, 10, 27]) {
    it(`matches elk.spacing.edgeLabel=${value}`, () =>
      compare({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.spacing.edgeLabel": String(value),
        },
        children: [
          { id: "source", width: 30, height: 30 },
          { id: "target", width: 30, height: 30 },
        ],
        edges: [
          {
            id: "edge",
            sources: ["source"],
            targets: ["target"],
            labels: [
              {
                id: "label",
                text: "label",
                width: 12,
                height: 8,
                layoutOptions: { "elk.edgeLabels.placement": "TAIL" },
              },
            ],
          },
        ],
      }));

    it(`matches elk.spacing.labelNode=${value}`, () =>
      compare({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.spacing.labelNode": String(value),
        },
        children: [
          {
            id: "source",
            width: 30,
            height: 30,
            labels: [
              {
                id: "label",
                text: "label",
                width: 20,
                height: 10,
                layoutOptions: {
                  "elk.nodeLabels.placement": "OUTSIDE V_TOP H_CENTER",
                },
              },
            ],
          },
          { id: "target", width: 30, height: 30 },
        ],
        edges: [{ id: "edge", sources: ["source"], targets: ["target"] }],
      }));
  }
});
