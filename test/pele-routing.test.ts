import { createGraph, getDiff } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import { getPeleLayout } from "../src/pele";
import {
  createPeleRouting,
  refineRoutes,
  routeEdges,
  routingPolicies,
  segmentCrossesRect,
  updateRoutes,
} from "../src/routing";
import { pathEndpointTangent, pathHasSelfIntersection } from "../src/routing/policy-geometry";
import type { Route, RoutingGraph } from "../src/routing";

function fixture() {
  return createGraph({
    nodes: ["a", "b", "c", "d", "e"].map((id) => ({ id, width: 100.125, height: 60.375 })),
    edges: [
      { id: "forward", sourceId: "a", targetId: "b", width: 60, height: 24 },
      { id: "return", sourceId: "b", targetId: "a", width: 60, height: 24 },
      { id: "loop", sourceId: "c", targetId: "c", width: 60, height: 24 },
      { id: "unaffected", sourceId: "d", targetId: "e", width: 60, height: 24 },
    ],
  });
}
function assertSafe(route: Route, graph: RoutingGraph) {
  expect(route.sections.length, JSON.stringify(route.diagnostics)).toBeGreaterThan(0);
  const vectors = {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
  };
  const first = route.sections[0]!,
    last = route.sections.at(-1)!;
  if (first.fromSide)
    expect(pathEndpointTangent(first.path, "start")).toEqual(vectors[first.fromSide]);
  if (last.toSide) {
    const tangent = pathEndpointTangent(last.path, "end"),
      normal = vectors[last.toSide];
    expect(tangent.x * normal.x + tangent.y * normal.y).toBeCloseTo(-1);
  }
  for (const section of route.sections) {
    expect(pathHasSelfIntersection(section.path)).toBe(false);
    let from = section.path.start;
    for (const segment of section.path.segments) {
      for (const node of graph.nodes) {
        if (graph.nodes.some((child) => child.parentId === node.id)) continue;
        expect(
          segmentCrossesRect(from, segment, {
            x: node.x!,
            y: node.y!,
            width: node.width!,
            height: node.height!,
          }),
          `${route.edgeId} crosses ${node.id}`,
        ).toBe(false);
      }
      for (const label of graph.edges) {
        if (!label.width || !label.height) continue;
        expect(
          segmentCrossesRect(from, segment, {
            x: label.x!,
            y: label.y!,
            width: label.width,
            height: label.height,
          }),
          `${route.edgeId} crosses label ${label.id}`,
        ).toBe(false);
      }
      from = segment.to;
    }
  }
}

describe("Pele incremental routing", () => {
  it.each(["down", "up", "left", "right"] as const)(
    "retains Pele curves across repeated label drag/drop (%s)",
    (direction) => {
      const layout = getPeleLayout(fixture(), { direction });
      const handoff = createPeleRouting(layout, { clearance: 0 });
      let graph = handoff.graph,
        previous = handoff.snapshot;
      const fixed = structuredClone(graph.nodes);
      const untouched = previous.routes.get("unaffected");
      for (const id of ["forward", "return", "loop"]) {
        const origin = graph.edges.find((edge) => edge.id === id)!;
        for (const offset of [12, 25, 8, 0, 20, 0]) {
          const next = {
            ...graph,
            edges: graph.edges.map((edge) =>
              edge.id === id
                ? {
                    ...edge,
                    x: origin.x! + (direction === "down" || direction === "up" ? offset : 0),
                    y: origin.y! + (direction === "left" || direction === "right" ? offset : 0),
                  }
                : edge,
            ),
          };
          const update = updateRoutes({ graph: next, previous, changes: getDiff(graph, next) });
          const route = update.snapshot.routes.get(id)!;
          expect(route.status, `${id} ${offset}: ${JSON.stringify(route.diagnostics)}`).toBe(
            "routed",
          );
          expect(route.sections).toHaveLength(2);
          if (offset !== 0)
            expect(
              route.sections.some((section) =>
                section.path.segments.some((segment) => segment.kind === "cubic"),
              ),
              `${id} ${offset}`,
            ).toBe(true);
          assertSafe(route, next);
          expect(next.nodes).toEqual(fixed);
          expect(update.snapshot.routes.get("unaffected")).toBe(untouched);
          const drop = updateRoutes({
            graph: next,
            previous: update.snapshot,
            changes: getDiff(next, next),
          });
          expect(drop.patches).toEqual([]);
          expect(drop.snapshot.routes.get(id)).toBe(route);
          previous = drop.snapshot;
          graph = next;
        }
      }
      const refined = refineRoutes({ previous });
      for (const route of refined.snapshot.routes.values()) assertSafe(route, graph);
    },
  );
});

