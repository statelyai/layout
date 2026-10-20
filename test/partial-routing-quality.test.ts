import { createGraph } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import { c, getFixedLayout, getLayout } from "../src";
import { routeCrosses } from "../src/authoring/routing";

function fixture() {
  return getFixedLayout(
    createGraph({
      nodes: [
        { id: "a", x: 40, y: 100, width: 80, height: 44 },
        { id: "b", x: 470, y: 100, width: 80, height: 44 },
        { id: "fixed", x: 280, y: 65, width: 100, height: 125 },
      ],
      edges: [
        {
          id: "ab",
          sourceId: "a",
          targetId: "b",
          x: 165,
          y: 270,
          width: 80,
          height: 26,
          points: [
            { x: 120, y: 122 },
            { x: 470, y: 122 },
          ],
          routing: "orthogonal",
        },
      ],
    }),
    { direction: "right" },
  );
}

describe("partial routing quality", () => {
  it.each(["partial", "route-only"] as const)(
    "%s leaves eight units around blockers and normal terminal leads",
    async (mode) => {
      const graph = fixture();
      const result = await getLayout({
        graph,
        scope: { mode, edgeIds: ["ab"], ...(mode === "partial" ? { edgeGeometry: "routes" } : {}) },
      });
      const points = result.graph.edges[0]!.points!;
      expect(routeCrosses(points, { x: 272, y: 57, width: 116, height: 141 })).toBe(false);
      expect(points[0]).toEqual({ x: 120, y: 122 });
      expect(points[1]!.x).toBeGreaterThanOrEqual(128);
      expect(points[1]!.y).toBe(122);
      expect(points.at(-2)!.x).toBeLessThanOrEqual(462);
      expect(points.at(-2)!.y).toBe(122);
      expect(points.at(-1)).toEqual({ x: 470, y: 122 });
      expect(result.graph.nodes).toEqual(graph.nodes);
      expect(result.graph.edges[0]).toMatchObject({ x: 165, y: 270, width: 80, height: 26 });
      expect(result.diagnostics.some((d) => d.code === "ROUTE_BLOCKED")).toBe(false);
    },
  );

  it("preserves a waypoint inside preferred clearance by relaxing the clearance", async () => {
    const graph = fixture();
    const point = { x: 275, y: 62 };
    const result = await getLayout({
      graph,
      scope: { mode: "route-only" },
      constraints: [c.waypoint({ id: "via", edgeId: "ab", point })],
    });
    const points = result.graph.edges[0]!.points!;
    expect(routeCrosses(points, graph.nodes[2]!)).toBe(false);
    expect(points).toContainEqual(point);
    expect(result.diagnostics.some((d) => d.code === "ROUTE_BLOCKED")).toBe(false);
  });
});
