import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

function expectNodeGeometry(actual: ElkNode, expected: ElkNode): void {
  for (const property of ["x", "y", "width", "height"] as const) {
    expect(
      actual[property] ?? (property === "x" || property === "y" ? 0 : Number.NaN),
      `${String(actual.id)}.${property}`,
    ).toBeCloseTo(
      expected[property] ?? (property === "x" || property === "y" ? 0 : Number.NaN),
      12,
    );
  }
  for (const expectedChild of expected.children ?? []) {
    const actualChild = actual.children?.find((child) => child.id === expectedChild.id);
    expect(actualChild).toBeDefined();
    if (actualChild) expectNodeGeometry(actualChild, expectedChild);
  }
  for (const expectedEdge of expected.edges ?? []) {
    const actualSection = actual.edges?.find((edge) => edge.id === expectedEdge.id)?.sections?.[0];
    const expectedSection = expectedEdge.sections?.[0];
    expect(actualSection?.startPoint).toEqual(expectedSection?.startPoint);
    expect(actualSection?.endPoint).toEqual(expectedSection?.endPoint);
    expect(actualSection?.bendPoints).toEqual(expectedSection?.bendPoints);
  }
}

function graph(width: number, aspectRatio: number): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.topdownLayout": "true",
      "elk.topdown.nodeType": "ROOT_NODE",
    },
    children: [
      {
        id: "parent",
        layoutOptions: {
          "elk.topdown.nodeType": "HIERARCHICAL_NODE",
          "elk.topdown.hierarchicalNodeWidth": width,
          "elk.topdown.hierarchicalNodeAspectRatio": aspectRatio,
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

describe("ELK top-down recursive layout parity", () => {
  it("matches a PARALLEL_NODE child", async () => {
    const input = graph(100, 2);
    input.children![0]!.layoutOptions!["elk.topdown.nodeType"] = "PARALLEL_NODE";
    delete input.children![0]!.layoutOptions!["elk.topdown.hierarchicalNodeWidth"];
    delete input.children![0]!.layoutOptions!["elk.topdown.hierarchicalNodeAspectRatio"];
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(input));
    expectNodeGeometry(actual, expected);
  });

  for (const [width, aspectRatio] of [
    [40, 2],
    [100, 2],
    [120, 1],
  ] as const) {
    it(`matches width ${width} and aspect ratio ${aspectRatio}`, async () => {
      const input = graph(width, aspectRatio);
      const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
      const actual = await new NativeELK().layout(structuredClone(input));
      expectNodeGeometry(actual, expected);
    });
  }

  it("rejects top-down layout combined with INCLUDE_CHILDREN", async () => {
    const input = graph(100, 2);
    input.layoutOptions!["elk.hierarchyHandling"] = "INCLUDE_CHILDREN";
    await expect(new NativeELK().layout(input)).rejects.toThrow(
      "Topdown layout cannot be used together with hierarchy handling",
    );
  });

  it("requires a top-down node type", async () => {
    const input = graph(100, 2);
    delete input.layoutOptions!["elk.topdown.nodeType"];
    await expect(new NativeELK().layout(input)).rejects.toThrow(
      "has not been assigned a top-down node type",
    );
  });
});
