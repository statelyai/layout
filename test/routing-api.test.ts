import { createGraph, getDiff } from "@statelyai/graph";
import { expect, it } from "vitest";
import { getLayeredLayout } from "../src";
import {
  routeEdges,
  updateRoutes,
  refineRoutes,
  getLayoutRouting,
  orthogonalRouting,
  pathFromPoints,
  routingPolicies,
  bezierRouting,
  splitPathAtBounds,
  pathFromSplinePoints,
  toSvgPath,
  getPathLength,
} from "../src/routing";
import { sparseRoutingFixture } from "../bench/routing-fixtures";

const graph = () =>
  createGraph({
    id: "api",
    nodes: [
      { id: "a", x: 0, y: 0, width: 40, height: 40 },
      { id: "b", x: 240, y: 0, width: 40, height: 40 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
  });

it("routes a provably shortest clear orthogonal elbow without expanding a visibility grid", () => {
  const input = graph();
  const positioned = {
    ...input,
    nodes: input.nodes.map((node) => (node.id === "b" ? { ...node, y: 80 } : node)),
  };
  const snapshot = routeEdges({ graph: positioned });
  const route = snapshot.routes.get("ab")!;
  expect(route.status).toBe("routed");
  expect(snapshot.metrics.searchNodes).toBe(0);
  expect(getPathLength(route.sections[0]!.path)).toBe(280);
});

it("updates with an object argument and retains prior values", () => {
  const before = graph(),
    previous = routeEdges({ graph: before });
  const after = {
    ...before,
    nodes: before.nodes.map((node) => (node.id === "b" ? { ...node, y: 20 } : node)),
  };
  const result = updateRoutes({ graph: after, previous, changes: getDiff(before, after) });
  expect(result.base).toBe(previous);
  expect(result.patches).toHaveLength(1);
  expect([...result.snapshot.routes]).toEqual([...routeEdges({ graph: after }).routes]);
  expect(previous.revision).toBe(0);
});

it("adopts valid corridors and refines explicitly without changing the default update contract", () => {
  const input = graph(),
    route = routeEdges({ graph: input }).routes.get("ab")!;
  const path = pathFromPoints([
    { x: 40, y: 20 },
    { x: 90, y: 20 },
    { x: 90, y: -60 },
    { x: 190, y: -60 },
    { x: 190, y: 20 },
    { x: 240, y: 20 },
  ]);
  const initialRoutes = new Map([
    ["ab", { ...route, sections: [{ ...route.sections[0]!, path }] }],
  ]);
  const previous = routeEdges({ graph: input, initialRoutes });
  expect(previous.routes.get("ab")!.sections[0]!.path).toEqual(path);
  const refined = refineRoutes({ previous });
  expect(refined.base).toBe(previous);
  expect(refined.snapshot.routes.get("ab")!.sections[0]!.path).not.toEqual(path);
  expect(previous.routes.get("ab")!.sections[0]!.path).toEqual(path);
});

it("adopts valid off-center floating attachments without inventing fixed ports", () => {
  const input = graph(),
    route = routeEdges({ graph: input }).routes.get("ab")!;
  const path = pathFromPoints([
    { x: 40, y: 8 },
    { x: 110, y: 8 },
    { x: 110, y: 32 },
    { x: 240, y: 32 },
  ]);
  const snapshot = routeEdges({
    graph: input,
    initialRoutes: new Map([["ab", { ...route, sections: [{ ...route.sections[0]!, path }] }]]),
  });
  expect(snapshot.routes.get("ab")!.sections[0]!.path).toEqual(path);
  expect(snapshot.routes.get("ab")!.sections[0]!.from).toEqual({ kind: "node", nodeId: "a" });
});

it("adopts a full native cubic split at its label without changing its controls", () => {
  const input = createGraph({
    nodes: [
      { id: "a", x: 0, y: 0, width: 110, height: 90 },
      { id: "b", x: 500, y: 30, width: 110, height: 90 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b", x: 240, y: 40, width: 120, height: 40 }],
  });
  const settings = {
    policy: {
      path: { kind: "bezier" as const },
      sourceTangent: { kind: "automatic" as const },
      targetTangent: { kind: "automatic" as const },
      label: { kind: "gap" as const, tangent: { kind: "automatic" as const } },
      stability: { kind: "preserve-valid" as const },
    },
  };
  const route = routeEdges({ graph: input, settings }).routes.get("ab")!;
  const split = splitPathAtBounds(
    pathFromSplinePoints([
      { x: 110, y: 45 },
      { x: 180, y: 45 },
      { x: 420, y: 75 },
      { x: 500, y: 75 },
    ]),
    { x: 240, y: 40, width: 120, height: 40 },
  )!;
  const initialRoutes = new Map([
    [
      "ab",
      {
        ...route,
        sections: route.sections.map((section, index) => ({
          ...section,
          path: index ? split.after : split.before,
        })),
      },
    ],
  ]);
  const adopted = routeEdges({ graph: input, settings, initialRoutes });
  expect(toSvgPath(adopted.routes.get("ab")!.sections[0]!.path)).toBe(toSvgPath(split.before));
});

it("rejects label-gap hints whose two legs retrace a distant trunk", () => {
  const input = createGraph({
    nodes: [
      { id: "a", x: 0, y: 0, width: 40, height: 40 },
      { id: "b", x: 240, y: 0, width: 40, height: 40 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b", x: 120, y: 0, width: 40, height: 40 }],
  });
  const settings = {
    policy: {
      path: { kind: "polyline" as const },
      label: { kind: "gap" as const, tangent: { kind: "border-normal" as const } },
      stability: { kind: "preserve-valid" as const },
    },
  };
  const route = routeEdges({ graph: input, settings }).routes.get("ab")!;
  const paths = [
    [
      { x: 40, y: 20 },
      { x: 60, y: 20 },
      { x: 60, y: -80 },
      { x: 100, y: -80 },
      { x: 100, y: 20 },
      { x: 120, y: 20 },
    ],
    [
      { x: 160, y: 20 },
      { x: 180, y: 20 },
      { x: 180, y: -80 },
      { x: 60, y: -80 },
      { x: 60, y: -100 },
      { x: 220, y: -100 },
      { x: 220, y: 20 },
      { x: 240, y: 20 },
    ],
  ].map(pathFromPoints);
  const hint = {
    ...route,
    sections: route.sections.map((section, index) => ({ ...section, path: paths[index]! })),
  };
  const adopted = routeEdges({ graph: input, settings, initialRoutes: new Map([["ab", hint]]) });
  expect(adopted.routes.get("ab")!.sections.map((section) => section.path)).not.toEqual(paths);
});

it("rejects invalid route hints rather than adopting a diagonal orthogonal path", () => {
  const input = graph(),
    route = routeEdges({ graph: input }).routes.get("ab")!;
  const path = pathFromPoints([
    { x: 40, y: 20 },
    { x: 120, y: -50 },
    { x: 240, y: 20 },
  ]);
  const snapshot = routeEdges({
    graph: input,
    initialRoutes: new Map([["ab", { ...route, sections: [{ ...route.sections[0]!, path }] }]]),
  });
  expect(snapshot.routes.get("ab")!.sections[0]!.path).not.toEqual(path);
});

it("rechecks hints against rounded geometry, curve families and section topology", () => {
  const input = graph(),
    route = routeEdges({ graph: input }).routes.get("ab")!;
  const diagonal = pathFromPoints([
    { x: 40, y: 20 },
    { x: 120, y: -50 },
    { x: 240, y: 20 },
  ]);
  const rounded = routeEdges({
    graph: input,
    settings: { policy: { path: { kind: "rounded-orthogonal", radius: 10 } } },
    initialRoutes: new Map([
      ["ab", { ...route, sections: [{ ...route.sections[0]!, path: diagonal }] }],
    ]),
  });
  expect(rounded.routes.get("ab")!.sections[0]!.path).not.toEqual(diagonal);
  const cubic = routeEdges({
    graph: input,
    settings: { policy: { path: { kind: "bezier" } } },
    initialRoutes: new Map([["ab", route]]),
  });
  expect(
    cubic.routes
      .get("ab")!
      .sections.some((section) =>
        section.path.segments.some((segment) => segment.kind === "cubic"),
      ),
  ).toBe(true);
  const wrongNode = {
    ...route,
    sections: [{ ...route.sections[0]!, from: { kind: "node" as const, nodeId: "wrong" } }],
  };
  const corrected = routeEdges({ graph: input, initialRoutes: new Map([["ab", wrongNode]]) });
  expect(corrected.routes.get("ab")!.sections[0]!.from).toMatchObject({ nodeId: "a" });
});

it("hands a replacement router's actual snapshot and world graph into manual editing", () => {
  const layout = getLayeredLayout(graph(), { routing: { strategy: orthogonalRouting } });
  const layoutNodes = structuredClone(layout.nodes);
  const routing = getLayoutRouting(layout)!;
  expect(routing).toBeDefined();
  expect(routing.snapshot.routes).toBe(layout.compoundRoutes);
  const after = {
    ...routing.graph,
    nodes: routing.graph.nodes.map((node) =>
      node.id === "b" ? { ...node, y: (node.y ?? 0) + 30 } : node,
    ),
  };
  const update = updateRoutes({
    previous: routing.snapshot,
    graph: after,
    changes: getDiff(routing.graph, after),
  });
  expect(update.snapshot.metrics.routedEdges).toBe(1);
  expect(layout.nodes).toEqual(layoutNodes);
  layout.nodes[0]!.x += 1;
  expect(getLayoutRouting(layout)).toBeUndefined();
});

it("keeps edge-only constraint updates local and equivalent to fresh routing", () => {
  const fixture = sparseRoutingFixture(1000, true);
  const previous = orthogonalRouting.route(fixture.graph, fixture.settings);
  const settings = {
    ...fixture.settings,
    edges: {
      ...fixture.settings.edges,
      edge500: { sourceSide: "bottom" as const, targetSide: "top" as const },
    },
  };
  const snapshot = orthogonalRouting.update(
    fixture.graph,
    previous,
    getDiff(fixture.graph, fixture.graph),
    settings,
  ).snapshot;
  expect(snapshot.metrics.routedEdges).toBe(1);
  expect(snapshot.routes.get("edge0")).toBe(previous.routes.get("edge0"));
  expect([...snapshot.routes]).toEqual([
    ...orthogonalRouting.route(fixture.graph, settings).routes,
  ]);
});

it("invalidates sibling attachments when a per-edge side changes", () => {
  const input = createGraph({
    nodes: [
      { id: "a", x: 0, y: 0, width: 80, height: 80 },
      { id: "b", x: 300, y: 0, width: 80, height: 80 },
      { id: "c", x: 300, y: 150, width: 80, height: 80 },
    ],
    edges: [
      { id: "e1", sourceId: "a", targetId: "b" },
      { id: "e2", sourceId: "a", targetId: "c" },
    ],
  });
  const previous = orthogonalRouting.route(input);
  const settings = { edges: { e2: { sourceSide: "bottom" as const } } };
  const update = orthogonalRouting.update(input, previous, getDiff(input, input), settings);
  expect([...update.snapshot.routes]).toEqual([...orthogonalRouting.route(input, settings).routes]);
});

it("reconsiders preserved loops when global clearance rules change", () => {
  const input = createGraph({
    nodes: [{ id: "a", x: 0, y: 0, width: 60, height: 60 }],
    edges: [{ id: "loop", sourceId: "a", targetId: "a" }],
  });
  const previous = routeEdges({
    graph: input,
    settings: { policy: { stability: { kind: "preserve-valid" } }, selfLoops: { clearance: 15 } },
  });
  const settings = {
    policy: { stability: { kind: "preserve-valid" as const } },
    selfLoops: { clearance: 60 },
  };
  const update = updateRoutes({ graph: input, previous, changes: getDiff(input, input), settings });
  expect([...update.snapshot.routes]).toEqual([...routeEdges({ graph: input, settings }).routes]);
});

it("preserves safe corridors when an obstacle leaves and repairs them when an obstacle enters", () => {
  const input = graph();
  const obstructed = {
    ...input,
    nodes: [
      ...input.nodes,
      { ...input.nodes[0]!, id: "obstacle", x: 110, y: -10, width: 40, height: 70 },
    ],
  };
  const settings = { policy: { stability: { kind: "preserve-valid" as const } } };
  const previous = routeEdges({ graph: obstructed, settings });
  const clear = {
    ...obstructed,
    nodes: obstructed.nodes.map((node) => (node.id === "obstacle" ? { ...node, y: 200 } : node)),
  };
  const preserved = updateRoutes({ previous, graph: clear, changes: getDiff(obstructed, clear) });
  expect(preserved.snapshot.routes.get("ab")).toBe(previous.routes.get("ab"));
  const canonical = refineRoutes({ previous: preserved.snapshot });
  expect(canonical.snapshot.routes.get("ab")).not.toBe(previous.routes.get("ab"));
  const repaired = updateRoutes({
    previous: canonical.snapshot,
    graph: obstructed,
    changes: getDiff(clear, obstructed),
  });
  expect(repaired.snapshot.routes.get("ab")).not.toBe(canonical.snapshot.routes.get("ab"));
  expect(repaired.snapshot.routes.get("ab")!.status).toBe("routed");
});

it("preserves hard-safe curve fallbacks without hiding their curve diagnostics", () => {
  const input = createGraph({
    nodes: [
      { id: "a", x: 0, y: 0, width: 40, height: 40 },
      { id: "b", x: 300, y: 100, width: 40, height: 40 },
      { id: "block", x: 100, y: 50, width: 80, height: 100 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
  });
  const settings = {
    policy: { ...routingPolicies.smooth, stability: { kind: "preserve-valid" as const } },
    edges: { ab: { waypoints: [{ x: 92, y: 42 }] } },
  };
  const previous = bezierRouting.route(input, settings);
  expect(previous.routes.get("ab")!.status).toBe("fallback");
  expect(
    previous.routes.get("ab")!.diagnostics.some((diagnostic) => diagnostic.constraint === "curve"),
  ).toBe(true);
  const after = {
    ...input,
    nodes: input.nodes.map((node) => (node.id === "block" ? { ...node, y: 55 } : node)),
  };
  const update = bezierRouting.update(after, previous, getDiff(input, after));
  expect(update.snapshot.routes.get("ab")).toBe(previous.routes.get("ab"));
  expect(update.snapshot.metrics.searchNodes).toBe(0);
});
