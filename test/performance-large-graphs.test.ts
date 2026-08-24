import { describe, expect, it } from "vitest";
import {
  createDeepCompoundFixture,
  createLayeredDagFixture,
  createLinearFixture,
} from "../bench/fixtures";
import { getLayeredLayout } from "../src";

describe("large graph performance regressions", () => {
  it("lays out a 10,000-node chain without recursion", () => {
    const graph = createLinearFixture(10_000);
    const result = getLayeredLayout(graph);

    expect(result.nodes).toHaveLength(10_000);
    expect(result.edges).toHaveLength(9_999);
    expect(result.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(
      true,
    );
    expect(result.edges.every((edge) => (edge.points?.length ?? 0) >= 2)).toBe(true);

    const longestPath = getLayeredLayout(graph, {
      settings: { "layering.strategy": "LONGEST_PATH" },
    });
    expect(longestPath.nodes).toHaveLength(10_000);
  }, 20_000);

  it("lays out 10,000 recursively nested nodes without recursion", () => {
    const graph = createDeepCompoundFixture(10_000);
    const result = getLayeredLayout(graph);

    expect(result.nodes).toHaveLength(10_000);
    expect(result.edges).toHaveLength(9_999);
    expect(result.nodes.at(-1)?.parentId).toBe("n9998");
    expect(result.edges.every((edge) => edge.routing === "orthogonal")).toBe(true);
  }, 10_000);

  for (const [edgeRouting, expected] of [
    ["ORTHOGONAL", "orthogonal"],
    ["POLYLINE", "polyline"],
    ["SPLINES", "splines"],
  ] as const) {
    it(`routes every edge in a large long-edge DAG with ${edgeRouting}`, () => {
      const graph = createLayeredDagFixture(12, 20, true);
      const result = getLayeredLayout(graph, { settings: { edgeRouting } });

      expect(result.nodes).toHaveLength(240);
      expect(result.edges.every((edge) => edge.routing === expected)).toBe(true);
      expect(result.edges.every((edge) => (edge.points?.length ?? 0) >= 2)).toBe(true);
    }, 10_000);
  }
});
