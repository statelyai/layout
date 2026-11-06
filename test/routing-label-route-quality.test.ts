import { createGraph, getDiff } from "@statelyai/graph";
import { expect, it } from "vitest";
import {
  routeEdges,
  flattenPath,
  updateRoutes,
  refineRoutes,
  getPathLength,
  type RoutingSettings,
  type Route,
} from "../src/routing";
import { pathHasSelfIntersection } from "../src/routing/policy-geometry";
const settings: RoutingSettings = {
  coordinateSpace: "world",
  clearance: 8,
  crossingPenalty: 0,
  overlapPenalty: 8,
  coordination: { kind: "independent" },
  policy: {
    path: { kind: "rounded-orthogonal", radius: 10 },
    sourceTangent: { kind: "border-normal" },
    targetTangent: { kind: "border-normal" },
    label: { kind: "gap", tangent: { kind: "border-normal" } },
    stability: { kind: "preserve-valid" },
  },
};
function wholePath(route: Route) {
  const [first, ...rest] = route.sections;
  return {
    start: first!.path.start,
    segments: [
      ...first!.path.segments,
      ...rest.flatMap((s) => [{ kind: "line" as const, to: s.path.start }, ...s.path.segments]),
    ],
  };
}
it.each([
  { sides: ["top", "bottom", "left", "right"], transform: "identity" },
  { sides: ["top", "bottom", "left", "right"], transform: "rotate" },
  { sides: ["top", "bottom", "left", "right"], transform: "mirror" },
  { sides: ["right", "left", "bottom", "top"], transform: "identity" },
] as const)(
  "routes around a blocker through a fixed label without a crossing ($sides, $transform)",
  ({ sides, transform }) => {
    const original = createGraph({
      nodes: [
        { id: "s", x: 0, y: 0, width: 93, height: 45 },
        { id: "b", x: 158, y: 151, width: 99, height: 45 },
        { id: "t", x: 110, y: 257, width: 84, height: 45 },
      ],
      edges: [{ id: "e", sourceId: "s", targetId: "t", x: 338, y: 106, width: 52, height: 28 }],
    });
    const transformBounds = (rect: { x?: number; y?: number; width?: number; height?: number }) =>
      transform === "rotate"
        ? { x: -rect.y! - rect.height!, y: rect.x!, width: rect.height!, height: rect.width! }
        : transform === "mirror"
          ? { x: -rect.x! - rect.width!, y: rect.y!, width: rect.width!, height: rect.height! }
          : rect;
    const graph = createGraph({
      ...original,
      nodes: original.nodes.map((n) => ({ ...n, ...transformBounds(n) })),
      edges: original.edges.map((e) => ({ ...e, ...transformBounds(e) })),
    });
    const route = routeEdges({
      graph,
      settings: {
        ...settings,
        edges: {
          e: { sourceSides: sides, targetSides: sides, labelSides: sides, targetClearance: 10 },
        },
      },
    }).routes.get("e")!;
    expect(route.status).toBe("routed");
    expect(pathHasSelfIntersection(wholePath(route))).toBe(false);
    expect(
      route.sections.flatMap((s) => s.path.segments).filter((s) => s.kind === "arc").length,
    ).toBeLessThanOrEqual(3);
    expect(route.sections.reduce((n, s) => n + getPathLength(s.path), 0)).toBeLessThan(660);
  },
);
it("uses two direct stems for a parent self-loop with a label just below its boundary", () => {
  const graph = createGraph({
    nodes: [{ id: "parent", x: 140, y: 240, width: 466.1484375, height: 575 }],
    edges: [
      {
        id: "loop",
        sourceId: "parent",
        targetId: "parent",
        x: 300,
        y: 850,
        width: 87.546875,
        height: 28,
      },
    ],
  });
  const route = routeEdges({
    graph,
    settings: { ...settings, edges: { loop: { targetClearance: 10 } } },
  }).routes.get("loop")!;
  expect(route.status).toBe("routed");
  expect(route.sections).toHaveLength(2);
  expect(pathHasSelfIntersection(wholePath(route))).toBe(false);
  for (const section of route.sections) {
    expect(section.path.segments).toHaveLength(1);
    expect(section.path.start.x).toBeCloseTo(section.path.segments[0]!.to.x);
  }
});

it("keeps parent self-loop stems readable after a label drag and commit", () => {
  const graph = createGraph({
    nodes: [{ id: "p", x: 140, y: 240, width: 466.1484375, height: 575 }],
    edges: [
      { id: "loop", sourceId: "p", targetId: "p", x: 300, y: 850, width: 87.546875, height: 28 },
    ],
  });
  const previous = routeEdges({ graph, settings });
  const moved = createGraph({ ...graph, edges: graph.edges.map((e) => ({ ...e, x: e.x! + 24 })) });
  const updated = updateRoutes({ previous, graph: moved, changes: getDiff(graph, moved) }).snapshot;
  for (const snapshot of [updated, refineRoutes({ previous: updated }).snapshot]) {
    const route = snapshot.routes.get("loop")!;
    expect(route.status).toBe("routed");
    expect(pathHasSelfIntersection(wholePath(route))).toBe(false);
    expect(route.sections.every((s) => s.path.segments.length === 1)).toBe(true);
  }
});

it("fits offset opposing leads into a narrow node-to-label gap", () => {
  const graph = createGraph({
    nodes: [{ id: "node", x: 0, y: 0, width: 100, height: 60 }],
    edges: [
      { id: "edge", sourceId: "node", targetId: "node", x: 130, y: 50, width: 80, height: 28 },
    ],
  });
  const route = routeEdges({
    graph,
    settings: {
      ...settings,
      edges: {
        edge: { sourceSide: "right", labelSides: ["left"], topology: { kind: "label-only" } },
      },
    },
  }).routes.get("edge")!;
  expect(route.status).toBe("routed");
  const points = flattenPath(route.sections[0]!.path);
  for (let i = 1; i < points.length; i++) {
    expect(points[i]!.x).toBeGreaterThanOrEqual(points[i - 1]!.x - 1e-7);
    expect(points[i]!.y).toBeGreaterThanOrEqual(points[i - 1]!.y - 1e-7);
  }
});

it("keeps a newly derived label face pair when an old border point remains on the moved label", () => {
  const graph = createGraph({
    nodes: [
      { id: "source", x: 0, y: 0, width: 100, height: 60 },
      { id: "target", x: 400, y: 0, width: 100, height: 60 },
    ],
    edges: [
      {
        id: "edge",
        sourceId: "source",
        targetId: "target",
        x: 250,
        y: 1000,
        width: 500,
        height: 30,
      },
    ],
  });
  const previous = routeEdges({ graph, settings });
  expect(previous.routes.get("edge")!.sections[0]!.toSide).toBe("top");
  const moved = createGraph({ ...graph, edges: graph.edges.map((edge) => ({ ...edge, x: 150 })) });
  const route = updateRoutes({
    previous,
    graph: moved,
    changes: getDiff(graph, moved),
  }).snapshot.routes.get("edge")!;
  expect(route.status).toBe("routed");
  expect(route.sections[0]!.toSide).toBe("left");
  expect(route.sections.at(-1)!.fromSide).toBe("right");
});
