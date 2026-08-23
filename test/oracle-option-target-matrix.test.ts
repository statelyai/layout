import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkEdge, type ElkLabel, type ElkNode, type ElkPort } from "../src/elkjs";
import { elkLayeredEnumValues, elkLayeredOptionDefinitions } from "../src/layered/elk-options";

type Target = (typeof elkLayeredOptionDefinitions)[number]["targets"][number];

const objectValues: Readonly<Record<string, unknown>> = {
  "spacing.individual": "spacing.nodeNode:31",
  "wrapping.cutting.cuts": [1],
  "wrapping.validify.forbiddenIndices": [1],
  padding: "[top=3,right=4,bottom=5,left=6]",
  "nodeLabels.padding": "[top=3,right=4,bottom=5,left=6]",
  "nodeSize.minimum": "(50,40)",
  junctionPoints: [{ x: 1, y: 2 }],
  "port.anchor": "(2,4)",
  position: "(17,23)",
  margins: "[top=3,right=4,bottom=5,left=6]",
  "spacing.portsSurrounding": "[top=3,right=4,bottom=5,left=6]",
  "considerModelOrder.groupModelOrder.cmEnforcedGroupOrders": "[1, 2]",
};

function valuesFor(definition: (typeof elkLayeredOptionDefinitions)[number]): readonly unknown[] {
  if (definition.type === "ENUM" || definition.type === "ENUMSET") {
    return elkLayeredEnumValues[definition.name as keyof typeof elkLayeredEnumValues];
  }
  if (definition.type === "BOOLEAN") return [false, true];
  if (definition.type === "DOUBLE") return [0.5];
  if (definition.type === "INT") return [2];
  if (definition.type === "STRING") {
    return [definition.name.endsWith("PredOf") ? "b" : "a"];
  }
  return [objectValues[definition.name]];
}

function fixture(target: Target): ElkNode {
  if (target === "PORTS") {
    return {
      id: "root",
      layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT" },
      children: [
        {
          id: "a",
          width: 80,
          height: 60,
          layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
          ports: [
            {
              id: "ap",
              width: 6,
              height: 6,
              layoutOptions: { "elk.port.side": "EAST" },
            },
          ],
        },
        { id: "b", width: 30, height: 20 },
      ],
      edges: [{ id: "ab", sources: ["ap"], targets: ["b"] }],
    };
  }
  if (target === "LABELS") {
    return {
      id: "root",
      layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT" },
      children: [
        { id: "a", width: 30, height: 20 },
        { id: "b", width: 30, height: 20 },
      ],
      edges: [
        {
          id: "ab",
          sources: ["a"],
          targets: ["b"],
          labels: [{ id: "edge-label", width: 20, height: 8, text: "ab" }],
        },
      ],
    };
  }
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.separateConnectedComponents": "false",
    },
    children: [
      { id: "a", x: 10, y: 90, width: 30, height: 20 },
      { id: "b", x: 100, y: 10, width: 40, height: 25 },
      { id: "c", x: 180, y: 70, width: 35, height: 30 },
      { id: "d", x: 70, y: 160, width: 30, height: 25 },
    ],
    edges: [
      { id: "ab", sources: ["a"], targets: ["b"] },
      { id: "ac", sources: ["a"], targets: ["c"] },
      { id: "bd", sources: ["b"], targets: ["d"] },
      { id: "dc", sources: ["d"], targets: ["c"] },
    ],
  };
}

function contextualFixture(
  definition: (typeof elkLayeredOptionDefinitions)[number],
  target: Target,
  value: unknown,
): ElkNode {
  if (definition.name === "topdownLayout" && value === true) {
    return {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.topdown.nodeType": "ROOT_NODE",
      },
      children: [
        {
          id: "parent",
          layoutOptions: {
            "elk.topdown.nodeType": "HIERARCHICAL_NODE",
            "elk.topdown.hierarchicalNodeWidth": 100,
            "elk.topdown.hierarchicalNodeAspectRatio": 2,
          },
          children: [
            { id: "a", width: 20, height: 20 },
            { id: "b", width: 20, height: 20 },
          ],
          edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
        },
        { id: "peer", width: 30, height: 30 },
      ],
      edges: [{ id: "parent-peer", sources: ["parent"], targets: ["peer"] }],
    };
  }
  if (definition.name === "noLayout" && target === "NODES" && value === true) {
    return {
      id: "root",
      layoutOptions: { "elk.algorithm": "layered" },
      children: [
        { id: "fixed", x: 100, y: 80, width: 20, height: 20 },
        { id: "source", width: 20, height: 20 },
        { id: "target", width: 20, height: 20 },
      ],
      edges: [{ id: "edge", sources: ["source"], targets: ["target"] }],
    };
  }
  if (
    definition.name === "layering.strategy" &&
    (value === "BF_MODEL_ORDER" || value === "DF_MODEL_ORDER")
  ) {
    return {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.separateConnectedComponents": "false",
      },
      children: ["a", "b", "c", "d"].map((id) => ({ id, width: 20, height: 20 })),
      edges: [
        { id: "ab", sources: ["a"], targets: ["b"] },
        { id: "ac", sources: ["a"], targets: ["c"] },
        { id: "bd", sources: ["b"], targets: ["d"] },
      ],
    };
  }
  return fixture(target);
}

