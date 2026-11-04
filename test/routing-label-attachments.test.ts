import { createGraph, getDiff } from "@statelyai/graph";
import { expect, it } from "vitest";
import {
  routeEdges,
  updateRoutes,
  refineRoutes,
  type RoutingSettings,
  type Route,
  type RouteBounds,
} from "../src/routing";
import { anchor, rect } from "../src/routing/model";

const graph = createGraph({
  nodes: [
    { id: "s", x: 0, y: 0, width: 100, height: 60 },
    { id: "t", x: 400, y: 80, width: 100, height: 60 },
  ],
  edges: [{ id: "e", sourceId: "s", targetId: "t", x: 200, y: 0, width: 80, height: 40 }],
});
function labelsFor(value: typeof graph) {
  return new Map(value.edges.map((e) => [e.id, rect(e)!]));
}
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
        curve: { kind },
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
