import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { routeEdges } from "../src/routing";
const graph = createGraph({
  nodes: [
    { id: "a", x: 0, y: 0, width: 40, height: 40 },
    { id: "b", x: 300, y: 180, width: 40, height: 40 },
  ],
  edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
});
it.each([
  { kind: "rounded-orthogonal", geometry: "polyline" },
  { kind: "bezier", geometry: "orthogonal" },
  { kind: "catmull-rom", geometry: "straight" },
  { kind: "polyline", radius: 10 },
  { kind: "bezier", minRadius: 2 },
  { kind: "catmull-rom", curvature: 0.5 },
])("rejects ignored options from untyped path configuration: %j", (invalid) => {
  expect(() =>
    routeEdges({ graph, settings: { policy: { path: JSON.parse(JSON.stringify(invalid)) } } }),
  ).toThrow(RangeError);
});
it.each(["orthogonal", "polyline", "octilinear", "straight"] as const)(
  "selects %s from the polyline path itself",
  (geometry) => {
    const snapshot = routeEdges({
      graph,
      settings: { policy: { path: { kind: "polyline", geometry } } },
    });
    expect(snapshot.strategy).toContain(geometry);
    expect(snapshot.routes.get("ab")!.sections.length).toBeGreaterThan(0);
  },
);
it.each([
  { geometry: "polyline" },
  { settings: { policy: { curve: { kind: "bezier" } } } },
  { settings: { edges: { ab: { geometry: "polyline" } } } },
])("rejects removed independent controls from JavaScript: %j", (legacy) => {
  expect(() => routeEdges({ ...JSON.parse(JSON.stringify(legacy)), graph })).toThrow(RangeError);
});
