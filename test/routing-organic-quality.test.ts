import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { organicRouting, getPathLength, getPointAtLength, type RoutePath } from "../src/routing";

const graph = createGraph({
  id: "organic-shoulders",
  nodes: [
    { id: "Start", x: 30, y: 80, width: 80, height: 44 },
    { id: "Review", x: 380, y: 40, width: 80, height: 44 },
    { id: "Publish", x: 380, y: 230, width: 80, height: 44 },
    { id: "Obstacle", x: 200, y: 60, width: 70, height: 110 },
    { id: "Independent", x: 30, y: 360, width: 100, height: 44 },
    { id: "Done", x: 380, y: 360, width: 80, height: 44 },
  ],
  edges: [
    { id: "review", sourceId: "Start", targetId: "Review" },
    { id: "publish", sourceId: "Start", targetId: "Publish", x: 210, y: 240, width: 72, height: 26 },
    { id: "parallel", sourceId: "Start", targetId: "Review" },
    { id: "loop", sourceId: "Publish", targetId: "Publish" },
    { id: "independent", sourceId: "Independent", targetId: "Done" },
  ],
});

function maximumShoulderTurn(path: RoutePath) {
  let maximum = 0;
  // Measure direction change over two adjacent four-pixel spans. Abrupt tiny
  // circular joins concentrate the turn even when segment tangents agree.
  for (let position = 4; position < getPathLength(path) - 4; position++) {
    const a = getPointAtLength(path, position - 4, { tolerance: 0.001 });
    const b = getPointAtLength(path, position, { tolerance: 0.001 });
    const c = getPointAtLength(path, position + 4, { tolerance: 0.001 });
    const u = { x: b.x - a.x, y: b.y - a.y };
    const v = { x: c.x - b.x, y: c.y - b.y };
    maximum = Math.max(maximum, Math.abs(Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y)));
  }
  return maximum;
}

it("distributes organic obstacle turns without faceted shoulders or new route conflicts", () => {
  const routes = organicRouting.route(graph).routes;
  for (const route of routes.values()) expect(route.status).toBe("routed");
  for (const id of ["parallel", "publish"]) {
    const path = routes.get(id)!.sections[0]!.path;
    expect(maximumShoulderTurn(path)).toBeLessThan(0.15);
  }
});

it.each([
  [{ x: 140, y: 80 }, { x: 160, y: 80 }, { x: 320, y: 80 }],
  [{ x: 350, y: 50 }, { x: 150, y: 200 }, { x: 150, y: 50 }, { x: 350, y: 200 }],
])("retains authored organic knots including collinear and crossing runs: %j", (...waypoints) => {
  const input = createGraph({
    id: "authored-organic",
    nodes: [
      { id: "a", x: 20, y: 100, width: 60, height: 60 },
      { id: "b", x: 440, y: 100, width: 60, height: 60 },
    ],
    edges: [{ id: "edge", sourceId: "a", targetId: "b" }],
  });
  const route = organicRouting.route(input, { edges: { edge: { waypoints } } }).routes.get("edge")!;
  expect(route.status).toBe("routed");
  for (const waypoint of waypoints)
    expect(route.sections[0]!.path.segments.map((segment) => segment.to)).toContainEqual(waypoint);
});
