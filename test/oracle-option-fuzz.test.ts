import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

const directions = ["RIGHT", "LEFT", "DOWN", "UP"] as const;
const routing = ["ORTHOGONAL", "POLYLINE", "SPLINES"] as const;
const layering = [
  "NETWORK_SIMPLEX",
  "LONGEST_PATH",
  "LONGEST_PATH_SOURCE",
  "COFFMAN_GRAHAM",
  "INTERACTIVE",
  "STRETCH_WIDTH",
  "MIN_WIDTH",
  "BF_MODEL_ORDER",
  "DF_MODEL_ORDER",
] as const;
const crossing = ["LAYER_SWEEP", "MEDIAN_LAYER_SWEEP", "INTERACTIVE", "NONE"] as const;
const placement = [
  "SIMPLE",
  "INTERACTIVE",
  "LINEAR_SEGMENTS",
  "BRANDES_KOEPF",
  "NETWORK_SIMPLEX",
] as const;

function fixture(seed: number): ElkNode {
  let state = seed;
  const random = () => (state = (state * 1_664_525 + 1_013_904_223) >>> 0) / 2 ** 32;
  const choose = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)]!;
  const nodeCount = 5 + Math.floor(random() * 4);
  const children = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    width: 10 + Math.floor(random() * 31),
    height: 10 + Math.floor(random() * 31),
    x: Math.floor(random() * 200),
    y: Math.floor(random() * 200),
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
  const crossingStrategy = choose(crossing);
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.separateConnectedComponents": "false",
      "elk.direction": choose(directions),
      "elk.edgeRouting": choose(routing),
      "elk.randomSeed": String(1 + Math.floor(random() * 10)),
      "elk.layered.layering.strategy": choose(layering),
      "elk.layered.crossingMinimization.strategy": crossingStrategy,
      "elk.layered.crossingMinimization.greedySwitch.type":
        crossingStrategy === "NONE" ? "OFF" : choose(["OFF", "ONE_SIDED", "TWO_SIDED"]),
      "elk.layered.nodePlacement.strategy": choose(placement),
    },
    children,
    edges,
  };
}

function expectGeometry(actual: ElkNode, expected: ElkNode): void {
  for (const property of ["width", "height"] as const) {
    expect(actual[property], `root.${property}`).toBeCloseTo(expected[property] ?? Number.NaN, 12);
  }
  for (const expectedNode of expected.children ?? []) {
    const actualNode = actual.children?.find(({ id }) => id === expectedNode.id);
    for (const property of ["x", "y", "width", "height"] as const) {
      expect(actualNode?.[property], `${String(expectedNode.id)}.${property}`).toBeCloseTo(
        expectedNode[property] ?? Number.NaN,
        12,
      );
    }
  }
  for (const expectedEdge of expected.edges ?? []) {
    const expectedSection = expectedEdge.sections?.[0];
    const actualSection = actual.edges?.find(({ id }) => id === expectedEdge.id)?.sections?.[0];
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
    for (const [index, expectedPoint] of expectedPoints.entries()) {
      expect(actualPoints[index]?.x, `${String(expectedEdge.id)}.${index}.x`).toBeCloseTo(
        expectedPoint.x,
        12,
      );
      expect(actualPoints[index]?.y, `${String(expectedEdge.id)}.${index}.y`).toBeCloseTo(
        expectedPoint.y,
        12,
      );
    }
  }
}

for (const seed of Array.from({ length: 100 }, (_, index) => index + 1)) {
  const graph = fixture(seed);
  const options = graph.layoutOptions!;
  it(`matches seed ${seed}: ${String(options["elk.direction"])} ${String(options["elk.layered.layering.strategy"])} / ${String(options["elk.layered.crossingMinimization.strategy"])} / ${String(options["elk.layered.nodePlacement.strategy"])} / ${String(options["elk.edgeRouting"])}`, async () => {
    const [expected, actual] = await Promise.all([
      new OracleELK().layout(structuredClone(graph) as never) as Promise<ElkNode>,
      new NativeELK().layout(structuredClone(graph)),
    ]);
    expectGeometry(actual, expected);
  });
}
