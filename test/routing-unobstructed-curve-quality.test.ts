import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { bezierRouting, getPathLength, getPointAtLength, type RoutingLabel } from "../src/routing";
import { pathReverseTravel } from "../src/routing/policy-geometry";

const graph = createGraph({
  id: "unobstructed-curves",
  nodes: [
    { id: "a", x: 35, y: 65, width: 64, height: 44 },
    { id: "b", x: 435, y: 220, width: 64, height: 44 },
  ],
  edges: [{ id: "edge", sourceId: "a", targetId: "b", x: 195, y: 255, width: 90, height: 30 }],
});
it.each(["follow", "fixed", "gap"] as const)(
  "retains a broad clean requested curve with a %s label",
  (kind) => {
    const label: RoutingLabel =
      kind === "gap" ? { kind, tangent: { kind: "border-normal" } } : { kind };
    const route = bezierRouting
      .route(graph, {
        policy: {
          curve: { kind: "bezier" },
          label,
          sourceTangent: { kind: "border-normal" },
          targetTangent: { kind: "border-normal" },
        },
      })
      .routes.get("edge")!;
    expect(route.status).toBe("routed");
    for (const { path } of route.sections)
      expect(pathReverseTravel(path, "both", path.start, path.segments.at(-1)!.to)).toBeLessThan(
        1e-7,
      );
    const path = route.sections[0]!.path;
    const quarter = getPointAtLength(path, getPathLength(path) / 4, { tolerance: 0.01 });
    const end = path.segments.at(-1)!.to;
    const dx = end.x - path.start.x,
      dy = end.y - path.start.y;
    const departure =
      Math.abs(dx * (quarter.y - path.start.y) - dy * (quarter.x - path.start.x)) /
      Math.hypot(dx, dy);
    expect(departure).toBeGreaterThan(15);
  },
);
