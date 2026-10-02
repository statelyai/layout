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

it("keeps the final child approach free while routing an ancestor edge through a label", () => {
  // Minimized from review graph 9, E12: the first label leg previously
  // consumed the target approach, forcing the second leg through the child.
  const graph = createGraph({
    nodes: [
      { id: "g", x: 0, y: 0, width: 600, height: 300 },
      { id: "t", parentId: "g", x: 250, y: 50, width: 200, height: 200 },
    ],
    edges: [{ id: "e", sourceId: "g", targetId: "t", x: 500, y: 140, width: 30, height: 20 }],
  });
  const route = orthogonalRouting
    .route(graph, {
      edges: {
        e: {
          sourceSide: "left",
          targetSide: "left",
          sourceAttachment: {
            bounds: { x: 20, y: 20, width: 560, height: 260 },
            facing: "inward",
          },
        },
      },
    })
    .routes.get("e")!;
  expect(route.diagnostics).toEqual([]);
  const sections = routeToPolylines(route);
  expect(sections).toHaveLength(2);
  for (const points of sections)
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
      expect(crossesRect(a, b, { x: 250, y: 50, width: 200, height: 200 })).toBe(false);
    }
});

for (const reverse of [false, true]) {
  it(`routes an inward ${reverse ? "target" : "source"} attachment along a child boundary despite coordinate roundoff`, () => {
    // Seed 1791673957 / graph 10, E36: content normalization places
    // its top a few ulps inside a child edge. Boundary travel remains legal.
    const graph = createGraph({
      nodes: [
        { id: "g", x: 0, y: 0, width: 600, height: 300 },
        {
          id: "t",
          parentId: "g",
          x: 250,
          y: 20,
          width: 100,
          height: 56,
          ports: [{ name: "west", x: -6, y: 28, width: 6, height: 6 }],
        },
        { id: "left", parentId: "g", x: 20, y: 40, width: 80, height: 80 },
        { id: "right", parentId: "g", x: 500, y: 40, width: 80, height: 80 },
        { id: "bottom", parentId: "g", x: 250, y: 230, width: 100, height: 50 },
      ],
      edges: [
        reverse
          ? { id: "e", sourceId: "t", sourcePort: "west", targetId: "g" }
          : { id: "e", sourceId: "g", targetId: "t", targetPort: "west" },
      ],
    });
    const route = orthogonalRouting
      .route(graph, {
        coordinateSpace: "world",
        edges: {
          e: {
            [reverse ? "targetAttachment" : "sourceAttachment"]: {
              bounds: { x: 20, y: 20 + 1e-13, width: 560, height: 260 - 1e-13 },
              facing: "inward",
            },
          },
        },
      })
      .routes.get("e")!;
    expect(route.diagnostics).toEqual([]);
    const points = routeToPolylines(route)[0]!;
    const attachment = reverse ? points.at(-1)! : points[0]!;
    expect(
      attachment.x === 20 ||
        attachment.x === 580 ||
        Math.abs(attachment.y - 20) < 1e-10 ||
        attachment.y === 280,
    ).toBe(true);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
      for (const node of graph.nodes.filter((n) => n.id !== "g"))
        expect(
          crossesRect(a, b, { x: node.x!, y: node.y!, width: node.width!, height: node.height! }),
        ).toBe(false);
    }
    expect(reverse ? points[0] : points.at(-1)).toEqual({ x: 247, y: 51 });
  });
}
