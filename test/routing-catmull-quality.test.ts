import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { bezierRouting, getPathLength, routeEdges, segmentCrossesRect } from "../src/routing";
import { rect } from "../src/routing/model";
import { pathReverseTravel } from "../src/routing/policy-geometry";
it("keeps un-authored Catmull obstacle guides compact without a source sag", () => {
  const graph = createGraph({
    id: "multiple-obstacles",
    nodes: [
      { id: "a", x: 35, y: 135, width: 72, height: 48 },
      { id: "b", x: 650, y: 135, width: 72, height: 48 },
      { id: "obstacle", x: 190, y: 65, width: 75, height: 170 },
      { id: "lower", x: 345, y: 165, width: 75, height: 160 },
      { id: "upper", x: 500, y: 25, width: 75, height: 150 },
    ],
    edges: [{ id: "edge", sourceId: "a", targetId: "b" }],
  });
  const route = bezierRouting
    .route(graph, {
      policy: {
        path: { kind: "catmull-rom" },
        sourceTangent: { kind: "border-normal" },
        targetTangent: { kind: "border-normal" },
      },
    })
    .routes.get("edge")!;
  expect(route.status).toBe("routed");
  const path = route.sections[0]!.path;
  expect(getPathLength(path)).toBeLessThan(760);
  const first = { start: path.start, segments: [path.segments[0]!] };
  expect(pathReverseTravel(first, "both", first.start, first.segments[0]!.to)).toBeLessThan(0.1);
});

it.each([
  { x: 366, y: 238 },
  { x: 374, y: 246 },
])("fits both Catmull–Rom label legs between closely spaced obstacles at $x,$y", ({ x, y }) => {
  const graph = createGraph({
    nodes: [
      { id: "s", x: 80, y: 140, width: 93.1953125, height: 45 },
      { id: "t", x: 95, y: 374, width: 84.3515625, height: 45 },
      { id: "blocker", x: 374, y: 304, width: 98.859375, height: 45 },
      { id: "one", x: 144, y: 215, width: 124.8984375, height: 45 },
      { id: "two", x: 284, y: 131, width: 129.5703125, height: 45 },
      { id: "three", x: 85, y: 277, width: 129.828125, height: 45 },
      { id: "four", x: 335, y: 374, width: 130.4296875, height: 45 },
    ],
    edges: [{ id: "e", sourceId: "s", targetId: "t", x, y, width: 52.0859375, height: 28 }],
  });
  const route = routeEdges({
    graph,
    settings: {
      crossingPenalty: 0,
      policy: {
        path: { kind: "catmull-rom" },
        sourceTangent: { kind: "border-normal" },
        targetTangent: { kind: "border-normal" },
        label: { kind: "gap", tangent: { kind: "border-normal" } },
      },
      edges: { e: { targetClearance: 10 } },
    },
  }).routes.get("e")!;
  expect(route.status, JSON.stringify(route.diagnostics)).toBe("routed");
  expect(route.sections).toHaveLength(2);
  for (const section of route.sections) {
    let from = section.path.start;
    for (const segment of section.path.segments) {
      expect(segment.kind).toBe("cubic");
      for (const node of graph.nodes)
        expect(segmentCrossesRect(from, segment, rect(node)!)).toBe(false);
      from = segment.to;
    }
  }
});
