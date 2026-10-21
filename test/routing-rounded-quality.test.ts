import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { orthogonalRouting } from "../src/routing";
import { pathEndpointTangent } from "../src/routing/policy-geometry";

it.each([14, 22])("leaves room for radius %s at terminal corners", (radius) => {
  const graph = createGraph({
    id: "rounded-terminal-room",
    nodes: [
      { id: "a", x: 35, y: 65, width: 64, height: 44 },
      { id: "b", x: 435, y: 220, width: 64, height: 44 },
      { id: "obstacle", x: 245, y: 110, width: 80, height: 125 },
    ],
    edges: [{ id: "edge", sourceId: "a", targetId: "b" }],
  });
  const route = orthogonalRouting
    .route(graph, {
      policy: {
        curve: { kind: "rounded-orthogonal", radius },
        sourceTangent: { kind: "border-normal" },
        targetTangent: { kind: "border-normal" },
      },
    })
    .routes.get("edge")!;
  expect(route.status).toBe("routed");
  const path = route.sections[0]!.path;
  const arcs = path.segments.filter((s) => s.kind === "arc");
  expect(arcs.length).toBeGreaterThan(0);
  for (const arc of arcs) expect(arc.rx).toBeCloseTo(radius);
  expect(pathEndpointTangent(path, "start").x).toBeCloseTo(1);
  expect(pathEndpointTangent(path, "end").x).toBeCloseTo(1);
});
