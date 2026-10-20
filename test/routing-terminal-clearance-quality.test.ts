import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { bezierRouting, flattenPath } from "../src/routing";
it("keeps inferred return corners clear of outward-facing terminal borders", () => {
  const graph = createGraph({
    id: "opposing-faces",
    nodes: [
      { id: "a", x: 105, y: 120, width: 72, height: 48 },
      { id: "b", x: 435, y: 120, width: 72, height: 48 },
    ],
    edges: [{ id: "edge", sourceId: "a", targetId: "b" }],
  });
  const route = bezierRouting
    .route(graph, {
      policy: {
        curve: { kind: "bezier" },
        sourceTangent: { kind: "border-normal" },
        targetTangent: { kind: "border-normal" },
      },
      edges: { edge: { sourceSide: "left", targetSide: "right" } },
    })
    .routes.get("edge")!;
  expect(route.status).toBe("routed");
  const path = route.sections[0]!.path;
  const ends = [path.start, path.segments.at(-1)!.to];
  for (const point of flattenPath(path, { tolerance: 0.02 }))
    for (const [i, node] of graph.nodes.entries()) {
      const endpoint = ends[i]!;
      if (Math.abs(point.x - endpoint.x) < 16 && Math.abs(point.y - endpoint.y) < 16) continue;
      const dx = Math.max(node.x! - point.x, 0, point.x - node.x! - node.width!);
      const dy = Math.max(node.y! - point.y, 0, point.y - node.y! - node.height!);
      expect(Math.hypot(dx, dy)).toBeGreaterThan(6);
    }
});
