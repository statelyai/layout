import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { bezierRouting, getPathLength } from "../src/routing";
import { pathEndpointTangent } from "../src/routing/policy-geometry";
it.each([false, true])("keeps obstacle guide joins smooth with fixed ports %s", (fixed) => {
  const graph = createGraph({
    id: "smooth-ports",
    nodes: [
      { id: "a", x: 35, y: 145, width: 72, height: 48, ports: [{ name: "out", x: 72, y: 12 }] },
      { id: "b", x: 475, y: 90, width: 72, height: 48, ports: [{ name: "in", x: 0, y: 36 }] },
      { id: "obstacle", x: 255, y: 75, width: 76, height: 180 },
    ],
    edges: [
      {
        id: "edge",
        sourceId: "a",
        targetId: "b",
        ...(fixed ? { sourcePort: "out", targetPort: "in" } : {}),
      },
    ],
  });
  const route = bezierRouting
    .route(graph, {
      policy: {
        curve: { kind: "bezier" },
        sourceTangent: { kind: "border-normal" },
        targetTangent: { kind: "border-normal" },
      },
    })
    .routes.get("edge")!;
  expect(route.status).toBe("routed");
  const path = route.sections[0]!.path;
  if (!fixed) expect(getPathLength(path)).toBeLessThan(500);
  for (let i = 1; i < path.segments.length; i++) {
    const previous = {
      start: i > 1 ? path.segments[i - 2]!.to : path.start,
      segments: [path.segments[i - 1]!],
    };
    const next = { start: path.segments[i - 1]!.to, segments: [path.segments[i]!] };
    const incoming = pathEndpointTangent(previous, "end"),
      outgoing = pathEndpointTangent(next, "start");
    expect(incoming.x * outgoing.x + incoming.y * outgoing.y).toBeGreaterThan(0.999);
  }
});
