import { createGraph, getDiff } from "@statelyai/graph";
import { describe, it, expect } from "vitest";
import {
  bezierRouting,
  orthogonalRouting,
  bundleRouting,
  routingPolicies,
  segmentCrossesRect,
  type RoutingSettings,
  type Route,
} from "../src/routing";
import { pathEndpointTangent, pathReverseTravel } from "../src/routing/policy-geometry";

function graph(label = true) {
  return createGraph({
    id: "policy",
    nodes: [
      { id: "a", x: 0, y: 0, width: 40, height: 40 },
      { id: "b", x: 300, y: 140, width: 40, height: 40 },
    ],
    edges: [
      {
        id: "ab",
        sourceId: "a",
        targetId: "b",
        ...(label ? { x: 120, y: 70, width: 60, height: 30 } : {}),
      },
    ],
  });
}
function route(settings: RoutingSettings, input = graph()) {
  return bezierRouting.route(input, settings).routes.get("ab")!;
}
function noCollision(
  route: Route,
  bounds: { x: number; y: number; width: number; height: number },
) {
  for (const section of route.sections) {
    let from = section.path.start;
    for (const segment of section.path.segments) {
      expect(segmentCrossesRect(from, segment, bounds)).toBe(false);
      from = segment.to;
    }
  }
}

