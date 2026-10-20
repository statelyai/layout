import { createGraph, getDiff } from "@statelyai/graph";
import { expect, it } from "vitest";
import { bezierRouting, getPathLength, type RoutingSettings } from "../src/routing";
const graph = createGraph({
  id: "automatic-crossing-faces",
  nodes: [
    { id: "a", x: 35, y: 60, width: 64, height: 44 },
    { id: "b", x: 435, y: 220, width: 64, height: 44 },
    { id: "c", x: 35, y: 220, width: 64, height: 44 },
    { id: "d", x: 435, y: 60, width: 64, height: 44 },
  ],
  edges: [
    { id: "edge", sourceId: "a", targetId: "b" },
    { id: "second", sourceId: "c", targetId: "d" },
  ],
});
const settings: RoutingSettings = {
  maxSearchNodes: 8000,
  policy: {
    curve: { kind: "bezier" },
    collisions: { crossingPenalty: 1000, overlapPenalty: 12 },
    stability: { kind: "preserve-valid" },
  },
  edges: { second: { sourceSides: ["top", "right"] } },
};
it("uses a permitted top departure instead of a synthetic side hook", () => {
  const snapshot = bezierRouting.route(graph, settings),
    route = snapshot.routes.get("second")!;
  expect(route.status).toBe("routed");
  expect(route.sections[0]!.fromSide).toBe("top");
  expect(route.sections.reduce((n, s) => n + getPathLength(s.path), 0)).toBeLessThan(620);
  expect(snapshot.metrics.searchNodes).toBeLessThanOrEqual(settings.maxSearchNodes! * 2);
  const updated = bezierRouting.update(graph, snapshot, getDiff(graph, graph), {
    ...settings,
    policy: { ...settings.policy, collisions: { crossingPenalty: 1100, overlapPenalty: 12 } },
  }).snapshot;
  expect(updated.routes.get("second")!.sections).toEqual(route.sections);
});
it("keeps an explicitly requested departure face", () => {
  const route = bezierRouting
    .route(graph, { ...settings, edges: { second: { sourceSide: "right" } } })
    .routes.get("second")!;
  expect(route.sections[0]!.fromSide).toBe("right");
});
