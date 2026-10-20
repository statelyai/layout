import { createGraph, getDiff } from "@statelyai/graph";
import { describe, it, expect } from "vitest";
import {
  bezierRouting,
  straightRouting,
  polylineRouting,
  curvedRouting,
  organicRouting,
  parallelRouting,
  octilinearRouting,
  busRouting,
  fanRouting,
  selfLoopRouting,
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
  it("keeps clearance when retrying around reserved routes", () => {
    const input = createGraph({
      id: "clearance-retry",
      nodes: [
        { id: "node-0", x: 13, y: 35, width: 68, height: 41 },
        { id: "node-1", x: 252, y: 67, width: 75, height: 52 },
        { id: "node-2", x: 461, y: 14, width: 70, height: 40 },
        { id: "node-3", x: 32, y: 239, width: 63, height: 53 },
        { id: "node-4", x: 268, y: 270, width: 63, height: 37 },
        { id: "node-5", x: 482, y: 221, width: 70, height: 51 },
      ],
      edges: [
        { id: "edge-a", sourceId: "node-0", targetId: "node-5" },
        { id: "edge-b", sourceId: "node-0", targetId: "node-2" },
        { id: "edge-c", sourceId: "node-3", targetId: "node-2" },
        { id: "edge-d", sourceId: "node-1", targetId: "node-4" },
      ],
    });
    const result = orthogonalRouting
      .route(input, {
        maxSearchNodes: 8000,
        policy: {
          curve: { kind: "bezier" },
          sourceTangent: { kind: "border-normal" },
          targetTangent: { kind: "border-normal" },
        },
      })
      .routes.get("edge-c")!;
    expect(result.sections.length).toBeGreaterThan(0);
    noCollision(result, { x: 260, y: 262, width: 79, height: 53 });
  });
  it("preserves an authored corner when rounding", () => {
    const input = createGraph({
      id: "authored-corner",
      nodes: [
        { id: "a", x: 0, y: 0, width: 40, height: 40 },
        { id: "b", x: 300, y: 100, width: 40, height: 40 },
      ],
      edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
    });
    const point = { x: 80, y: 20 };
    const result = orthogonalRouting
      .route(input, {
        policy: { curve: { kind: "rounded-orthogonal", radius: 20 } },
        edges: { ab: { waypoints: [point] } },
      })
      .routes.get("ab")!;
    expect(result.status).toBe("routed");
    expect(
      result.sections.flatMap((s) => [s.path.start, ...s.path.segments.map((p) => p.to)]),
    ).toContainEqual(point);
  });
  it("does not promote an unshaped fallback when preserving a prior route", () => {
    const input = createGraph({
      id: "fallback-reuse",
      nodes: [
        { id: "a", x: 0, y: 0, width: 40, height: 40 },
        { id: "b", x: 80, y: 100, width: 40, height: 40 },
        { id: "block", x: 40, y: 80, width: 40, height: 40 },
      ],
      edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
    });
    const settings: RoutingSettings = {
      policy: { ...routingPolicies.smooth, stability: { kind: "preserve-valid" } },
    };
    const before = bezierRouting.route(input, settings);
    const after = bezierRouting
      .update(input, before, getDiff(input, input), {
        policy: { ...settings.policy, collisions: { crossingPenalty: 900 } },
      })
      .snapshot.routes.get("ab")!;
    expect(before.routes.get("ab")!.status).toBe("fallback");
    expect(after.status).toBe("fallback");
    expect(after.diagnostics).toContainEqual(
      expect.objectContaining({ code: "CONSTRAINT_VIOLATION" }),
    );
  });
  it.each([
    bezierRouting,
    straightRouting,
    orthogonalRouting,
    polylineRouting,
    curvedRouting,
    organicRouting,
    parallelRouting,
    octilinearRouting,
    bundleRouting,
    busRouting,
    fanRouting,
    selfLoopRouting,
  ])("$id uses smooth policy guides around obstacles", (strategy) => {
    const input = createGraph({
      id: "override",
      nodes: [
        { id: "a", x: 0, y: 0, width: 40, height: 40 },
        { id: "b", x: 300, y: 0, width: 40, height: 40 },
        { id: "block", x: 120, y: -20, width: 60, height: 80 },
      ],
      edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
    });
    const result = strategy.route(input, { policy: routingPolicies.smooth }).routes.get("ab")!;
    expect(result.status).toBe("routed");
    expect(result.sections.flatMap((s) => s.path.segments).every((s) => s.kind === "cubic")).toBe(
      true,
    );
    noCollision(result, { x: 112, y: -28, width: 76, height: 96 });
  });
  it("updates follower overlap diagnostics in canonical routing order", () => {
    const input = createGraph({
      id: "follower-overlap",
      nodes: [
        { id: "a1", x: 0, y: 0, width: 40, height: 40 },
        { id: "a2", x: 300, y: 0, width: 40, height: 40 },
        { id: "b1", x: 0, y: 300, width: 40, height: 40 },
        { id: "b2", x: 300, y: 300, width: 40, height: 40 },
      ],
      edges: [
        { id: "a", sourceId: "a1", targetId: "a2", width: 40, height: 20 },
        { id: "z", sourceId: "b1", targetId: "b2", width: 40, height: 20 },
      ],
    });
    const moved = {
      ...input,
      nodes: input.nodes.map((node) =>
        node.id.startsWith("a") ? { ...node, y: node.y! + 30 } : node,
      ),
    };
    const settings: RoutingSettings = {
      policy: routingPolicies.smooth,
      edges: {
        a: { policy: { label: { kind: "follow", offset: 120 } } },
        z: { policy: { label: { kind: "follow", offset: -140 } } },
      },
    };
    const initial = bezierRouting.route(input, settings);
    const update = bezierRouting.update(moved, initial, getDiff(input, moved)).snapshot;
    const fresh = bezierRouting.route(moved, settings);
    expect([...update.routes]).toEqual([...fresh.routes]);
    expect(update.routes.get("a")!.diagnostics).toEqual([]);
    expect(update.routes.get("z")!.diagnostics).toContainEqual(
      expect.objectContaining({ code: "LABEL_OVERLAP", relatedIds: ["e:a"] }),
    );
    const restored = bezierRouting.update(input, update, getDiff(moved, input)).snapshot;
    expect([...restored.routes]).toEqual([...initial.routes]);
  });
  it.each(["source", "target"] as const)(
    "escapes an interior %s port without permitting owner reentry",
    (endpoint) => {
      const input = createGraph({
        id: "interior-port",
        nodes: [
          { id: "a", x: 0, y: 0, width: 40, height: 40, ports: [{ name: "p", x: 20, y: 20 }] },
          { id: "b", x: 200, y: 0, width: 40, height: 40, ports: [{ name: "p", x: 20, y: 20 }] },
        ],
        edges: [
          {
            id: "ab",
            sourceId: "a",
            targetId: "b",
            ...(endpoint === "source" ? { sourcePort: "p" } : { targetPort: "p" }),
          },
        ],
      });
      const settings: RoutingSettings = {
        policy: routingPolicies.smooth,
        edges: { ab: { sourceSide: "right", targetSide: "left" } },
      };
      const result = route(settings, input);
      expect(result.status).toBe("routed");
      expect(result.sections[0]!.path.start).toEqual({ x: endpoint === "source" ? 20 : 40, y: 20 });
      expect(result.sections.at(-1)!.path.segments.at(-1)!.to).toEqual({
        x: endpoint === "target" ? 220 : 200,
        y: 20,
      });
      const owner =
        endpoint === "source"
          ? { x: 0, y: 0, width: 40, height: 40 }
          : { x: 200, y: 0, width: 40, height: 40 };
      const path = result.sections[0]!.path;
      const outside =
        endpoint === "source"
          ? { start: path.segments[0]!.to, segments: path.segments.slice(1) }
          : { ...path, segments: path.segments.slice(0, -1) };
      noCollision({ ...result, sections: [{ ...result.sections[0]!, path: outside }] }, owner);
      const blocked = route(
        {
          ...settings,
          edges: {
            ab: {
              ...settings.edges!.ab,
              waypoints: [
                { x: 100, y: 70 },
                { x: owner.x + 25, y: 25 },
              ],
            },
          },
        },
        input,
      );
      expect(blocked.status).toBe("fallback");
      expect(blocked.sections).toEqual([]);
    },
  );
  it("uses final crossing costs when only a zero-handle detour fits", () => {
    const node = (id: string, x: number, y: number) => ({ id, x, y, width: 64, height: 44 });
    const input = createGraph({
      id: "crossing-detour",
      nodes: [node("a", 35, 60), node("b", 435, 220), node("c", 35, 220), node("d", 435, 60)],
      edges: [
        { id: "first", sourceId: "a", targetId: "b" },
        { id: "second", sourceId: "c", targetId: "d" },
      ],
    });
    const result = (crossingPenalty: number) =>
      bezierRouting
        .route(input, {
          policy: {
            curve: { kind: "bezier" },
            collisions: { crossingPenalty, overlapPenalty: 12 },
          },
        })
        .routes.get("second")!;
    expect(result(0).diagnostics).toContainEqual(
      expect.objectContaining({ code: "ROUTE_CONFLICT" }),
    );
    const detour = result(1000);
    expect(detour.status).toBe("fallback");
    expect(detour.diagnostics).toContainEqual(
      expect.objectContaining({ code: "CONSTRAINT_VIOLATION" }),
    );
    expect(detour.diagnostics.some((d) => d.code === "ROUTE_CONFLICT")).toBe(false);
    for (const node of input.nodes)
      noCollision(detour, {
        x: node.x! + 1e-6,
        y: node.y! + 1e-6,
        width: node.width! - 2e-6,
        height: node.height! - 2e-6,
      });
  });
  it("counts policy guide searches", () => {
    const input = createGraph({
      id: "policy-search",
      nodes: [
        { id: "a", x: 0, y: 0, width: 40, height: 40 },
        { id: "b", x: 300, y: 0, width: 40, height: 40 },
        { id: "block", x: 120, y: -20, width: 60, height: 80 },
      ],
      edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
    });
    expect(
      bezierRouting.route(input, { policy: routingPolicies.smooth }).metrics.searchNodes,
    ).toBeGreaterThan(0);
  });
  it.each([
    { curve: { kind: "unknown" } },
    { sourceTangent: { kind: "unknown" } },
    { targetTangent: { kind: "unknown" } },
    { label: { kind: "unknown" } },
    { label: { kind: "through", tangent: { kind: "unknown" } } },
    { collisions: { nodes: "unknown" } },
    { collisions: { labels: "unknown" } },
    { monotonic: { axis: "unknown", strength: "prefer" } },
    { monotonic: { axis: "x", strength: "unknown" } },
    { stability: { kind: "unknown" } },
  ])("rejects invalid policy discriminants at normalization: %j", (policy) => {
    // @ts-expect-error JavaScript consumers can pass invalid enum values.
    expect(() => route({ policy })).toThrow(RangeError);
  });
  it("honors disabled edges and rejects dependent label routes", () => {
    const input = graph();
    const family = {...input, nodes: [...input.nodes, {id: "c", x: 500, y: 220, width: 40, height: 40}],
      edges: [...input.edges, {id:"child",sourceId:"a",targetId:"c"}]};
    const snapshot = bezierRouting.route(family, {policy: routingPolicies.smooth, edges: {
      ab: {bezier: {disabled: true}}, child: {sourceLabel: "ab"},
    }});
    for (const result of snapshot.routes.values()) {
      expect(result.status).toBe("fallback");
      expect(result.sections).toEqual([]);
      expect(result.diagnostics).toContainEqual(expect.objectContaining({code:"CONSTRAINT_VIOLATION"}));
    }
  });
  it.each(["obstacles", "terminalBounds"] as const)("honors explicit Bézier %s with a policy", field => {
    const input = createGraph({id:"custom-barrier",nodes:[{id:"a",x:0,y:0,width:40,height:40},{id:"b",x:300,y:0,width:40,height:40}],edges:[{id:"ab",sourceId:"a",targetId:"b"}]});
    const barrier = {x:120,y:-20,width:60,height:80};
    const result = route({policy: routingPolicies.smooth, edges: {ab: {bezier: {[field]: [barrier]}}}}, input);
    expect(result.sections.length).toBeGreaterThan(0);
    noCollision(result, barrier);
    if (field === "terminalBounds") {
      const hard = route({policy: {...routingPolicies.smooth, collisions:{nodes:"allow",labels:"allow"}}, edges: {ab:{bezier:{terminalBounds:[barrier],avoidObstacles:false}}}}, input);
      expect(hard.sections.length).toBeGreaterThan(0);
      noCollision(hard, barrier);
    }
  });
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
