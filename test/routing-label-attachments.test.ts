import { createGraph, getDiff } from "@statelyai/graph";
import { expect, it } from "vitest";
import {
  routeEdges,
  updateRoutes,
  refineRoutes,
  segmentCrossesRect,
  type RoutingSettings,
  type Route,
  type RouteBounds,
} from "../src/routing";
import { anchor, rect } from "../src/routing/model";
import { pathReverseTravel } from "../src/routing/policy-geometry";

const graph = createGraph({
  nodes: [
    { id: "s", x: 0, y: 0, width: 100, height: 60 },
    { id: "t", x: 400, y: 80, width: 100, height: 60 },
  ],
  edges: [{ id: "e", sourceId: "s", targetId: "t", x: 200, y: 0, width: 80, height: 40 }],
});

it("aligns a straight targetless endpoint with an off-center label midpoint", () => {
  const graph = createGraph({
    nodes: [{ id: "p", x: 100, y: 100, width: 500, height: 400 }],
    edges: [{ id: "e", sourceId: "p", targetId: "p", x: 300, y: 0, width: 80, height: 40 }],
  });
  const route = routeEdges({
    graph,
    settings: {
      policy: {
        path: { kind: "polyline", geometry: "straight" },
        sourceTangent: { kind: "border-normal" },
        label: { kind: "gap", attachment: "side-midpoint", tangent: { kind: "border-normal" } },
      },
      edges: { e: { topology: { kind: "label-only" } } },
    },
  }).routes.get("e")!;
  midpoints(route, labelsFor(graph));
  expect(route.sections[0]!.path.start).toEqual({ x: 340, y: 100 });
});

it("keeps midpoint connections clear of interiors when fixed labels overlap", () => {
  const graph = createGraph({
    nodes: [
      { id: "a", x: 0, y: 0, width: 120, height: 80 },
      { id: "b", x: 320, y: 0, width: 120, height: 80 },
      { id: "c", x: 0, y: 260, width: 120, height: 80 },
      { id: "d", x: 320, y: 260, width: 120, height: 80 },
    ],
    edges: [
      { id: "AB", sourceId: "a", targetId: "b", x: 140, y: 20, width: 80, height: 40 },
      { id: "CD", sourceId: "c", targetId: "d", x: 140, y: 280, width: 80, height: 40 },
      { id: "AD", sourceId: "a", targetId: "d", x: 150, y: 140, width: 80, height: 40 },
      { id: "CB", sourceId: "c", targetId: "b", x: 170, y: 140, width: 80, height: 40 },
    ],
  });
  const snapshot = routeEdges({
    graph,
    settings: {
      crossingPenalty: 0,
      policy: {
        path: { kind: "rounded-orthogonal" },
        label: { kind: "gap", attachment: "side-midpoint", tangent: { kind: "border-normal" } },
      },
    },
  });
  for (const route of snapshot.routes.values()) {
    midpoints(route, labelsFor(graph));
    for (const section of route.sections) {
      let from = section.path.start;
      for (const segment of section.path.segments) {
        for (const obstacle of [
          ...graph.nodes,
          ...graph.edges.filter((edge) => edge.id !== route.edgeId),
        ])
          expect(segmentCrossesRect(from, segment, rect(obstacle)!)).toBe(false);
        from = segment.to;
      }
    }
  }
});
function labelsFor(value: typeof graph) {
  return new Map(value.edges.map((e) => [e.id, rect(e)!]));
}

it.each(["rounded-orthogonal", "polyline", "bezier", "catmull-rom"] as const)(
  "keeps a parent %s loop attached at label midpoints",
  (kind) => {
    const graph = createGraph({
      nodes: [{ id: "p", x: 140, y: 240, width: 466.1484375, height: 575 }],
      edges: [
        { id: "e", sourceId: "p", targetId: "p", x: 300, y: 850, width: 87.546875, height: 28 },
      ],
    });
    const route = routeEdges({
      graph,
      settings: {
        policy: {
          path: { kind },
          sourceTangent: { kind: "border-normal" },
          targetTangent: { kind: "border-normal" },
          label: { kind: "gap", attachment: "side-midpoint", tangent: { kind: "border-normal" } },
        },
      },
    }).routes.get("e")!;
    midpoints(route, labelsFor(graph));
    for (const { path } of route.sections) {
      if (kind === "rounded-orthogonal") {
        expect(pathReverseTravel(path, "both", path.start, path.segments.at(-1)!.to)).toBeLessThan(
          1e-7,
        );
        expect(path.segments.filter((segment) => segment.kind === "arc")).toHaveLength(1);
      }
    }
  },
);
function midpoints(route: Route, labels: ReadonlyMap<string, RouteBounds>) {
  expect(route.status, JSON.stringify({ id: route.edgeId, diagnostics: route.diagnostics })).toBe(
    "routed",
  );
  expect(
    route.sections.length,
    JSON.stringify({ id: route.edgeId, diagnostics: route.diagnostics }),
  ).toBeGreaterThan(0);
  for (const section of route.sections) {
    if (section.from.kind === "label")
      expect(section.path.start).toEqual(
        anchor(labels.get(section.from.edgeId)!, section.fromSide!),
      );
    if (section.to.kind === "label")
      expect(section.path.segments.at(-1)!.to).toEqual(
        anchor(labels.get(section.to.edgeId)!, section.toSide!),
      );
  }
}
it.each(["polyline", "bezier", "catmull-rom", "rounded-orthogonal"] as const)(
  "keeps %s label attachments at side midpoints through drag and commit",
  (kind) => {
    const settings: RoutingSettings = {
      policy: {
        path: { kind },
        label: { kind: "gap", attachment: "side-midpoint", tangent: { kind: "border-normal" } },
        stability: { kind: "preserve-valid" },
      },
    };
    const previous = routeEdges({ graph, settings });
    midpoints(previous.routes.get("e")!, labelsFor(graph));
    const moved = createGraph({
      ...graph,
      edges: graph.edges.map((e) => ({ ...e, y: 10, width: 120 })),
    });
    const updated = updateRoutes({
      previous,
      graph: moved,
      changes: getDiff(graph, moved),
    }).snapshot;
    for (const snapshot of [updated, refineRoutes({ previous: updated }).snapshot])
      midpoints(snapshot.routes.get("e")!, labelsFor(moved));
  },
);

it("rejects preserved off-midpoint hints when midpoint attachment is requested", () => {
  const settings: RoutingSettings = { policy: { stability: { kind: "preserve-valid" } } };
  const old = routeEdges({ graph, settings });
  const next = routeEdges({
    graph,
    settings: {
      policy: { ...settings.policy, label: { kind: "gap", attachment: "side-midpoint" } },
    },
    initialRoutes: old.routes,
  });
  midpoints(next.routes.get("e")!, labelsFor(graph));
});

it("uses side midpoints for parent labels in conditional chains and self-loops", () => {
  const chained = createGraph({
    ...graph,
    edges: [
      ...graph.edges,
      { id: "child", sourceId: "s", targetId: "t", x: 300, y: 200, width: 80, height: 40 },
      { id: "loop", sourceId: "s", targetId: "s", x: 140, y: 80, width: 80, height: 40 },
    ],
  });
  const snapshot = routeEdges({
    graph: chained,
    settings: {
      policy: {
        label: { kind: "gap", attachment: "side-midpoint", tangent: { kind: "border-normal" } },
        stability: { kind: "preserve-valid" },
      },
      edges: { child: { sourceLabel: "e" } },
    },
  });
  const labels = labelsFor(chained);
  for (const route of snapshot.routes.values()) midpoints(route, labels);
});
