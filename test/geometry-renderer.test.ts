import { describe, expect, it } from "vitest";
import {
  geometryPath,
  getGeometryBounds,
  routeLength,
  visibleNodeCount,
  type GeometryGraph,
} from "../demo/src/geometry-renderer";

describe("geometry renderer primitives", () => {
  it("renders polyline and spline route semantics exactly", () => {
    expect(
      geometryPath(
        [
          { x: 0, y: 10 },
          { x: 20, y: 10 },
          { x: 20, y: 40 },
        ],
        "orthogonal",
      ),
    ).toBe("M 0 10 L 20 10 L 20 40");
    expect(
      geometryPath(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 20, y: 20 },
          { x: 30, y: 20 },
        ],
        "splines",
      ),
    ).toBe("M 0 0 C 10 0 20 20 30 20");
  });

  it("includes nodes, relative ports, routes, and edge label rectangles in bounds", () => {
    const graph: GeometryGraph = {
      nodes: [
        {
          id: "node",
          parentId: null,
          x: 10,
          y: 20,
          width: 100,
          height: 50,
          ports: [
            {
              name: "out",
              direction: "out",
              x: 98,
              y: 20,
              width: 12,
              height: 12,
            },
          ],
        },
      ],
      edges: [
        {
          id: "edge",
          sourceId: "node",
          targetId: "node",
          x: 140,
          y: 80,
          width: 30,
          height: 20,
          points: [
            { x: 110, y: 45 },
            { x: 130, y: 100 },
          ],
        },
      ],
    };

    expect(getGeometryBounds(graph)).toEqual({ x: 10, y: 20, width: 160, height: 80 });
    expect(routeLength(graph.edges[0]!.points!)).toBeCloseTo(58.523, 3);
  });

  it("renders ordinary top-level nodes while omitting generated structural roots", () => {
    expect(
      visibleNodeCount({ nodes: [{ id: "a", x: 0, y: 0, width: 80, height: 40 }], edges: [] }),
    ).toBe(1);
    expect(
      visibleNodeCount({
        nodes: [
          { id: "example:root", x: 0, y: 0, width: 200, height: 100 },
          { id: "a", parentId: "example:root", x: 20, y: 20, width: 80, height: 40 },
        ],
        edges: [],
      }),
    ).toBe(1);
  });
});
