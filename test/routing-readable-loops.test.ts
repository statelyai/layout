import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { selfLoopRouting, flattenPath } from "../src/routing";
import { pathHasSelfIntersection, pathEndpointTangent } from "../src/routing/policy-geometry";
it.each([false, true])("draws a readable smooth same-face loop beside obstacle %s", (obstacle) => {
  const graph = createGraph({
    id: "readable-loop",
    nodes: [
      { id: "a", x: 220, y: 170, width: 100, height: 64 },
      ...(obstacle ? [{ id: "obstacle", x: 343, y: 145, width: 64, height: 112 }] : []),
    ],
    edges: [{ id: "loop", sourceId: "a", targetId: "a" }],
  });
  const route = selfLoopRouting
    .route(graph, {
      policy: {
        curve: { kind: "bezier" },
        sourceTangent: { kind: "border-normal" },
        targetTangent: { kind: "border-normal" },
      },
      edges: { loop: { sourceSide: "right", targetSide: "right" } },
    })
    .routes.get("loop")!;
  expect(route.status).toBe("routed");
  const path = route.sections[0]!.path;
  expect(pathHasSelfIntersection(path)).toBe(false);
  const points = flattenPath(path, { tolerance: 0.02 });
  if (obstacle) {
    expect(Math.max(...points.map((point) => point.x)) - path.start.x).toBeGreaterThan(14);
    expect(
      Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)),
    ).toBeGreaterThan(40);
  }
  const area =
    Math.abs(
      points.slice(1).reduce((sum, p, i) => sum + points[i]!.x * p.y - p.x * points[i]!.y, 0),
    ) / 2;
  expect(area).toBeGreaterThan(100);
  expect(pathEndpointTangent(path, "start").x).toBeCloseTo(1);
  expect(pathEndpointTangent(path, "end").x).toBeCloseTo(-1);
});
