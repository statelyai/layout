import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

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
