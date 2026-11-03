import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { getPathLength, orthogonalRouting, segmentCrossesRect } from "../src/routing";
import { getUntrimmedRoute } from "../src/routing/route-cache";
import type {
  Route,
  RouteBounds,
  RoutingPolicy,
  RoutingSettings,
  EdgeRoutingSettings,
} from "../src/routing/types";
import sourceOverlap from "./fixtures/viz-routing-source-label-overlap.json";
import labelOverlap from "./fixtures/viz-routing-overlapping-labels.json";
import parallelFixture from "./fixtures/viz-routing-parallel.json";

const policy = {
  curve: { kind: "rounded-orthogonal", radius: 8 },
  sourceTangent: { kind: "border-normal" },
  targetTangent: { kind: "border-normal" },
  label: { kind: "gap", tangent: { kind: "border-normal" } },
} satisfies RoutingPolicy;

it("keeps parallel lane planning from rejecting feasible fixed-geometry connections", () => {
  const graph = createGraph({ ...parallelFixture.graph, mode: "directed" });
  const settings: RoutingSettings = {
    coordinateSpace: "world",
    crossingPenalty: 0,
    overlapPenalty: 0,
    policy,
    coordination: { kind: "parallel" },
    edges: Object.fromEntries(
      Object.entries(parallelFixture.settings.edges).map(([id, value]) => {
        const config: EdgeRoutingSettings = {
          ...value,
          sourceClearance: 5,
          targetClearance: 10,
          geometry: "orthogonal",
          topology: { kind: "connection" },
          policy: { curve: { kind: "rounded-orthogonal", radius: 10 } },
        };
        return [id, config];
      }),
    ),
  };
  const result = orthogonalRouting.route(graph, settings);
  let independentRetries = 0;
  for (const route of result.routes.values()) {
    expect(route.sections.length).toBeGreaterThan(0);
    expect(route.diagnostics.some((diagnostic) => diagnostic.code === "MISSING_GEOMETRY")).toBe(
      false,
    );
    if (route.diagnostics.some((diagnostic) => diagnostic.constraint === "coordination")) {
      independentRetries++;
      const untrimmed = getUntrimmedRoute(route)!;
      expect(
        getPathLength(untrimmed.sections[0]!.path) - getPathLength(route.sections[0]!.path),
      ).toBeCloseTo(5, 7);
      expect(
        getPathLength(untrimmed.sections.at(-1)!.path) - getPathLength(route.sections.at(-1)!.path),
      ).toBeCloseTo(10, 7);
    }
  }
  expect(independentRetries).toBeGreaterThan(0);
});
const labelPositions = [
  { side: "top", label: { x: 10, y: -100, width: 80, height: 30 } },
  { side: "right", label: { x: 160, y: 15, width: 80, height: 30 } },
  { side: "bottom", label: { x: 10, y: 130, width: 80, height: 30 } },
  { side: "left", label: { x: -160, y: 15, width: 80, height: 30 } },
];

function avoids(route: Route, bounds: RouteBounds) {
  for (const section of route.sections) {
    let from = section.path.start;
    for (const segment of section.path.segments) {
      expect(segmentCrossesRect(from, segment, bounds)).toBe(false);
      from = segment.to;
    }
  }
}

it.each([sourceOverlap, labelOverlap])(
  "routes exposed faces of overlapping fixed labels in $id",
  (fixture) => {
    const graph = createGraph({
      id: fixture.id,
      nodes: fixture.nodes.map(({ id, parentId, x, y, width, height }) => ({
        id,
        parentId,
        x,
        y,
        width,
        height,
      })),
      edges: fixture.edges.map(({ id, sourceId, targetId, x, y, width, height }) => ({
        id,
        sourceId,
        targetId,
        x,
        y,
        width,
        height,
      })),
    });
    const settings: RoutingSettings = {
      coordinateSpace: "world",
      coordination: { kind: "independent" },
      policy,
      edges: Object.fromEntries(
        graph.edges.map((edge) => [edge.id, { sourceClearance: 0, targetClearance: 10 }]),
      ),
    };
    const result = orthogonalRouting.route(graph, settings);
    for (const route of result.routes.values()) {
      expect(route.status).toBe("routed");
      expect(route.sections).toHaveLength(2);
      for (const node of fixture.nodes) avoids(route, node);
      for (const label of fixture.edges) if (label.id !== route.edgeId) avoids(route, label);
    }
  },
);

it.each(labelPositions)(
  "routes a labeled self-loop through distinct attachments on its $side face",
  ({ side, label }) => {
    const node = { id: "a", x: 0, y: 0, width: 100, height: 60 };
    const graph = createGraph({
      nodes: [node],
      edges: [{ id: "loop", sourceId: "a", targetId: "a", ...label }],
    });
    const route = orthogonalRouting.route(graph, { policy }).routes.get("loop")!;
    expect(route.status).toBe("routed");
    expect(route.sections).toHaveLength(2);
    expect(route.sections[0]!.fromSide).toBe(side);
    expect(route.sections[1]!.toSide).toBe(side);
    expect(route.sections[0]!.path.start).not.toEqual(route.sections[1]!.path.segments.at(-1)!.to);
    avoids(route, node);
    avoids(route, label);
  },
);

it.each(labelPositions)(
  "routes label-only topology through its label-facing $side face",
  ({ side, label }) => {
    const node = { id: "a", x: 0, y: 0, width: 100, height: 60 };
    const graph = createGraph({
      nodes: [node],
      edges: [{ id: "notice", sourceId: "a", targetId: "a", ...label }],
    });
    const route = orthogonalRouting
      .route(graph, { policy, edges: { notice: { topology: { kind: "label-only" } } } })
      .routes.get("notice")!;
    expect(route.status).toBe("routed");
    expect(route.sections).toHaveLength(1);
    expect(route.sections[0]!.fromSide).toBe(side);
    expect(route.sections[0]!.to).toEqual({ kind: "label", edgeId: "notice" });
    avoids(route, node);
    avoids(route, label);
  },
);

it("retains explicit self-loop attachment rules when its label faces another side", () => {
  const graph = createGraph({
    nodes: [{ id: "a", x: 0, y: 0, width: 100, height: 60 }],
    edges: [{ id: "loop", sourceId: "a", targetId: "a", x: 10, y: -100, width: 80, height: 30 }],
  });
  const route = orthogonalRouting
    .route(graph, { policy, selfLoops: { sourceSide: "left", targetSide: "bottom" } })
    .routes.get("loop")!;
  expect(route.status).toBe("routed");
  expect(route.sections[0]!.fromSide).toBe("left");
  expect(route.sections[1]!.toSide).toBe("bottom");
});
