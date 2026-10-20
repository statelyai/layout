import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { routingStrategies } from "../src/routing";
import { pathReverseTravel } from "../src/routing/policy-geometry";

const graph = createGraph({
  id: "monotone-reservation-corridor",
  nodes: [
    { id: "node-0", x: 33, y: 39, width: 63, height: 53 },
    { id: "node-1", x: 255, y: 55, width: 59, height: 50 },
    { id: "node-2", x: 476, y: 7, width: 73, height: 37 },
    { id: "node-3", x: 4, y: 245, width: 56, height: 42 },
    { id: "node-4", x: 255, y: 228, width: 55, height: 44 },
    { id: "node-5", x: 461, y: 229, width: 65, height: 55 },
  ],
  edges: [
    { id: "edge-a", sourceId: "node-0", targetId: "node-5" },
    { id: "edge-b", sourceId: "node-0", targetId: "node-2" },
    { id: "edge-c", sourceId: "node-3", targetId: "node-2" },
    { id: "edge-d", sourceId: "node-1", targetId: "node-4" },
  ],
});
it.each(["fan", "bus", "bundle"] as const)(
  "%s finds a feasible monotone corridor despite soft reservations",
  (name) => {
    const route = routingStrategies[name]
      .route(graph, {
        policy: {
          curve: { kind: "rounded-orthogonal", radius: 18 },
          monotonic: { axis: "x", strength: "require" },
        },
        maxSearchNodes: 8000,
      })
      .routes.get("edge-c")!;
    expect(route.status).toBe("routed");
    expect(route.sections.length).toBeGreaterThan(0);
    const start = route.sections[0]!.path.start;
    const end = route.sections.at(-1)!.path.segments.at(-1)!.to;
    for (const { path } of route.sections)
      expect(pathReverseTravel(path, "x", start, end)).toBeLessThan(1e-7);
    expect(
      route.sections.flatMap((s) => s.path.segments).some((s) => s.kind === "arc" && s.rx === 18),
    ).toBe(true);
  },
);

it("uses the selected automatic faces for monotonic direction while locking an equal axis", () => {
  const input = createGraph({
    id: "equal-axis-obstacle",
    nodes: [
      { id: "a", x: 0, y: 0, width: 100, height: 60 },
      { id: "b", x: 0, y: 180, width: 100, height: 60 },
      { id: "obstacle", x: 30, y: 90, width: 40, height: 40 },
    ],
    edges: [{ id: "edge", sourceId: "a", targetId: "b" }],
  });
  const policy = {
    curve: { kind: "bezier" as const },
    monotonic: { axis: "x" as const, strength: "require" as const },
  };
  const locked = routingStrategies.bezier
    .route(input, {
      policy,
      edges: { edge: { sourceSides: ["bottom"], targetSides: ["top"] } },
    })
    .routes.get("edge")!;
  expect(locked.sections).toEqual([]);
  const automatic = routingStrategies.bezier.route(input, { policy }).routes.get("edge")!;
  expect(automatic.sections.length).toBeGreaterThan(0);
  const path = automatic.sections[0]!.path;
  expect(pathReverseTravel(path, "x", path.start, path.segments.at(-1)!.to)).toBeLessThan(1e-7);
});