it("adopts valid Pele paths exactly, including coordinated attachment offsets", () => {
  const layout = getPeleLayout(fixture());
  const { snapshot } = createPeleRouting(layout, { clearance: 0 });
  for (const id of ["forward", "return", "unaffected"]) {
    expect(snapshot.routes.get(id)!.sections.map((section) => section.path)).toEqual(
      layout.compoundRoutes.get(id)!.sections.map((section) => section.path),
    );
  }
});

it.each([
  ["right", "down"],
  ["left", "up"],
  ["down", "right"],
  ["up", "left"],
] as const)(
  "continues across nested direction changes and keeps headers as obstacles (%s/%s)",
  (direction, childDirection) => {
    const layout = getPeleLayout(
      createGraph({
        nodes: [
          { id: "group", width: 160, height: 70 },
          { id: "a", parentId: "group", width: 100, height: 60 },
          { id: "b", parentId: "group", width: 100, height: 60 },
          { id: "c", width: 100, height: 60 },
        ],
        edges: [
          { id: "inner", sourceId: "a", targetId: "b", width: 50, height: 24 },
          { id: "cross", sourceId: "b", targetId: "c", width: 50, height: 24 },
          { id: "parent", sourceId: "group", targetId: "a", width: 50, height: 24 },
        ],
      }),
      {
        direction,
        compound: () => ({
          direction: childDirection,
          padding: 45,
          header: { width: 160, height: 40 },
        }),
      },
    );
    const handoff = createPeleRouting(layout, { clearance: 0 });
    let graph = handoff.graph,
      previous = handoff.snapshot;
    expect(graph.nodes.some((node) => node.id.startsWith("__pele_routing_header_"))).toBe(true);
    for (const id of ["inner", "cross", "parent"]) {
      const original = graph.edges.find((edge) => edge.id === id)!;
      for (const offset of [8, 15, 0]) {
        const next = {
          ...graph,
          edges: graph.edges.map((edge) =>
            edge.id === id ? { ...edge, x: original.x! + offset } : edge,
          ),
        };
        const update = updateRoutes({ graph: next, previous, changes: getDiff(graph, next) });
        const route = update.snapshot.routes.get(id)!;
        expect(route.status, `${id} ${offset}: ${JSON.stringify(route.diagnostics)}`).toBe(
          "routed",
        );
        assertSafe(route, next);
        graph = next;
        previous = update.snapshot;
      }
    }
  },
);

