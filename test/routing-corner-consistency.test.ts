import { createGraph, getDiff } from "@statelyai/graph";
import { expect, it } from "vitest";
import { routeEdges, updateRoutes, type RoutingSettings } from "../src/routing";
const boxes = [
  ["source", 80, 140, 93.203125, 45],
  ["blocker", 374, 304, 98.859375, 45],
  ["target", 95, 374, 84.359375, 45],
  ["n1", 144, 215, 124.90625, 45],
  ["n2", 284, 131, 129.578125, 45],
  ["n3", 85, 277, 129.828125, 45],
  ["n4", 335, 374, 130.4375, 45],
] as const;
const graph = createGraph({
  nodes: boxes.map(([id, x, y, width, height]) => ({ id, x, y, width, height })),
  edges: [
    {
      id: "edge",
      sourceId: "source",
      targetId: "target",
      x: 137,
      y: 492,
      width: 52.09375,
      height: 28,
    },
  ],
});
const settings: RoutingSettings = {
  coordinateSpace: "world",
  clearance: 8,
  crossingPenalty: 0,
  overlapPenalty: 8,
  policy: {
    curve: { kind: "rounded-orthogonal", radius: 10 },
    sourceTangent: { kind: "border-normal" },
    targetTangent: { kind: "border-normal" },
    label: { kind: "gap", attachment: "side-midpoint", tangent: { kind: "border-normal" } },
    stability: { kind: "preserve-valid" },
    collisions: { nodes: "avoid", labels: "avoid" },
  },
  edges: { edge: { targetClearance: 10 } },
};
it("fits rounded corners on both label legs in a narrow orthogonal corridor", () => {
  const snapshot = routeEdges({ graph, settings });
  const route = snapshot.routes.get("edge")!;
  expect(route.status).toBe("routed");
  expect(route.sections).toHaveLength(2);
  for (const section of route.sections)
    expect(section.path.segments.some((segment) => segment.kind === "arc")).toBe(true);
});

it("applies per-edge radius bounds without changing fixed label geometry", () => {
  const snapshot = routeEdges({
    graph,
    settings: {
      ...settings,
      edges: {
        edge: {
          ...settings.edges?.edge,
          policy: { curve: { kind: "rounded-orthogonal", radius: 40, minRadius: 0, maxRadius: 2 } },
        },
      },
    },
  });
  const route = snapshot.routes.get("edge")!;
  expect(route.status).toBe("routed");
  const arcs = route.sections.flatMap((s) => s.path.segments).filter((s) => s.kind === "arc");
  expect(arcs.length).toBeGreaterThan(0);
  for (const arc of arcs) expect(arc.rx).toBeLessThanOrEqual(2);
  expect(graph.edges[0]).toMatchObject({ x: 137, y: 492 });
});

it("uses a whole-edge sharp fallback when the requested minimum cannot fit", () => {
  const input = createGraph({
    nodes: [
      { id: "a", x: 0, y: 0, width: 40, height: 40, ports: [{ name: "out", x: 40, y: 20 }] },
      { id: "b", x: 300, y: 100, width: 40, height: 40 },
    ],
    edges: [
      {
        id: "ab",
        sourceId: "a",
        sourcePort: "out",
        targetId: "b",
        x: 60,
        y: 5,
        width: 10,
        height: 10,
      },
    ],
  });
  const snapshot = routeEdges({
    graph: input,
    settings: {
      ...settings,
      policy: {
        ...settings.policy,
        curve: { kind: "rounded-orthogonal", radius: 20, minRadius: 20, maxRadius: 20 },
      },
      edges: { ab: { sourceSides: ["right"], labelSides: ["left", "right"] } },
    },
  });
  const route = snapshot.routes.get("ab")!;
  expect(route.status).toBe("fallback");
  expect(route.diagnostics.some((d) => d.constraint === "curve")).toBe(true);
  expect(route.sections).toHaveLength(2);
  for (const section of route.sections)
    expect(section.path.segments.every((s) => s.kind === "line")).toBe(true);
});

it("preserves an exact waypoint coinciding with a terminal lead", () => {
  const input = createGraph({
    nodes: [
      { id: "a", x: 0, y: 0, width: 40, height: 40 },
      { id: "b", x: 300, y: 100, width: 40, height: 40 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
  });
  const waypoint = { x: 60, y: 20 };
  const route = routeEdges({
    graph: input,
    settings: {
      policy: { curve: { kind: "rounded-orthogonal", radius: 10 } },
      edges: { ab: { waypoints: [waypoint], sourceSides: ["right"], targetSides: ["left"] } },
    },
  }).routes.get("ab")!;
  expect(route.status).toBe("routed");
  expect(
    route.sections.flatMap((s) => [s.path.start, ...s.path.segments.map((p) => p.to)]),
  ).toContainEqual(waypoint);
});

it.each([0, 2, 10])(
  "retains one corner style during label dragging with radius cap %s",
  (maxRadius) => {
    const configured: RoutingSettings = {
      ...settings,
      policy: {
        ...settings.policy,
        curve: { kind: "rounded-orthogonal", radius: 40, minRadius: 0, maxRadius },
      },
    };
    let previous = routeEdges({ graph, settings: configured });
    let oldGraph = graph;
    for (const y of [460, 492]) {
      const next = { ...graph, edges: graph.edges.map((edge) => ({ ...edge, y })) };
      const updated = updateRoutes({
        previous,
        graph: next,
        changes: getDiff(oldGraph, next),
      }).snapshot;
      const route = updated.routes.get("edge")!;
      expect(route.status).toBe("routed");
      expect(updated.metrics.searchNodes).toBeLessThanOrEqual(4000);
      for (const section of route.sections) {
        const arcs = section.path.segments.filter((s) => s.kind === "arc");
        if (maxRadius) expect(arcs.length).toBeGreaterThan(0);
        else expect(arcs).toHaveLength(0);
        for (const arc of arcs) expect(arc.rx).toBeLessThanOrEqual(maxRadius);
      }
      const end = route.sections.at(-1)!.path;
      const last = end.segments.at(-1)!;
      expect(last.kind).toBe("line");
      expect(last.to.x).toBeCloseTo(137.1796875);
      expect(end.segments.at(-2)!.to.y).toBeGreaterThan(last.to.y);
      previous = updated;
      oldGraph = next;
    }
  },
);
