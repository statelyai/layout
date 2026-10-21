import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { bezierRouting, flattenPath, getPointAtLength } from "../src/routing";

it("keeps broad source bends and separated smooth returns in dense same-face branches", () => {
  const graph = createGraph({
    id: "dense-return-curves",
    nodes: [
      { id: "a", x: 65, y: 155, width: 72, height: 48 },
      { id: "b", x: 395, y: 70, width: 72, height: 48 },
      { id: "c", x: 395, y: 160, width: 72, height: 48 },
      { id: "d", x: 395, y: 250, width: 72, height: 48 },
    ],
    edges: [
      { id: "edge", sourceId: "a", targetId: "b" },
      { id: "branch-c", sourceId: "a", targetId: "c" },
      { id: "branch-d", sourceId: "a", targetId: "d" },
    ],
  });
  const routes = bezierRouting.route(graph, {
    policy: {
      curve: { kind: "bezier" },
      sourceTangent: { kind: "border-normal" },
      targetTangent: { kind: "border-normal" },
    },
    edges: Object.fromEntries(
      graph.edges.map((edge) => [edge.id, { sourceSides: ["right"], targetSides: ["right"] }]),
    ),
  }).routes;
  for (const route of routes.values()) expect(route.status).toBe("routed");
  for (const id of ["edge", "branch-d"]) {
    const path = routes.get(id)!.sections[0]!.path;
    expect(Math.abs(getPointAtLength(path, 100).y - path.start.y)).toBeLessThan(8);
  }
  const first = flattenPath(routes.get("edge")!.sections[0]!.path, { tolerance: 0.01 });
  const second = flattenPath(routes.get("branch-c")!.sections[0]!.path, { tolerance: 0.01 });
  for (const point of first)
    for (let i = 1; i < second.length; i++) {
      const a = second[i - 1]!,
        b = second[i]!;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const t = Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)),
      );
      expect(Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy)).toBeGreaterThan(6);
    }
});