it("updates routes blocked by the dragged label and retains the curve policy after an infeasible drag", () => {
  let graph = createGraph({
    nodes: [
      { id: "a", x: 0, y: 0, width: 60, height: 40 },
      { id: "b", x: 300, y: 0, width: 60, height: 40 },
      { id: "c", x: 0, y: 150, width: 60, height: 40 },
      { id: "d", x: 300, y: 150, width: 60, height: 40 },
    ],
    edges: [
      { id: "top", sourceId: "a", targetId: "b", x: 140, y: 10, width: 40, height: 20 },
      { id: "bottom", sourceId: "c", targetId: "d", x: 140, y: 160, width: 40, height: 20 },
    ],
  });
  let previous = routeEdges({
    graph,
    settings: { clearance: 4, maxSearchNodes: 1000, policy: routingPolicies.pele },
  });
  const bottom = previous.routes.get("bottom");
  for (const bounds of [
    { x: 80, y: 160 },
    { x: 10, y: 10 },
    { x: 140, y: 70 },
  ]) {
    const next = {
      ...graph,
      edges: graph.edges.map((edge) => (edge.id === "top" ? { ...edge, ...bounds } : edge)),
    };
    const update = updateRoutes({ graph: next, previous, changes: getDiff(graph, next) });
    if (bounds.x === 80) {
      expect(update.snapshot.routes.get("bottom")).not.toBe(bottom);
      assertSafe(update.snapshot.routes.get("bottom")!, next);
    }
    if (bounds.x === 10) expect(update.snapshot.routes.get("top")!.status).toBe("fallback");
    if (bounds.x === 140) {
      const route = update.snapshot.routes.get("top")!;
      expect(route.status, JSON.stringify(route.diagnostics)).toBe("routed");
      expect(
        route.sections.some((section) =>
          section.path.segments.some((segment) => segment.kind === "cubic"),
        ),
      ).toBe(true);
      assertSafe(route, next);
    }
    previous = update.snapshot;
    graph = next;
  }
});

it("does not scan graph arrays during a label update", () => {
  const handoff = createPeleRouting(getPeleLayout(fixture()), { clearance: 0 });
  const graph = handoff.graph;
  const next = {
    ...graph,
    edges: graph.edges.map((edge) => (edge.id === "forward" ? { ...edge, x: edge.x! + 10 } : edge)),
  };
  const changes = getDiff(graph, next);
  Object.defineProperties(next, {
    nodes: {
      get: () => {
        throw new Error("scanned nodes");
      },
    },
    edges: {
      get: () => {
        throw new Error("scanned edges");
      },
    },
  });
  const update = updateRoutes({ graph: next, previous: handoff.snapshot, changes });
  expect(update.snapshot.routes.get("forward")!.status).toBe("routed");
  expect(update.snapshot.metrics.affectedEdges).toBeLessThan(graph.edges.length);
});

it("keeps target-facing straight arrow approaches and trims marker gaps only once", () => {
  const layout = getPeleLayout(fixture());
  const handoff = createPeleRouting(layout, {
    clearance: 0,
    edges: { forward: { targetClearance: 7 } },
  });
  let graph = handoff.graph,
    previous = handoff.snapshot;
  let targetPoint: { x: number; y: number } | undefined;
  for (const offset of [12, 25, 12, 25]) {
    const origin = handoff.graph.edges.find((edge) => edge.id === "forward")!;
    const next = {
      ...graph,
      edges: graph.edges.map((edge) =>
        edge.id === "forward" ? { ...edge, x: origin.x! + offset } : edge,
      ),
    };
    const update = updateRoutes({ graph: next, previous, changes: getDiff(graph, next) });
    const route = update.snapshot.routes.get("forward")!;
    expect(route.status, JSON.stringify(route.diagnostics)).toBe("routed");
    const path = route.sections.at(-1)!.path;
    const last = path.segments.at(-1)!;
    expect(last.kind).toBe("line");
    const before = path.segments.at(-2)?.to ?? path.start;
    expect(Math.abs(before.x - last.to.x)).toBeLessThan(1e-7);
    expect(last.to.y).toBeGreaterThan(before.y);
    if (targetPoint) expect(last.to).toEqual(targetPoint);
    targetPoint = last.to;
    graph = next;
    previous = update.snapshot;
  }
});

it("rejects a handoff after geometry edits", () => {
  const layout = getPeleLayout(fixture());
  const edited = { ...layout, edges: layout.edges.map((edge) => ({ ...edge, x: edge.x + 1 })) };
  expect(() => createPeleRouting(edited)).toThrow("before editing");
});
