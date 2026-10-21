import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { bezierRouting, getPathLength } from "../src/routing";
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
        curve: { kind: "catmull-rom" },
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
