import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkEdgeSection, type ElkNode } from "../src/elkjs";

function expectPoint(actual: { x: number; y: number }, expected: { x: number; y: number }): void {
  expect(actual.x).toBeCloseTo(expected.x, 12);
  expect(actual.y).toBeCloseTo(expected.y, 12);
}

function expectSection(actual: ElkEdgeSection, expected: ElkEdgeSection): void {
  expectPoint(actual.startPoint, expected.startPoint);
  expectPoint(actual.endPoint, expected.endPoint);
  expect(actual.bendPoints ?? []).toHaveLength(expected.bendPoints?.length ?? 0);
  for (const [index, point] of (expected.bendPoints ?? []).entries()) {
    expectPoint(actual.bendPoints![index]!, point);
  }
  expect(actual.incomingShape).toBe(expected.incomingShape);
  expect(actual.outgoingShape).toBe(expected.outgoingShape);
}

function expectGeometry(actual: ElkNode, expected: ElkNode): void {
  for (const property of ["x", "y", "width", "height"] as const) {
    expect(actual[property] ?? 0, `${String(actual.id)}.${property}`).toBeCloseTo(
      expected[property] ?? 0,
      12,
    );
  }
  expect(actual.children?.map((node) => node.id)).toEqual(
    expected.children?.map((node) => node.id),
  );
  for (const expectedChild of expected.children ?? []) {
    expectGeometry(
      actual.children!.find((node) => String(node.id) === String(expectedChild.id))!,
      expectedChild,
    );
  }
  for (const expectedEdge of expected.edges ?? []) {
    const actualEdge = actual.edges?.find((edge) => String(edge.id) === String(expectedEdge.id));
    expect(actualEdge?.sections).toHaveLength(expectedEdge.sections?.length ?? 0);
    for (const [index, section] of (expectedEdge.sections ?? []).entries()) {
      expectSection(actualEdge!.sections![index]!, section);
    }
  }
}

async function compare(graph: ElkNode): Promise<void> {
  const expected = (await new OracleELK().layout(structuredClone(graph) as never)) as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expectGeometry(actual, expected);
}

const baseGraph = (): ElkNode => ({
  id: "root",
  layoutOptions: {
    "elk.algorithm": "layered",
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  },
  children: [
    {
      id: "parent",
      children: [
        { id: "a", width: 20, height: 20 },
        { id: "b", width: 20, height: 20 },
        { id: "c", width: 20, height: 20 },
      ],
    },
    { id: "outside", width: 20, height: 20 },
  ],
  edges: [
    { id: "ao", sources: ["a"], targets: ["outside"] },
    { id: "bo", sources: ["b"], targets: ["outside"] },
    { id: "ca", sources: ["c"], targets: ["a"] },
  ],
});

describe("ELK compound layered parity", () => {
  it("matches cross-hierarchy placement and routing", async () => {
    await compare(baseGraph());
  });

  for (const type of ["OFF", "ONE_SIDED", "TWO_SIDED"]) {
    it(`matches hierarchical greedy switch ${type}`, async () => {
      const graph = baseGraph();
      graph.layoutOptions!["elk.layered.crossingMinimization.greedySwitchHierarchical.type"] = type;
      await compare(graph);
    });
  }

  for (const sweepiness of [0, 0.5, 1]) {
    it(`matches hierarchical sweepiness ${sweepiness}`, async () => {
      const graph = baseGraph();
      graph.layoutOptions!["elk.layered.crossingMinimization.hierarchicalSweepiness"] = sweepiness;
      await compare(graph);
    });
  }

  for (const merge of [false, true]) {
    it(`matches hierarchy-edge merging ${merge}`, async () => {
      const graph = baseGraph();
      graph.layoutOptions!["elk.layered.mergeHierarchyEdges"] = merge;
      await compare(graph);
    });
  }

  it("matches an edge crossing two compound boundaries", async () => {
    await compare({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      },
      children: [
        {
          id: "left",
          children: [
            { id: "a", width: 20, height: 20 },
            { id: "c", width: 20, height: 20 },
          ],
        },
        {
          id: "right",
          children: [
            { id: "b", width: 20, height: 20 },
            { id: "d", width: 20, height: 20 },
          ],
        },
      ],
      edges: [
        { id: "ab", sources: ["a"], targets: ["b"] },
        { id: "ca", sources: ["c"], targets: ["a"] },
        { id: "bd", sources: ["b"], targets: ["d"] },
      ],
    });
  });

  it("matches hierarchy crossings through an explicit descendant port", async () => {
    await compare({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      },
      children: [
        {
          id: "parent",
          children: [
            {
              id: "a",
              width: 20,
              height: 20,
              layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
              ports: [
                {
                  id: "ap",
                  width: 0,
                  height: 0,
                  layoutOptions: { "elk.port.side": "EAST" },
                },
              ],
            },
            { id: "c", width: 20, height: 20 },
          ],
        },
        { id: "x", width: 20, height: 20 },
        { id: "y", width: 20, height: 20 },
      ],
      edges: [
        { id: "ax", sources: ["ap"], targets: ["x"] },
        { id: "ay", sources: ["ap"], targets: ["y"] },
        { id: "ca", sources: ["c"], targets: ["a"] },
      ],
    });
  });
});
