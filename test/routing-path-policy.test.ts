import { createGraph, getDiff } from "@statelyai/graph";
import { expect, it } from "vitest";
import {
  routeEdges,
  updateRoutes,
  refineRoutes,
  type RoutingPathOptions,
  type RoutePatch,
  routingStrategies,
} from "../src/routing";
const graph = createGraph({
  nodes: [
    { id: "a", x: 0, y: 0, width: 40, height: 40 },
    { id: "b", x: 300, y: 180, width: 40, height: 40 },
  ],
  edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
});
it.each([
  { kind: "rounded-orthogonal", geometry: "polyline" },
  { kind: "bezier", geometry: "orthogonal" },
  { kind: "catmull-rom", geometry: "straight" },
  { kind: "polyline", radius: 10 },
  { kind: "bezier", minRadius: 2 },
  { kind: "catmull-rom", curvature: 0.5 },
])("rejects ignored options from untyped path configuration: %j", (invalid) => {
  expect(() =>
    routeEdges({ graph, settings: { policy: { path: JSON.parse(JSON.stringify(invalid)) } } }),
  ).toThrow(RangeError);
});
it.each(["orthogonal", "polyline", "octilinear", "straight"] as const)(
  "selects %s from the polyline path itself",
  (geometry) => {
    const snapshot = routeEdges({
      graph,
      settings: { policy: { path: { kind: "polyline", geometry } } },
    });
    expect(snapshot.strategy).toContain(geometry);
    expect(snapshot.routes.get("ab")!.sections.length).toBeGreaterThan(0);
  },
);
it.each([
  { geometry: "polyline" },
  { settings: { policy: { curve: { kind: "bezier" } } } },
  { settings: { edges: { ab: { geometry: "polyline" } } } },
])("rejects removed independent controls from JavaScript: %j", (legacy) => {
  expect(() => routeEdges({ ...JSON.parse(JSON.stringify(legacy)), graph })).toThrow(RangeError);
});

it.each([
  { kind: "bezier", geometry: undefined, radius: undefined },
  { kind: "catmull-rom", geometry: undefined, curvature: undefined },
  { kind: "rounded-orthogonal", geometry: undefined, curvature: undefined },
] satisfies RoutingPathOptions[])(
  "accepts omitted optional fields represented by undefined: %j",
  (path) => {
    expect(
      routeEdges({ graph, settings: { policy: { path } } }).routes.get("ab")!.sections.length,
    ).toBeGreaterThan(0);
  },
);
it("updates the snapshot strategy with the complete global path choice", () => {
  let previous = routeEdges({
    graph,
    settings: { policy: { path: { kind: "polyline", geometry: "orthogonal" } } },
  });
  for (const geometry of [
    "straight",
    "octilinear",
    "polyline",
    "orthogonal",
    "straight",
  ] as const) {
    const settings = { policy: { path: { kind: "polyline" as const, geometry } } };
    const update = updateRoutes({
      graph,
      previous,
      changes: getDiff(graph, graph),
      settings,
      scope: { kind: "selected", edgeIds: [] },
    });
    expect(update.base).toBe(previous);
    expect(update.snapshot.strategy).toBe(geometry);
    expect(update.snapshot.revision).toBe(previous.revision + 1);
    expect([...update.snapshot.routes]).toEqual([...routeEdges({ graph, settings }).routes]);
    const refined = refineRoutes({ previous: update.snapshot });
    expect(refined.snapshot.strategy).toBe(geometry);
    expect([...refined.snapshot.routes]).toEqual([...routeEdges({ graph, settings }).routes]);
    previous = update.snapshot;
  }
  const settings = { policy: { path: { kind: "bezier" as const } } };
  const update = updateRoutes({ graph, previous, changes: getDiff(graph, graph), settings });
  expect(update.snapshot.strategy).toBe("orthogonal");
  expect([...update.snapshot.routes]).toEqual([...routeEdges({ graph, settings }).routes]);
});

it("keeps removal patches and graph-diff validation during a strategy change", () => {
  const previous = routeEdges({ graph });
  const after = { ...graph, edges: [] };
  const settings = {
    policy: { path: { kind: "polyline" as const, geometry: "straight" as const } },
  };
  const update = updateRoutes({ graph: after, previous, changes: getDiff(graph, after), settings });
  expect(update.snapshot.strategy).toBe("straight");
  expect(update.snapshot.routes.size).toBe(0);
  expect(update.patches).toContainEqual({ op: "delete", edgeId: "ab" } satisfies RoutePatch);
  expect(() =>
    updateRoutes({
      graph: { ...graph, id: "other" },
      previous,
      changes: getDiff(graph, graph),
      settings,
    }),
  ).toThrow("different graph");
});

it.each(["parallel", "bezier", "curved", "organic", "fan", "bus", "bundle", "self-loop"] as const)(
  "keeps the named %s strategy when updating global path settings",
  (name) => {
    const settings = {
      coordination: { kind: "parallel" as const },
      policy: { path: { kind: "rounded-orthogonal" as const } },
    };
    const previous = routingStrategies[name].route(graph, settings);
    const update = updateRoutes({ graph, previous, changes: getDiff(graph, graph), settings });
    expect(update.snapshot.strategy).toBe(name);
    expect(update.snapshot.routes.get("ab")!.sections.length).toBeGreaterThan(0);
    expect([...update.snapshot.routes]).toEqual([
      ...routingStrategies[name].update(graph, previous, getDiff(graph, graph), settings).snapshot
        .routes,
    ]);
  },
);

it.each(["straight", "orthogonal", "polyline", "octilinear"] as const)(
  "resets %s geometry to defaults only when replacement settings are supplied",
  (geometry) => {
    const previous = routeEdges({
      graph,
      settings: { policy: { path: { kind: "polyline", geometry } } },
    });
    const inherited = updateRoutes({ graph, previous, changes: getDiff(graph, graph) });
    expect(inherited.snapshot.strategy).toBe(geometry);
    const reset = updateRoutes({ graph, previous, changes: getDiff(graph, graph), settings: {} });
    expect(reset.snapshot.strategy).toBe("orthogonal");
    expect([...reset.snapshot.routes]).toEqual([...routeEdges({ graph }).routes]);
  },
);
