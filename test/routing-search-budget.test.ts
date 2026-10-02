import { createGraph } from "@statelyai/graph";
import { orthogonalRouting, routeToPolylines } from "../src/routing";
import { crossesRect } from "../src/authoring/routing";
import { expect, it } from "vitest";
import { findPath, clear } from "../src/routing/search";
import obstacles from "./fixtures/orthogonal-search-obstacles.json";

it("finds the feasible long orthogonal route within its original search budget", () => {
  // Geometry minimized from random seed 196613, graph 5: Euclidean A*
  // exhausted 20,000 visits and the layout emitted a diagonal through nodes.
  const context = {
    obstacles: () => obstacles,
    maxSearchNodes: 6000,
    maxGridNodes: 40000,
    bendPenalty: 10,
    visited: 0,
    budgetExceeded: false,
  };
  const path = findPath({ x: 2231.5, y: 80 }, { x: 833.5, y: 1681.5 }, "orthogonal", context, {
    incoming: { x: 1, y: 0 },
    outgoing: { x: -1, y: 0 },
  });
  expect(path).toBeDefined();
  for (let i = 1; i < path!.length; i++) {
    const a = path![i - 1]!,
      b = path![i]!;
    expect(a.x === b.x || a.y === b.y).toBe(true);
    expect(clear(a, b, context)).toBe(true);
  }
});

it("routes through a positive subpixel gap between edge labels", () => {
  const routes = orthogonalRouting.route(
    createGraph({
      nodes: [
        { id: "a", x: 100, y: 215, width: 40, height: 40, ports: [{ name: "top", x: 20, y: 0 }] },
        { id: "b", x: 300, y: 150, width: 40, height: 40 },
      ],
      edges: [
        {
          id: "A",
          sourceId: "a",
          sourcePort: "top",
          targetId: "b",
          x: 110,
          y: 155.75,
          width: 30,
          height: 22,
        },
        { id: "Z", sourceId: "a", targetId: "b", x: 110, y: 178, width: 37, height: 22 },
      ],
    }),
    { maxSearchNodes: 40000 },
  ).routes;
  const route = routes.get("A")!;
  expect(
    route.diagnostics.filter((d) => d.code === "ROUTE_BLOCKED" || d.code === "SEARCH_BUDGET"),
  ).toEqual([]);
  for (const points of routeToPolylines(route))
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.x === points[i - 1]!.x || points[i]!.y === points[i - 1]!.y).toBe(true);
      expect(
        crossesRect(points[i - 1]!, points[i]!, { x: 110, y: 178, width: 37, height: 22 }),
      ).toBe(false);
    }
});
