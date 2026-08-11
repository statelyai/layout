import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

function expectGeometry(actual: ElkNode, expected: ElkNode): void {
  expect(actual.width).toBeCloseTo(expected.width ?? Number.NaN, 12);
  expect(actual.height).toBeCloseTo(expected.height ?? Number.NaN, 12);
  for (const expectedNode of expected.children ?? []) {
    const actualNode = actual.children?.find((node) => node.id === expectedNode.id);
    for (const property of ["x", "y", "width", "height"] as const) {
      expect(actualNode?.[property]).toBeCloseTo(expectedNode[property] ?? Number.NaN, 12);
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
    expect(actualPoints).toHaveLength(expectedPoints.length);
    actualPoints.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expectedPoints[index]!.x, 12);
      expect(point.y).toBeCloseTo(expectedPoints[index]!.y, 12);
    });
  }
}

for (const split of [2, 3]) {
  it(`matches ELK alternating layer unzipping with split ${split}`, async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.layered.layerUnzipping.strategy": "ALTERNATING",
        "elk.separateConnectedComponents": "false",
      },
      children: [
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `source-${index}`,
          width: 20,
          height: 20,
          layoutOptions: { "elk.layered.layerUnzipping.layerSplit": String(split) },
        })),
        { id: "target", width: 20, height: 20 },
      ],
      edges: Array.from({ length: 5 }, (_, index) => ({
        id: `edge-${index}`,
        sources: [`source-${index}`],
        targets: ["target"],
      })),
    };
    const expected = (await new OracleELK().layout(
      structuredClone(graph) as never,
    )) as unknown as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(graph));
    expect(actual.children?.map((node) => [node.x, node.y])).toEqual(
      expected.children?.map((node) => [node.x, node.y]),
    );
    for (const [index, edge] of (actual.edges ?? []).entries()) {
      const actualSection = edge.sections?.[0];
      const expectedSection = expected.edges?.[index]?.sections?.[0];
      const actualPoints = actualSection
        ? [actualSection.startPoint, ...(actualSection.bendPoints ?? []), actualSection.endPoint]
        : [];
      const expectedPoints = expectedSection
        ? [
            expectedSection.startPoint,
            ...(expectedSection.bendPoints ?? []),
            expectedSection.endPoint,
          ]
        : [];
      expect(actualPoints).toHaveLength(expectedPoints.length);
      actualPoints.forEach((point, pointIndex) => {
        expect(point.x).toBeCloseTo(expectedPoints[pointIndex]!.x, 12);
        expect(point.y).toBeCloseTo(expectedPoints[pointIndex]!.y, 12);
      });
    }
    expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  });
}

it("matches ELK layer-unzipping edge-length minimization", async () => {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.layered.layerUnzipping.strategy": "ALTERNATING",
      "elk.separateConnectedComponents": "false",
    },
    children: [
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `source-${index}`,
        width: 20,
        height: 20,
        layoutOptions: {
          "elk.layered.layerUnzipping.layerSplit": "2",
          "elk.layered.layerUnzipping.minimizeEdgeLength": "true",
        },
      })),
      { id: "target", width: 20, height: 20 },
    ],
    edges: Array.from({ length: 5 }, (_, index) => ({
      id: `edge-${index}`,
      sources: [`source-${index}`],
      targets: ["target"],
    })),
  };
  const expected = (await new OracleELK().layout(
    structuredClone(graph) as never,
  )) as unknown as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect(actual.children?.map((node) => [node.x, node.y])).toEqual(
    expected.children?.map((node) => [node.x, node.y]),
  );
  for (const [index, edge] of (actual.edges ?? []).entries()) {
    const actualSection = edge.sections?.[0];
    const expectedSection = expected.edges?.[index]?.sections?.[0];
    const actualPoints = actualSection
      ? [actualSection.startPoint, ...(actualSection.bendPoints ?? []), actualSection.endPoint]
      : [];
    const expectedPoints = expectedSection
      ? [
          expectedSection.startPoint,
          ...(expectedSection.bendPoints ?? []),
          expectedSection.endPoint,
        ]
      : [];
    expect(actualPoints).toHaveLength(expectedPoints.length);
    actualPoints.forEach((point, pointIndex) => {
      expect(point.x).toBeCloseTo(expectedPoints[pointIndex]!.x, 12);
      expect(point.y).toBeCloseTo(expectedPoints[pointIndex]!.y, 12);
    });
  }
  expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
});

it("matches ELK reset-on-long-edges option behavior", async () => {
  const createGraph = (resetOnLongEdges: boolean): ElkNode => ({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
      "elk.layered.layerUnzipping.strategy": "ALTERNATING",
      "elk.layered.crossingMinimization.strategy": "NONE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
    },
    children: [
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `source-${index}`,
        width: 20,
        height: 20,
        layoutOptions: {
          "elk.layered.layerUnzipping.layerSplit": "2",
          "elk.layered.layerUnzipping.resetOnLongEdges": String(resetOnLongEdges),
        },
      })),
      { id: "middle", width: 20, height: 20 },
      { id: "target", width: 20, height: 20 },
    ],
    edges: [
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `long-${index}`,
        sources: [`source-${index}`],
        targets: ["target"],
      })),
      { id: "source-middle", sources: ["source-0"], targets: ["middle"] },
      { id: "middle-target", sources: ["middle"], targets: ["target"] },
    ],
  });
  const signature = (graph: ElkNode) =>
    graph.children?.map((node) => [node.id, node.x, node.y, node.width, node.height]);
  const [oracleOff, oracleOn, nativeOff, nativeOn] = await Promise.all([
    new OracleELK().layout(structuredClone(createGraph(false)) as never),
    new OracleELK().layout(structuredClone(createGraph(true)) as never),
    new NativeELK().layout(structuredClone(createGraph(false))),
    new NativeELK().layout(structuredClone(createGraph(true))),
  ]);

  expect(signature(nativeOn)).toEqual(signature(nativeOff));
  expect(signature(oracleOn as unknown as ElkNode)).toEqual(
    signature(oracleOff as unknown as ElkNode),
  );
  expectGeometry(nativeOff, oracleOff as unknown as ElkNode);
  expectGeometry(nativeOn, oracleOn as unknown as ElkNode);
});
