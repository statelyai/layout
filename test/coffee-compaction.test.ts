import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { getLayeredLayout, type LayeredLayoutOptions } from "../src";

const fixture: {
  graph: Parameters<typeof getLayeredLayout>[0];
  options: LayeredLayoutOptions;
  nodeSettings: Record<string, ReturnType<NonNullable<LayeredLayoutOptions["nodeSettings"]>>>;
  edgeSettings: Record<string, ReturnType<NonNullable<LayeredLayoutOptions["edgeSettings"]>>>;
} = JSON.parse(
  readFileSync(new URL("./fixtures/coffee-flat-layout.json", import.meta.url), "utf8"),
);

it.each(["down", "right", "up", "left"] as const)(
  "compacts merged coffee transition chains across label segments in %s",
  (direction) => {
    const graph = fixture.graph;
    const result = getLayeredLayout(graph, {
      ...fixture.options,
      direction,
      nodeSettings: (node) => fixture.nodeSettings[node.id],
      edgeSettings: (edge) => fixture.edgeSettings[edge.id],
    });
    expect(result.nodes).toHaveLength(graph.nodes.length);
    expect(result.edges).toHaveLength(graph.edges.length);
    for (const edge of result.edges) {
      expect(edge.points?.length, edge.id).toBeGreaterThanOrEqual(2);
      for (const point of edge.points ?? []) {
        expect(Number.isFinite(point.x), edge.id).toBe(true);
        expect(Number.isFinite(point.y), edge.id).toBe(true);
      }
    }
    for (const node of result.nodes) {
      expect(Number.isFinite(node.x), node.id).toBe(true);
      expect(Number.isFinite(node.y), node.id).toBe(true);
    }
  },
);
