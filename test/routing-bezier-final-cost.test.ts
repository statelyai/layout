import { describe, expect, it } from "vitest";
import { routeEdge, type Batch, type Metrics, type RoutingInput } from "../src/routing/algorithms";
import { routeBezierEdge } from "../src/routing/bezier";
import { conflictCost, reservations, type Reservation } from "../src/routing/coordination";
import { settings, type EdgeGeometry, type NodeGeometry } from "../src/routing/model";
import { PersistentMap } from "../src/routing/persistent";
import { SpatialIndex } from "../src/routing/spatial";
import type { Route } from "../src/routing/types";

const edge = {
  id: "curve",
  sourceId: "source",
  targetId: "target",
  x: 180,
  y: 80,
  width: 60,
  height: 80,
} satisfies EdgeGeometry;
const source = { id: "source", x: 0, y: 0, width: 40, height: 40 };
const target = { id: "target", x: 400, y: 200, width: 40, height: 40 };
const counts = (): Metrics => ({
  routedEdges: 0,
  reusedEdges: 0,
  affectedEdges: 0,
  searchNodes: 0,
  obstacleCandidates: 0,
});
function state(crossingPenalty = 1000, optIn = true): RoutingInput {
  return {
    nodes: new PersistentMap<NodeGeometry>().set(source.id, source).set(target.id, target),
    edges: new PersistentMap<EdgeGeometry>().set(edge.id, edge),
    groups: new PersistentMap(),
    incident: new PersistentMap(),
    obstacles: new SpatialIndex()
      .set("n:source", source)
      .set("n:target", target)
      .set("e:curve", edge),
    settings: settings({
      coordinateSpace: "world",
      clearance: 0,
      crossingPenalty,
      overlapPenalty: 0,
      edgeSpacing: 0,
      ...(optIn ? { bezier: { attachmentMode: "orthogonal", targetClearance: 0 } } : {}),
      edges: { curve: { sourceSide: "right", targetSide: "left", labelSides: ["left", "right"] } },
    }),
  };
}
function batch(input: RoutingInput, occupied: readonly Reservation[] = []): Batch {
  return {
    plans: new Map(),
    edgeCost: (a, b) =>
      occupied.reduce((cost, other) => cost + conflictCost(a, b, other, input.settings), 0),
    conflicts: (a, b) =>
      occupied.some(
        (other) =>
          conflictCost(a, b, other, { ...input.settings, crossingPenalty: 1, overlapPenalty: 1 }) >
          1e-8,
      ),
  };
}
function route(input: RoutingInput, occupied: readonly Reservation[] = []): Route {
  return routeBezierEdge(edge, input, new Map(), counts(), batch(input, occupied));
}
function crossings(route: Route, occupied: Reservation): number {
  return reservations(route).reduce(
    (sum, part) => sum + conflictCost(part.a, part.b, occupied, state().settings),
    0,
  );
}
function exclusiveCrossing(crossed: Route, avoided: Route): Reservation {
  for (const segment of reservations(crossed)) {
    const dx = segment.b.x - segment.a.x,
      dy = segment.b.y - segment.a.y;
    const length = Math.hypot(dx, dy);
    if (!length) continue;
    const x = (segment.a.x + segment.b.x) / 2,
      y = (segment.a.y + segment.b.y) / 2;
    const reservation = {
      a: { x: x - dy / length, y: y + dx / length },
      b: { x: x + dy / length, y: y - dx / length },
    };
    if (crossings(crossed, reservation) > 0 && crossings(avoided, reservation) === 0)
      return reservation;
  }
  throw new Error("Fixture must distinguish actual curves from their guides");
}

describe("opt-in Bézier final geometry costs", () => {
  it("selects a clear guide when the fitted curve introduces an expensive crossing", () => {
    const input = state();
    const clearFit = route(input);
    const guide = routeEdge(edge, input, "orthogonal", counts(), batch(input));
    expect(
      clearFit.sections.some((section) =>
        section.path.segments.some((segment) => segment.kind === "cubic"),
      ),
    ).toBe(true);
    const occupied = exclusiveCrossing(clearFit, guide);
    const result = route(input, [occupied]);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(crossings(clearFit, occupied)).toBeGreaterThan(0);
    expect(crossings(result, occupied)).toBe(0);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "ROUTE_CONFLICT")).toBe(
      false,
    );
  });

  it.each([0, 1])(
    "keeps useful curves with finite crossing cost %s and reports their actual conflict",
    (penalty) => {
      const input = state(penalty);
      const fitted = route(input);
      const guide = routeEdge(edge, input, "orthogonal", counts(), batch(input));
      const occupied = exclusiveCrossing(fitted, guide);
      const result = route(input, [occupied]);
      expect(result.sections).toEqual(fitted.sections);
      expect(
        result.diagnostics.filter((diagnostic) => diagnostic.code === "ROUTE_CONFLICT"),
      ).toHaveLength(1);
      expect(result.status).toBe("fallback");
    },
  );

  it("removes stale guide conflicts when the accepted fitted path is clear", () => {
    const input = state(0);
    const fitted = route(input);
    const guide = routeEdge(edge, input, "orthogonal", counts(), batch(input));
    const occupied = exclusiveCrossing(guide, fitted);
    const planned = routeEdge(edge, input, "orthogonal", counts(), batch(input, [occupied]));
    expect(planned.diagnostics.some((diagnostic) => diagnostic.code === "ROUTE_CONFLICT")).toBe(
      true,
    );
    const result = route(input, [occupied]);
    expect(result.sections).toEqual(fitted.sections);
    expect(crossings(result, occupied)).toBe(0);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "ROUTE_CONFLICT")).toBe(
      false,
    );
    expect(result.status).toBe("routed");
  });

  it("applies final curve costs to a per-edge Bézier opt-in", () => {
    const global = state();
    const input = {
      ...global,
      settings: settings({
        ...global.settings,
        bezier: undefined,
        edges: { curve: { ...global.settings.edges.curve, bezier: global.settings.bezier } },
      }),
    };
    const fitted = route(input);
    const guide = routeEdge(edge, input, "orthogonal", counts(), batch(input));
    const occupied = exclusiveCrossing(fitted, guide);
    const result = route(input, [occupied]);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(crossings(result, occupied)).toBe(0);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "ROUTE_CONFLICT")).toBe(
      false,
    );
  });

  it("leaves callers without the opt-in or a label family on the existing route path", () => {
    const input = state(80, false);
    expect(route(input)).toEqual(routeEdge(edge, input, "bezier", counts(), batch(input)));
  });
});
