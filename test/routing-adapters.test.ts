import { createGraph } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import { getLayeredLayout } from "../src";
import {
  getLayoutRoutes,
  orthogonalRouting,
  pathFromSplinePoints,
  routeToGraphPatch,
  routeToPolylines,
  toSvgPath,
} from "../src/routing";

describe("layout route adapters", () => {
  it.each(["ORTHOGONAL", "POLYLINE", "SPLINES"] as const)(
    "normalizes %s output from the existing layered implementation",
    (edgeRouting) => {
      const graph = createGraph({
        nodes: [
          { id: "a", width: 40, height: 40 },
          { id: "b", width: 40, height: 40 },
        ],
        edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
      });
      const layout = getLayeredLayout(graph, { settings: { edgeRouting } }),
        routes = getLayoutRoutes(layout),
        route = routes.get("ab")!;
      expect(route.status).toBe("routed");
      expect(toSvgPath(route.sections[0]!.path)).toContain(
        edgeRouting === "SPLINES" ? " C " : " L ",
      );
      expect(routeToPolylines(route)[0]!.length).toBeGreaterThan(1);
      expect(routeToGraphPatch(route)).toMatchObject({
        op: "updateEdge",
        id: "ab",
        data: { routing: "polyline" },
      });
    },
  );
  it("does not silently discard malformed spline controls", () => {
    expect(() =>
      pathFromSplinePoints([
        { x: 0, y: 0 },
        { x: 20, y: 30 },
      ]),
    ).toThrow(/triples/);
  });
  it("preserves label gaps for simple renderers", () => {
    const graph = createGraph({
      nodes: [
        { id: "a", x: 0, y: 0, width: 40, height: 40 },
        { id: "b", x: 240, y: 0, width: 40, height: 40 },
      ],
      edges: [{ id: "ab", sourceId: "a", targetId: "b", x: 100, y: 10, width: 60, height: 20 }],
    });
    const route = orthogonalRouting.route(graph).routes.get("ab")!;
    expect(routeToPolylines(route)).toHaveLength(2);
    expect(() => routeToGraphPatch(route)).toThrow(/topology/);
  });
});

import { getElkRoutes } from "../src/elkjs";
it("preserves ELK branching topology, ports, and parent coordinates", () => {
  const routes = getElkRoutes({
    id: "root",
    children: [
      {
        id: "group",
        x: 100,
        y: 50,
        children: [
          { id: "a", x: 0, y: 0, ports: [{ id: "a.out", x: 40, y: 20 }] },
          { id: "b", x: 200, y: 0 },
          { id: "c", x: 200, y: 100 },
        ],
        edges: [
          {
            id: "net",
            sources: ["a.out"],
            targets: ["b", "c"],
            sections: [
              {
                id: "stem",
                incomingShape: "a.out",
                startPoint: { x: 40, y: 20 },
                endPoint: { x: 100, y: 20 },
                outgoingSections: ["b-leg", "c-leg"],
              },
              {
                id: "b-leg",
                outgoingShape: "b",
                startPoint: { x: 100, y: 20 },
                endPoint: { x: 200, y: 20 },
                incomingSections: ["stem"],
              },
              {
                id: "c-leg",
                outgoingShape: "c",
                startPoint: { x: 100, y: 20 },
                endPoint: { x: 200, y: 120 },
                incomingSections: ["stem"],
              },
            ],
          },
        ],
      },
    ],
  }).get("net")!;
  expect(routes.sections[0].from).toEqual({ kind: "node", nodeId: "a", port: "a.out" });
  expect(routes.sections[0].path.start).toEqual({ x: 140, y: 70 });
  expect(routes.sections[0].to).toEqual(routes.sections[1].from);
  expect(routes.sections[1].from).toEqual(routes.sections[2].from);
});
it("normalizes ELK spline control points", () => {
  const route = getElkRoutes(
    {
      id: "root",
      edges: [
        {
          id: "ab",
          sources: ["a"],
          targets: ["b"],
          sections: [
            {
              id: "s",
              startPoint: { x: 0, y: 0 },
              bendPoints: [
                { x: 20, y: 0 },
                { x: 40, y: 20 },
              ],
              endPoint: { x: 60, y: 20 },
            },
          ],
        },
      ],
    },
    { routing: "SPLINES" },
  ).get("ab")!;
  expect(toSvgPath(route.sections[0].path)).toBe("M 0 0 C 20 0 40 20 60 20");
});