describe("routing policies", () => {
  it.each(Object.entries(routingPolicies))("%s works without label geometry", (_name, policy) => {
    const result = route({ policy }, graph(false));
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.label).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
  });
  it("freezes presets and validates policy values", () => {
    expect(Object.isFrozen(routingPolicies.smooth.curve)).toBe(true);
    for (const policy of [
      { curve: { kind: "bezier", curvature: -1 } },
      { curve: { kind: "rounded-orthogonal", radius: NaN } },
      { label: { kind: "follow", fraction: 1.1 } },
      { label: { kind: "follow", offset: Infinity } },
      { sourceTangent: { kind: "vector", direction: { x: 0, y: 0 } } },
      { collisions: { crossingPenalty: Infinity } },
    ] satisfies NonNullable<RoutingSettings["policy"]>[])
      expect(() => route({ policy })).toThrow(RangeError);
  });
  it("positions passive labels by final path, ignoring input position", () => {
    const before = graph(),
      after = { ...before, edges: before.edges.map((e) => ({ ...e, x: 900, y: -900 })) };
    const settings = { policy: routingPolicies.smooth };
    const a = route(settings, before),
      b = route(settings, after);
    expect(a).toEqual(b);
    expect(a.label).toBeDefined();
    expect(a.label!.bounds.width).toBe(60);
    expect(a.label!.anchor).not.toEqual({ x: 150, y: 85 });
    const previous = bezierRouting.route(before, settings);
    expect(
      bezierRouting
        .update(after, previous, getDiff(before, after), settings)
        .snapshot.routes.get("ab"),
    ).toBe(previous.routes.get("ab"));
  });
  it("honors independent actual endpoint directions", () => {
    const result = route(
      {
        policy: {
          ...routingPolicies.smooth,
          sourceTangent: { kind: "vector", direction: { x: 3, y: 1 } },
          targetTangent: { kind: "border-normal" },
        },
      },
      graph(false),
    );
    expect(result.sections.length).toBeGreaterThan(0);
    expect(pathEndpointTangent(result.sections[0]!.path, "start").x).toBeCloseTo(3 / Math.sqrt(10));
    expect(pathEndpointTangent(result.sections.at(-1)!.path, "end")).toEqual({ x: 1, y: 0 });
  });
  it.each(["through", "gap"] as const)("%s constrains actual label derivatives", (kind) => {
    const result = route({
      policy: { ...routingPolicies.smooth, label: { kind, tangent: { kind: "border-normal" } } },
    });
    expect(result.sections.length).toBe(2);
    const incoming = pathEndpointTangent(result.sections[0]!.path, "end"),
      outgoing = pathEndpointTangent(result.sections[1]!.path, "start");
    expect(incoming.x).toBeCloseTo(outgoing.x);
    expect(incoming.y).toBeCloseTo(outgoing.y);
    expect(Math.abs(incoming.x * incoming.y)).toBe(0);
    if (kind === "gap") noCollision(result, { x: 120, y: 70, width: 60, height: 30 });
    else expect(result.sections[0]!.path.segments.at(-1)!.to).toEqual({ x: 150, y: 85 });
  });
  it("keeps fixed label an obstacle", () => {
    const result = route({ policy: { ...routingPolicies.smooth, label: { kind: "fixed" } } });
    expect(result.sections.length).toBeGreaterThan(0);
    noCollision(result, { x: 120, y: 70, width: 60, height: 30 });
    expect(result.label!.anchor).toEqual({ x: 150, y: 85 });
  });
  it("diagnoses impossible orthogonal and label side constraints without drawing", () => {
    const diagonal = route({
      policy: {
        ...routingPolicies.diagram,
        sourceTangent: { kind: "vector", direction: { x: 1, y: 1 } },
      },
    });
    expect(diagonal.sections).toEqual([]);
    expect(diagonal.diagnostics).toContainEqual(
      expect.objectContaining({ code: "CONSTRAINT_VIOLATION", constraint: "source-tangent" }),
    );
    const oneSide = route({
      policy: {
        ...routingPolicies.smooth,
        label: { kind: "gap", tangent: { kind: "border-normal" } },
      },
      edges: { ab: { labelSides: ["left"] } },
    });
    expect(oneSide.sections).toEqual([]);
    expect(oneSide.diagnostics).toContainEqual(
      expect.objectContaining({ constraint: "label-tangent" }),
    );
  });
  it("interpolates authored Catmull knots in order", () => {
    const knots = [
      { x: 100, y: -70 },
      { x: 190, y: 210 },
      { x: 190, y: 210 },
      { x: 240, y: 100 },
    ];
    const result = route(
      { policy: routingPolicies.authored, edges: { ab: { waypoints: knots } } },
      graph(false),
    );
    expect(result.sections.length).toBeGreaterThan(0);
    const endpoints = result.sections.flatMap((section) => [
      section.path.start,
      ...section.path.segments.map((s) => s.to),
    ]);
    let index = 0;
    for (const knot of knots) {
      index = endpoints.findIndex((p, i) => i >= index && p.x === knot.x && p.y === knot.y);
      expect(index).toBeGreaterThanOrEqual(0);
    }
    expect(result.sections.flatMap((s) => s.path.segments).every((s) => s.kind === "cubic")).toBe(
      true,
    );
  });
  it("required monotonicity is checked on final curves", () => {
    const result = route(
      {
        policy: { ...routingPolicies.authored, monotonic: { axis: "both", strength: "require" } },
        edges: {
          ab: {
            waypoints: [
              { x: 210, y: 50 },
              { x: 140, y: 90 },
            ],
          },
        },
      },
      graph(false),
    );
    expect(result.sections).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ constraint: "monotonicity" }),
    );
    const valid = route(
      { policy: { ...routingPolicies.smooth, monotonic: { axis: "both", strength: "require" } } },
      graph(false),
    );
    expect(valid.sections.length).toBeGreaterThan(0);
    for (const section of valid.sections)
      expect(
        pathReverseTravel(section.path, "both", { x: 40, y: 20 }, { x: 300, y: 160 }),
      ).toBeLessThan(1e-7);
  });
  it("preserves valid prior geometry after soft settings changes", () => {
    const g = graph(false),
      settings = {
        policy: { ...routingPolicies.smooth, stability: { kind: "preserve-valid" as const } },
      };
    const before = bezierRouting.route(g, settings),
      after = bezierRouting.update(g, before, getDiff(g, g), {
        policy: { ...settings.policy, collisions: { crossingPenalty: 900, overlapPenalty: 80 } },
      });
    expect(after.snapshot.routes.get("ab")).toBe(before.routes.get("ab"));
  });
  it("follower source labels route after parent across curve families", () => {
    const base = graph(),
      g = {
        ...base,
        nodes: [
          ...base.nodes,
          { type: "node" as const, data: {}, id: "c", x: 450, y: -150, width: 40, height: 40 },
        ],
        edges: [
          ...base.edges,
          { type: "edge" as const, data: {}, id: "child", sourceId: "a", targetId: "c" },
        ],
      };
    const result = orthogonalRouting.route(g, {
      policy: routingPolicies.diagram,
      edges: { child: { sourceLabel: "ab" } },
    });
    const parent = result.routes.get("ab")!,
      child = result.routes.get("child")!;
    expect(parent.label).toBeDefined();
    expect(child.sections.length).toBeGreaterThan(0);
    expect(child.sections[0]!.from).toEqual({ kind: "label", edgeId: "ab" });
  });
  it("shared sections have identical geometry", () => {
    const base = graph(false),
      g = {
        ...base,
        nodes: [
          ...base.nodes,
          { type: "node" as const, data: {}, id: "c", x: 300, y: -140, width: 40, height: 40 },
        ],
        edges: [
          ...base.edges,
          { type: "edge" as const, data: {}, id: "ac", sourceId: "a", targetId: "c" },
        ],
      };
    const result = bundleRouting.route(g, { policy: routingPolicies.diagram });
    const shared = [...result.routes.values()].flatMap((r) => r.sections.filter((s) => s.sharedId));
    expect(shared.length).toBe(2);
    expect(shared[0]!.path).toEqual(shared[1]!.path);
  });
  it("independently allows nodes and labels, with hard-safe obstacle fallback", () => {
    const base = graph(false),
      blocked = {
        ...base,
        nodes: [
          ...base.nodes,
          { type: "node" as const, data: {}, id: "block", x: 130, y: 30, width: 70, height: 110 },
        ],
      };
    const avoided = route({ policy: routingPolicies.smooth }, blocked);
    expect(avoided.sections.length).toBeGreaterThan(0);
    noCollision(avoided, { x: 130, y: 30, width: 70, height: 110 });
    const allowed = route(
      { policy: { ...routingPolicies.smooth, collisions: { nodes: "allow", labels: "avoid" } } },
      blocked,
    );
    expect(allowed.sections.length).toBeGreaterThan(0);
    expect(
      allowed.sections[0]!.path.segments.some((segment) =>
        segmentCrossesRect(allowed.sections[0]!.path.start, segment, {
          x: 130,
          y: 30,
          width: 70,
          height: 110,
        }),
      ),
    ).toBe(true);
    const fixed = graph();
    const throughFixed = route(
      {
        policy: {
          ...routingPolicies.smooth,
          label: { kind: "fixed" },
          collisions: { labels: "allow" },
        },
      },
      fixed,
    );
    expect(
      throughFixed.sections[0]!.path.segments.some((segment) =>
        segmentCrossesRect(throughFixed.sections[0]!.path.start, segment, {
          x: 120,
          y: 70,
          width: 60,
          height: 30,
        }),
      ),
    ).toBe(true);
  });
  it("a new obstacle invalidates preserve-valid geometry", () => {
    const before = graph(false),
      settings = {
        policy: { ...routingPolicies.smooth, stability: { kind: "preserve-valid" as const } },
      };
    const initial = bezierRouting.route(before, settings);
    const after = {
      ...before,
      nodes: [
        ...before.nodes,
        { type: "node" as const, data: {}, id: "block", x: 130, y: 30, width: 70, height: 110 },
      ],
    };
    const updated = bezierRouting.update(after, initial, getDiff(before, after), settings).snapshot;
    expect(updated.routes.get("ab")!.sections).not.toEqual(initial.routes.get("ab")!.sections);
    expect(updated.routes.get("ab")!.sections.length).toBeGreaterThan(0);
    noCollision(updated.routes.get("ab")!, { x: 130, y: 30, width: 70, height: 110 });
    expect(
      bezierRouting
        .update(after, initial, getDiff(before, after), settings)
        .snapshot.routes.get("ab"),
    ).toEqual(updated.routes.get("ab"));
  });
  it("reports passive label overlaps without attracting the curve", () => {
    const before = graph(),
      first = route({ policy: routingPolicies.smooth }, before);
    const after = {
      ...before,
      edges: before.edges.map((edge) => ({ ...edge, width: 900, height: 900 })),
    };
    const second = route({ policy: routingPolicies.smooth }, after);
    expect(second.sections).toEqual(first.sections);
    expect(second.diagnostics).toContainEqual(expect.objectContaining({ code: "LABEL_OVERLAP" }));
  });
  it("prefers monotonicity but permits the necessary obstacle detour", () => {
    const base = graph(false),
      horizontal = { ...base, nodes: base.nodes.map((node) => ({ ...node, y: 0 })) };
    const blocked = {
      ...horizontal,
      nodes: [
        ...horizontal.nodes,
        { type: "node" as const, data: {}, id: "block", x: 130, y: -30, width: 70, height: 110 },
      ],
    };
    const preferred = route(
      { policy: { ...routingPolicies.diagram, monotonic: { axis: "both", strength: "prefer" } } },
      blocked,
    );
    expect(preferred.sections.length).toBeGreaterThan(0);
    expect(preferred.diagnostics).toContainEqual(
      expect.objectContaining({ constraint: "monotonicity" }),
    );
    const required = route(
      { policy: { ...routingPolicies.diagram, monotonic: { axis: "both", strength: "require" } } },
      blocked,
    );
    expect(required.sections).toEqual([]);
  });
  it("missing fixed label geometry and label cycles have stable diagnostics", () => {
    expect(
      route({ policy: { label: { kind: "fixed" } } }, graph(false)).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: "MISSING_GEOMETRY" }));
    const result = route({ policy: routingPolicies.smooth, edges: { ab: { sourceLabel: "ab" } } });
    expect(result.sections).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "CONSTRAINT_VIOLATION" }),
    );
  });

  it("scores crossings on final shaped curves", () => {
    const g = createGraph({
      id: "crossing",
      nodes: [
        { id: "left", x: 0, y: 100, width: 20, height: 20 },
        { id: "right", x: 200, y: 100, width: 20, height: 20 },
        { id: "top", x: 100, y: 0, width: 20, height: 20 },
        { id: "bottom", x: 100, y: 200, width: 20, height: 20 },
      ],
      edges: [
        { id: "a", sourceId: "left", targetId: "right" },
        { id: "z", sourceId: "top", targetId: "bottom" },
      ],
    });
    const inexpensive = bezierRouting
      .route(g, {
        policy: {
          ...routingPolicies.smooth,
          collisions: { crossingPenalty: 1, overlapPenalty: 0 },
        },
      })
      .routes.get("z")!;
    const expensive = bezierRouting
      .route(g, {
        policy: {
          ...routingPolicies.smooth,
          collisions: { crossingPenalty: 900, overlapPenalty: 0 },
        },
      })
      .routes.get("z")!;
    expect(inexpensive.diagnostics).toContainEqual(
      expect.objectContaining({ code: "ROUTE_CONFLICT" }),
    );
    expect(expensive.sections.length).toBeGreaterThan(0);
    expect(expensive.diagnostics.map((d) => d.code)).not.toContain("ROUTE_CONFLICT");
    expect(expensive.sections).not.toEqual(inexpensive.sections);
  });
  it("inherits fields independently and lets per-edge legacy attachment override global policy", () => {
    const result = route(
      {
        policy: {
          ...routingPolicies.smooth,
          sourceTangent: { kind: "vector", direction: { x: 1, y: 1 } },
          targetTangent: { kind: "border-normal" },
        },
        edges: {
          ab: {
            bezier: { attachmentMode: "orthogonal" },
            policy: { targetTangent: { kind: "vector", direction: { x: 2, y: 1 } } },
          },
        },
      },
      graph(false),
    );
    expect(result.sections.length).toBeGreaterThan(0);
    expect(pathEndpointTangent(result.sections[0]!.path, "start")).toEqual({ x: 1, y: 0 });
    expect(pathEndpointTangent(result.sections.at(-1)!.path, "end").y).toBeCloseTo(
      1 / Math.sqrt(5),
    );
  });
});
