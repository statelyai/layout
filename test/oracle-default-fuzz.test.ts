import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

function fixture(seed: number): ElkNode {
  let state = seed;
  const random = () => (state = (state * 1_664_525 + 1_013_904_223) >>> 0) / 2 ** 32;
  const nodeCount = 5 + Math.floor(random() * 4);
  const children = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    width: 10 + Math.floor(random() * 31),
    height: 10 + Math.floor(random() * 31),
  }));
  const edges: NonNullable<ElkNode["edges"]> = [];
  for (let target = 1; target < nodeCount; target++) {
    for (let source = 0; source < target; source++) {
      if (random() < 0.3) {
        edges.push({
          id: `e${source}-${target}`,
          sources: [`n${source}`],
          targets: [`n${target}`],
        });
      }
    }
  }
  if (edges.length === 0) edges.push({ id: "e0-1", sources: ["n0"], targets: ["n1"] });
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.separateConnectedComponents": "false",
    },
    children,
    edges,
  };
}

function expectGeometry(actual: ElkNode, expected: ElkNode): void {
  expect(actual.width).toBeCloseTo(expected.width ?? Number.NaN, 12);
  expect(actual.height).toBeCloseTo(expected.height ?? Number.NaN, 12);
  for (const expectedNode of expected.children ?? []) {
    const actualNode = actual.children?.find((node) => node.id === expectedNode.id);
    for (const property of ["x", "y", "width", "height"] as const) {
      expect(actualNode?.[property], `${String(expectedNode.id)}.${property}`).toBeCloseTo(
        expectedNode[property] ?? Number.NaN,
        12,
      );
    }
  }
  for (const expectedEdge of expected.edges ?? []) {
    const expectedSection = expectedEdge.sections?.[0];
    const actualSection = actual.edges?.find((edge) => edge.id === expectedEdge.id)?.sections?.[0];
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
      expect(point.x, `${String(expectedEdge.id)}.${index}.x`).toBeCloseTo(
        expectedPoints[index]?.x ?? Number.NaN,
        12,
      );
      expect(point.y, `${String(expectedEdge.id)}.${index}.y`).toBeCloseTo(
        expectedPoints[index]?.y ?? Number.NaN,
        12,
      );
    });
  }
}

for (const seed of [1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 15, 17]) {
  it(`matches default layered geometry for generated DAG seed ${seed}`, async () => {
    const graph = fixture(seed);
    const [expected, actual] = await Promise.all([
      new OracleELK().layout(structuredClone(graph) as never) as Promise<ElkNode>,
      new NativeELK().layout(structuredClone(graph)),
    ]);
    expectGeometry(actual, expected);
  });
}
