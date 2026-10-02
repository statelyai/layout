import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import fixtures from "./fixtures/heuristic-routing.json";
import { getLayeredLayout, getLayoutRoutes, routeToPolylines, type LayoutDirection } from "../src";
import { crossesRect } from "../src/authoring/routing";
import { outsideTerminal, pathReservations } from "../src/routing/coordination";

for (const fixture of fixtures) {
  it(`routes seeded graph ${fixture.id} orthogonally without crossing leaf interiors`, () => {
    const layout = getLayeredLayout(
      createGraph({
        ...fixture.input,
        nodes: fixture.input.nodes.map((n) => ({
          ...n,
          ports: n.ports?.map((p) => ({ ...p, direction: "inout" as const })),
        })),
      }),
      {
        direction: fixture.direction as LayoutDirection,
        padding: 24,
        spacing: { node: 36, layer: 56 },
        nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
        portSettings: (port) => ({ "port.side": port.data.side }),
        compound: () => ({ header: { width: 140, height: 36, side: "top" } }),
      },
    );
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const parents = new Set(layout.nodes.map((n) => n.parentId));
    const leaves = layout.nodes
      .filter((n) => !parents.has(n.id))
      .map((n) => {
        let x = n.x,
          y = n.y,
          parent = n.parentId;
        while (parent) {
          const a = byId.get(parent)!;
          x += a.x;
          y += a.y;
          parent = a.parentId;
        }
        return { ...n, x, y };
      });
    const routes = getLayoutRoutes(layout);
    expect(routes.size).toBe(fixture.input.edges.length);
    for (const [id, route] of routes) {
      expect(
        route.diagnostics.filter((d) => d.code === "ROUTE_BLOCKED" || d.code === "SEARCH_BUDGET"),
        id,
      ).toEqual([]);
      for (const points of routeToPolylines(route))
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1]!,
            b = points[i]!;
          expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6, `${id}: diagonal`).toBe(
            true,
          );
          for (const leaf of leaves)
            expect(crossesRect(a, b, leaf), `${id}: crosses ${leaf.id}`).toBe(false);
        }
      const edge = layout.edges.find((e) => e.id === id)!;
      let segments = route.sections.flatMap((s) => pathReservations(s.path));
      if (edge.sourceId === edge.targetId) {
        const n = leaves.find((n) => n.id === edge.sourceId);
        if (n)
          segments = segments.flatMap((s) =>
            outsideTerminal(s, {
              x: n.x - 12,
              y: n.y - 12,
              width: n.width + 24,
              height: n.height + 24,
            }),
          );
      }
      for (let i = 0; i < segments.length; i++)
        for (let j = i + 1; j < segments.length; j++) {
          const a = segments[i]!,
            b = segments[j]!;
          const overlap = (a0: number, a1: number, b0: number, b1: number) =>
            Math.min(Math.max(a0, a1), Math.max(b0, b1)) -
            Math.max(Math.min(a0, a1), Math.min(b0, b1));
          if (a.a.x === a.b.x && b.a.x === b.b.x && Math.abs(a.a.x - b.a.x) < 1e-6)
            expect(
              overlap(a.a.y, a.b.y, b.a.y, b.b.y),
              `${id}: retraced vertical segment`,
            ).toBeLessThanOrEqual(1e-6);
          if (a.a.y === a.b.y && b.a.y === b.b.y && Math.abs(a.a.y - b.a.y) < 1e-6)
            expect(
              overlap(a.a.x, a.b.x, b.a.x, b.b.x),
              `${id}: retraced horizontal segment`,
            ).toBeLessThanOrEqual(1e-6);
        }
    }
  }, 30000);
}

it("anchors compound child ports to node dimensions, not boundary-label envelopes", () => {
  const result = getLayeredLayout(
    createGraph({
      nodes: [
        { id: "g", width: 140, height: 36 },
        {
          id: "a",
          parentId: "g",
          width: 100,
          height: 50,
          ports: [{ name: "south", x: 50, y: 50, width: 6, height: 6 }],
        },
      ],
      edges: [{ id: "enter", sourceId: "g", targetId: "a", width: 100, height: 30 }],
    }),
    {
      nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
      portSettings: () => ({ "port.side": "SOUTH" }),
      compound: () => ({ header: { width: 140, height: 36 } }),
    },
  );
  const a = result.nodes.find((n) => n.id === "a")!;
  expect(a.ports![0]!.y).toBe(a.height);
});
