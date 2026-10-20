import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { bezierRouting, polylineRouting, flattenPath, type RoutePath } from "../src/routing";
import { pathReverseTravel } from "../src/routing/policy-geometry";

function crossings(path: RoutePath) {
  const points = flattenPath(path, { tolerance: 0.02 });
  let count = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    for (let j = i + 2; j < points.length; j++) {
      const c = points[j - 1]!,
        d = points[j]!;
      const cross = (p: typeof a, q: typeof a, r: typeof a) =>
        (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      if (cross(a, b, c) * cross(a, b, d) < -1e-9 && cross(c, d, a) * cross(c, d, b) < -1e-9)
        count++;
    }
  }
  return count;
}
const graph = createGraph({
  id: "curve-quality",
  nodes: [
    { id: "a", x: 35, y: 65, width: 64, height: 44 },
    { id: "b", x: 435, y: 220, width: 64, height: 44 },
    { id: "obstacle", x: 245, y: 110, width: 80, height: 125 },
  ],
  edges: [{ id: "edge", sourceId: "a", targetId: "b", x: 195, y: 255, width: 90, height: 30 }],
});
it.each([0.5, 2])("avoids synthetic lobes and source humps at curvature %s", (curvature) => {
  const route = bezierRouting
    .route(graph, { policy: { curve: { kind: "bezier", curvature }, label: { kind: "follow" } } })
    .routes.get("edge")!;
  expect(route.status).toBe("routed");
  expect(route.sections).toHaveLength(1);
  const path = route.sections[0]!.path;
  expect(crossings(path)).toBe(0);
  expect(pathReverseTravel(path, "both", path.start, path.segments.at(-1)!.to)).toBeLessThan(0.1);
  expect(path.segments.every((s) => s.kind === "cubic")).toBe(true);
});
it("does not buy a subpixel Catmull length saving with artificial endpoint wiggles", () => {
  const waypoints = [
    { x: 175, y: 205 },
    { x: 280, y: 65 },
    { x: 365, y: 190 },
  ];
  const input = createGraph({
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== "obstacle"),
    edges: [{ id: "edge", sourceId: "a", targetId: "b" }],
  });
  const route = polylineRouting
    .route(input, {
      policy: {
        curve: { kind: "catmull-rom" },
        sourceTangent: { kind: "border-normal" },
        targetTangent: { kind: "border-normal" },
      },
      edges: { edge: { waypoints } },
    })
    .routes.get("edge")!;
  expect(route.status).toBe("routed");
  const path = route.sections[0]!.path;
  expect(path.segments).toHaveLength(4);
  expect(path.segments.slice(0, 3).map((s) => s.to)).toEqual(waypoints);
});
it("retains authored crossing knots", () => {
  const waypoints = [
    { x: 350, y: 50 },
    { x: 150, y: 200 },
    { x: 150, y: 50 },
    { x: 350, y: 200 },
  ];
  const input = createGraph({
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== "obstacle"),
    edges: [{ id: "edge", sourceId: "a", targetId: "b" }],
  });
  const route = bezierRouting
    .route(input, {
      policy: { curve: { kind: "bezier", curvature: 0.25 } },
      edges: { edge: { waypoints } },
    })
    .routes.get("edge")!;
  expect(route.status).toBe("routed");
  const path = route.sections[0]!.path;
  for (const point of waypoints) expect(path.segments.map((s) => s.to)).toContainEqual(point);
  expect(crossings(path)).toBeGreaterThan(0);
});