function applyOption(
  graph: ElkNode,
  target: Target,
  definition: (typeof elkLayeredOptionDefinitions)[number],
  value: unknown,
): void {
  const element =
    target === "PARENTS"
      ? graph
      : target === "NODES"
        ? graph.children![0]!
        : target === "EDGES"
          ? graph.edges![0]!
          : target === "PORTS"
            ? graph.children![0]!.ports![0]!
            : graph.edges![0]!.labels![0]!;
  const options = { ...element.layoutOptions };
  const suffix = definition.elkId.replace(/^org\.eclipse\.elk\./, "");
  for (const key of [definition.name, suffix, `elk.${suffix}`, definition.elkId]) {
    delete options[key];
  }
  options[definition.elkId] = value;
  element.layoutOptions = options;
}

function expectNumber(
  actual: number | undefined,
  expected: number | undefined,
  label: string,
): void {
  expect(actual ?? 0, label).toBeCloseTo(expected ?? 0, 12);
}

function compareLabels(actual: readonly ElkLabel[] = [], expected: readonly ElkLabel[] = []): void {
  expect(actual.map(({ id }) => id)).toEqual(expected.map(({ id }) => id));
  for (const expectedLabel of expected) {
    const actualLabel = actual.find(({ id }) => String(id) === String(expectedLabel.id));
    for (const property of ["x", "y", "width", "height"] as const) {
      expectNumber(
        actualLabel?.[property],
        expectedLabel[property],
        `${String(expectedLabel.id)}.${property}`,
      );
    }
  }
}

function comparePorts(actual: readonly ElkPort[] = [], expected: readonly ElkPort[] = []): void {
  expect(actual.map(({ id }) => id)).toEqual(expected.map(({ id }) => id));
  for (const expectedPort of expected) {
    const actualPort = actual.find(({ id }) => String(id) === String(expectedPort.id));
    for (const property of ["x", "y", "width", "height"] as const) {
      expectNumber(
        actualPort?.[property],
        expectedPort[property],
        `${String(expectedPort.id)}.${property}`,
      );
    }
    compareLabels(actualPort?.labels, expectedPort.labels);
  }
}

function edgePoints(edge: ElkEdge | undefined) {
  return (edge?.sections ?? []).map((section) => [
    section.startPoint,
    ...(section.bendPoints ?? []),
    section.endPoint,
  ]);
}

function compareGraph(actual: ElkNode, expected: ElkNode): void {
  for (const property of ["x", "y", "width", "height"] as const) {
    expectNumber(actual[property], expected[property], `${String(expected.id)}.${property}`);
  }
  compareLabels(actual.labels, expected.labels);
  comparePorts(actual.ports, expected.ports);
  expect(actual.children?.map(({ id }) => id)).toEqual(expected.children?.map(({ id }) => id));
  for (const expectedChild of expected.children ?? []) {
    compareGraph(
      actual.children!.find(({ id }) => String(id) === String(expectedChild.id))!,
      expectedChild,
    );
  }
  for (const expectedEdge of expected.edges ?? []) {
    const actualEdge = actual.edges?.find(({ id }) => String(id) === String(expectedEdge.id));
    const actualSections = edgePoints(actualEdge);
    const expectedSections = edgePoints(expectedEdge);
    expect(
      actualSections.map((points) => points.length),
      String(expectedEdge.id),
    ).toEqual(expectedSections.map((points) => points.length));
    for (const [sectionIndex, expectedPoints] of expectedSections.entries()) {
      for (const [pointIndex, expectedPoint] of expectedPoints.entries()) {
        expectNumber(
          actualSections[sectionIndex]?.[pointIndex]?.x,
          expectedPoint.x,
          `${String(expectedEdge.id)}.${sectionIndex}.${pointIndex}.x`,
        );
        expectNumber(
          actualSections[sectionIndex]?.[pointIndex]?.y,
          expectedPoint.y,
          `${String(expectedEdge.id)}.${sectionIndex}.${pointIndex}.y`,
        );
      }
    }
    compareLabels(actualEdge?.labels, expectedEdge.labels);
  }
}

const cases = elkLayeredOptionDefinitions.flatMap((definition) =>
  definition.targets.flatMap((target) =>
    valuesFor(definition).map((value) => ({ definition, target, value })),
  ),
);
const oracleImporterUnsupported = new Set([
  "wrapping.cutting.cuts",
  "wrapping.validify.forbiddenIndices",
  "junctionPoints",
  "considerModelOrder.groupModelOrder.cmEnforcedGroupOrders",
]);

for (const { definition, target, value } of cases) {
  const importerUnsupported = oracleImporterUnsupported.has(definition.name);
  it(`${importerUnsupported ? "accepts" : "matches"} ${definition.name}=${JSON.stringify(value)} on ${target}`, async () => {
    const graph = contextualFixture(definition, target, value);
    applyOption(graph, target, definition, value);
    if (importerUnsupported) {
      await expect(new OracleELK().layout(structuredClone(graph) as never)).rejects.toThrow();
      const actual = await new NativeELK().layout(structuredClone(graph));
      expect(actual.width).toBeTypeOf("number");
      expect(actual.height).toBeTypeOf("number");
      return;
    }
    const [expected, actual] = await Promise.all([
      new OracleELK().layout(structuredClone(graph) as never) as Promise<ElkNode>,
      new NativeELK().layout(structuredClone(graph)),
    ]);
    compareGraph(actual, expected);
  });
}
