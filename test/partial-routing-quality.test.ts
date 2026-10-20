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
    expect(
      points.some((b, i) => {
        const a = points[i - 1];
        return (
          a &&
          ((a.x === point.x &&
            b.x === point.x &&
            point.y >= Math.min(a.y, b.y) &&
            point.y <= Math.max(a.y, b.y)) ||
            (a.y === point.y &&
              b.y === point.y &&
              point.x >= Math.min(a.x, b.x) &&
              point.x <= Math.max(a.x, b.x)))
        );
      }),
    ).toBe(true);
    expect(result.diagnostics.some((d) => d.code === "ROUTE_BLOCKED")).toBe(false);
  });

  it("uses positioned port sides for leads while preserving their authored geometry", async () => {
    const graph = fixture();
    graph.nodes[0]!.ports = [{ name: "out", x: 40, y: 0, width: 0, height: 0, data: null }];
    graph.nodes[1]!.ports = [{ name: "in", x: 40, y: 44, width: 0, height: 0, data: null }];
    graph.edges[0]!.sourcePort = "out";
    graph.edges[0]!.targetPort = "in";
    const result = await getLayout({ graph, scope: { mode: "route-only" } });
    const points = result.graph.edges[0]!.points!;
    expect(points[0]).toEqual({ x: 80, y: 100 });
    expect(points[1]!.x).toBe(80);
    expect(points[1]!.y).toBeLessThanOrEqual(92);
    expect(points.at(-2)!.x).toBe(510);
    expect(points.at(-2)!.y).toBeGreaterThanOrEqual(152);
    expect(points.at(-1)).toEqual({ x: 510, y: 144 });
    expect(result.graph.nodes).toEqual(graph.nodes);
  });

  it("relaxes leads when a channel has less than one unit of room", async () => {
    const graph = fixture();
    Object.assign(graph.nodes[2]!, { x: 120.5, y: 100, width: 10, height: 44 });
    const result = await getLayout({ graph, scope: { mode: "route-only" } });
    const points = result.graph.edges[0]!.points!;
    expect(points[0]).toEqual({ x: 120, y: 122 });
    expect(points.at(-1)).toEqual({ x: 470, y: 122 });
    for (const node of graph.nodes) expect(routeCrosses(points, node)).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "ROUTE_BLOCKED")).toBe(false);
  });

  it("keeps sibling routes parent-relative and the parent fixed", async () => {
    const graph = fixture();
    graph.nodes = [
      { ...graph.nodes[0]!, id: "parent", x: 1000, y: 2000, width: 700, height: 400 },
      ...graph.nodes.map((node) => ({ ...node, parentId: "parent" })),
    ];
    const result = await getLayout({ graph, scope: { mode: "route-only" } });
    const points = result.graph.edges[0]!.points!;
    expect(points[0]).toEqual({ x: 120, y: 122 });
    expect(points.at(-1)).toEqual({ x: 470, y: 122 });
    expect(routeCrosses(points, { x: 272, y: 57, width: 116, height: 141 })).toBe(false);
    expect(result.graph.nodes).toEqual(graph.nodes);
  });

  it("leaves the same preferred clearance around fixed labels", async () => {
    const graph = fixture();
    graph.nodes.pop();
    graph.edges.push({
      ...graph.edges[0]!,
      id: "fixed-label",
      x: 280,
      y: 65,
      width: 100,
      height: 125,
    });
    const result = await getLayout({ graph, scope: { mode: "route-only", edgeIds: ["ab"] } });
    expect(
      routeCrosses(result.graph.edges[0]!.points, { x: 272, y: 57, width: 116, height: 141 }),
    ).toBe(false);
    expect(result.graph.edges[1]).toEqual(graph.edges[1]);
  });
});
