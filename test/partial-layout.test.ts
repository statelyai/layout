import { createGraph, applyPatches } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import { c, getLayout, getFixedLayout } from "../src";
import { runPartialLayout } from "../src/authoring/partial";
import type { LayoutExecutionContext } from "../src/types";
import { routeCrosses } from "../src/authoring/routing";

function fixture() {
  return getFixedLayout(
    createGraph({
      nodes: [
        { id: "a", x: 0, y: 0, width: 80, height: 40 },
        { id: "b", x: 320, y: 0, width: 80, height: 40 },
        { id: "obstacle", x: 150, y: -20, width: 80, height: 80 },
      ],
      edges: [
        {
          id: "ab",
          sourceId: "a",
          targetId: "b",
          x: 100,
          y: 110,
          width: 60,
          height: 20,
          points: [
            { x: 80, y: 20 },
            { x: 320, y: 20 },
          ],
          routing: "orthogonal",
        },
      ],
    }),
    { direction: "right" },
  );
}

describe("partial authoring layout", () => {
  it("routes edge-only selection around fixed obstacles without changing labels or nodes", async () => {
    const graph = fixture();
    const before = structuredClone(graph);
    const result = await getLayout({
      graph,
      scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" },
    });
    expect(graph).toEqual(before);
    expect(result.graph.nodes).toEqual(graph.nodes);
    expect(result.graph.edges[0]).toMatchObject({ x: 100, y: 110, width: 60, height: 20 });
    expect(result.graph.edges[0]!.points).not.toEqual(graph.edges[0]!.points);
    expect(routeCrosses(result.graph.edges[0]!.points, graph.nodes[2]!)).toBe(false);
    expect(result.patches).toEqual([
      {
        op: "updateEdge",
        id: "ab",
        data: { points: result.graph.edges[0]!.points },
        description: "Apply layout geometry",
      },
    ]);
    const patched = structuredClone(graph);
    applyPatches(patched, [...result.patches]);
    expect(patched).toEqual(result.graph);
  });
  it("labels-only changes no route fields", async () => {
    const graph = fixture();
    const result = await getLayout({
      graph,
      scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "labels", routing: "selected" },
    });
    expect(result.graph.nodes).toEqual(graph.nodes);
    expect(result.graph.edges[0]!.points).toEqual(graph.edges[0]!.points);
    expect(result.graph.edges[0]!.routing).toEqual(graph.edges[0]!.routing);
    expect(result.graph.edges[0]!.y).not.toBe(110);
    for (const patch of result.patches)
      if (patch.op === "updateEdge") expect(Object.keys(patch.data)).not.toContain("points");
    const patched = structuredClone(graph);
    applyPatches(patched, [...result.patches]);
    expect(patched).toEqual(result.graph);
  });
  it("empty and omitted selections are no-ops", async () => {
    const graph = fixture();
    for (const scope of [
      { mode: "partial" } as const,
      { mode: "partial", nodeIds: [], edgeIds: [] } as const,
    ]) {
      const result = await getLayout({ graph, scope });
      expect(result.graph).toEqual(graph);
      expect(result.patches).toEqual([]);
    }
  });
  it("rejects unknown selection and accepts duplicate IDs", async () => {
    const graph = fixture();
    await expect(
      getLayout({ graph, scope: { mode: "partial", edgeIds: ["missing"] } }),
    ).rejects.toMatchObject({ code: "INVALID_SELECTION" });
    const once = await getLayout({ graph, scope: { mode: "partial", edgeIds: ["ab"] } });
    const twice = await getLayout({ graph, scope: { mode: "partial", edgeIds: ["ab", "ab"] } });
    expect(twice.graph).toEqual(once.graph);
  });
  it("uses previous only to fill geometry missing from current entities", async () => {
    const previous = fixture();
    const graph = {
      ...previous,
      nodes: previous.nodes.slice(0, 2).map((n) => ({ ...n, x: undefined as number | undefined })),
    };
    graph.nodes[0]!.x = 25;
    const result = await getLayout({ graph, scope: { mode: "partial", previous } });
    expect(result.graph.nodes.map((n) => [n.id, n.x])).toEqual([
      ["a", 25],
      ["b", 320],
    ]);
    expect(result.graph.nodes).toHaveLength(2);
  });
  it("rejects missing fixed geometry instead of resetting it to zero", async () => {
    const graph = createGraph({ nodes: [{ id: "a" }], edges: [] });
    await expect(getLayout({ graph, scope: { mode: "partial" } })).rejects.toMatchObject({
      code: "MISSING_GEOMETRY",
    });
  });
  it("moves selected nodes only and reports excluded incident routes", async () => {
    const graph = fixture();
    const result = await getLayout({
      graph,
      scope: { mode: "partial", nodeIds: ["a"], routing: "selected" },
      constraints: [c.pin({ id: "move", entity: { nodeId: "a" }, y: 150 })],
    });
    expect(result.graph.nodes[0]!.y).toBe(150);
    expect(result.graph.nodes.slice(1)).toEqual(graph.nodes.slice(1));
    expect(result.graph.edges).toEqual(graph.edges);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "ROUTE_REPAIR_REQUIRED", entityIds: ["ab"] }),
    );
  });
  it("affected routing repairs edges after node movement and identifies automatic changes", async () => {
    const graph = fixture();
    const result = await getLayout({
      graph,
      scope: { mode: "partial", nodeIds: ["a"] },
      constraints: [c.pin({ id: "move", entity: { nodeId: "a" }, y: 150 })],
    });
    expect(result.graph.edges[0]!.points![0]).toEqual({ x: 80, y: 170 });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "AFFECTED_EDGES_UPDATED", entityIds: ["ab"] }),
    );
    const patched = structuredClone(graph);
    applyPatches(patched, [...result.patches]);
    expect(patched).toEqual(result.graph);
  });
  it("affected detects a moved obstacle crossing a nonincident route", async () => {
    const graph = fixture();
    graph.nodes[2]!.y = 200;
    const result = await getLayout({
      graph,
      scope: { mode: "partial", nodeIds: ["obstacle"], edgeGeometry: "routes" },
      constraints: [c.pin({ id: "move", entity: { nodeId: "obstacle" }, y: 0 })],
    });
    expect(routeCrosses(result.graph.edges[0]!.points, result.graph.nodes[2]!)).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "AFFECTED_EDGES_UPDATED" }),
    );
  });
  it("route-only defaults to all edges, while an empty list selects none", async () => {
    const graph = fixture();
    const all = await getLayout({ graph, scope: { mode: "route-only", previous: graph } });
    expect(all.graph.edges[0]!.points).not.toEqual(graph.edges[0]!.points);
    expect(all.graph.edges[0]).toMatchObject({ x: 100, y: 110 });
    const none = await getLayout({
      graph,
      scope: { mode: "route-only", previous: graph, edgeIds: [] },
    });
    expect(none.patches).toEqual([]);
  });
  it("rejects container movement rather than implicitly moving descendants", async () => {
    const graph = getFixedLayout(
      createGraph({
        nodes: [
          { id: "parent", x: 100, y: 200, width: 400, height: 400 },
          { id: "child", parentId: "parent", x: 30, y: 30, width: 40, height: 40 },
        ],
        edges: [],
      }),
    );
    await expect(
      getLayout({ graph, scope: { mode: "partial", nodeIds: ["parent"] } }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_LAYOUT" });
  });
  it("places disconnected selected components near their own fixed neighbors", async () => {
    const graph = getFixedLayout(
      createGraph({
        nodes: [
          { id: "a", x: 0, y: 0, width: 40, height: 40 },
          { id: "b", x: 0, y: 250, width: 40, height: 40 },
          { id: "fixed-a", x: 300, y: 0, width: 40, height: 40 },
          { id: "fixed-b", x: 300, y: 250, width: 40, height: 40 },
        ],
        edges: [
          { id: "a-link", sourceId: "a", targetId: "fixed-a" },
          { id: "b-link", sourceId: "b", targetId: "fixed-b" },
        ],
      }),
      { direction: "right" },
    );
    const base = {
      graph,
      scope: { mode: "partial" as const, nodeIds: ["a", "b"], routing: "selected" as const },
    };
    const sketch = await getLayout(base);
    const near = await getLayout({
      ...base,
      scope: { ...base.scope, placement: { proximity: "neighbors" as const } },
    });
    expect(sketch.graph.nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(sketch.graph.nodes[1]).toMatchObject({ x: 0, y: 250 });
    expect(near.graph.nodes[0]!.x).toBeGreaterThan(sketch.graph.nodes[0]!.x);
    expect(near.graph.nodes[1]!.x).toBeGreaterThan(sketch.graph.nodes[1]!.x);
    expect(near.graph.nodes[2]).toEqual(graph.nodes[2]);
    expect(near.graph.nodes[3]).toEqual(graph.nodes[3]);
    expect(near.graph.nodes[0]!.y).toBeLessThan(near.graph.nodes[1]!.y);
  });

  it("can lay out connected selected nodes together or place them singly", async () => {
    const graph = getFixedLayout(
      createGraph({
        nodes: [
          { id: "a", x: 0, y: 0, width: 40, height: 40 },
          { id: "b", x: 240, y: 0, width: 40, height: 40 },
        ],
        edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
      }),
      { direction: "right" },
    );
    const scope = { mode: "partial" as const, nodeIds: ["a", "b"], routing: "selected" as const };
    const connected = await getLayout({ graph, scope });
    const single = await getLayout({
      graph,
      scope: { ...scope, placement: { components: "single" as const } },
    });
    expect(single.graph.nodes.map((n) => [n.x, n.y])).toEqual(graph.nodes.map((n) => [n.x, n.y]));
    expect(connected.graph.nodes[1]!.x - connected.graph.nodes[0]!.x).toBeLessThan(240);
  });

  it("arranges selected nodes around fixed nodes with deterministic output", async () => {
    const graph = fixture();
    const request = { graph, scope: { mode: "partial" as const, nodeIds: ["a", "b"] } };
    const first = await getLayout(request),
      second = await getLayout(request);
    expect(first.graph).toEqual(second.graph);
    expect(first.graph.nodes[2]).toEqual(graph.nodes[2]);
    expect(first.graph.nodes[0]!.width).toBe(80);
  });
});

describe("geometry constraints", () => {
  it("aligns edge labels without changing routes or endpoint positions", async () => {
    const graph = fixture();
    graph.edges.push({ ...graph.edges[0]!, id: "ab2", x: 240, y: 150 });
    const result = await getLayout({
      graph,
      scope: { mode: "partial", edgeIds: ["ab", "ab2"], edgeGeometry: "labels" },
      constraints: [
        c.align({
          id: "align",
          entities: [
            { edgeId: "ab", part: "label" },
            { edgeId: "ab2", part: "label" },
          ],
          axis: "x",
          anchor: "center",
        }),
      ],
    });
    expect(result.graph.edges[0]!.x).toBe(result.graph.edges[1]!.x);
    expect(result.graph.edges.map((e) => e.points)).toEqual(graph.edges.map((e) => e.points));
    expect(result.graph.nodes).toEqual(graph.nodes);
  });
  it("satisfies equal gaps with unequal node dimensions and fixed anchors", async () => {
    const graph = fixture();
    graph.nodes[0]!.y = 0;
    graph.nodes[1]!.y = 300;
    graph.nodes[2]!.y = 90;
    const result = await getLayout({
      graph,
      scope: { mode: "partial", nodeIds: ["obstacle"] },
      constraints: [
        c.distribute({
          id: "gaps",
          entities: [{ nodeId: "a" }, { nodeId: "obstacle" }, { nodeId: "b" }],
          axis: "y",
        }),
      ],
    });
    expect(result.graph.nodes[2]!.y).toBe(130);
    expect(result.graph.nodes[0]).toEqual(graph.nodes[0]);
    expect(result.graph.nodes[1]).toEqual(graph.nodes[1]);
  });
  it("supports linear inequalities and reports unsatisfied soft constraints", async () => {
    const graph = fixture();
    const result = await getLayout({
      graph,
      scope: { mode: "partial", nodeIds: ["a"] },
      constraints: [
        c.linear({
          id: "bound",
          terms: [{ entity: { nodeId: "a" }, attribute: "x", coefficient: 1 }],
          relation: "ge",
          value: 50,
        }),
        c.pin({ id: "preference", entity: { nodeId: "a" }, x: 0, strength: "weak" }),
      ],
    });
    expect(result.graph.nodes[0]!.x).toBeGreaterThanOrEqual(50);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "CONSTRAINT_VIOLATION", constraintIds: ["preference"] }),
    );
  });
  it("constraint references never grant movement permission", async () => {
    await expect(
      getLayout({
        graph: fixture(),
        scope: { mode: "partial", edgeIds: ["ab"] },
        constraints: [c.pin({ id: "fixed", entity: { nodeId: "a" }, x: 100 })],
      }),
    ).rejects.toMatchObject({ code: "UNSATISFIED_CONSTRAINT" });
  });
  it("routes through required waypoints and rejects excluded route changes", async () => {
    const graph = fixture();
    const constraint = c.waypoint({ id: "via", edgeId: "ab", point: { x: 270, y: 120 } });
    const result = await getLayout({
      graph,
      scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" },
      constraints: [constraint],
    });
    expect(result.graph.edges[0]!.points!.some((p) => p.x === 270 && p.y === 120)).toBe(true);
    await expect(
      getLayout({
        graph,
        scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "labels" },
        constraints: [constraint],
      }),
    ).rejects.toMatchObject({ code: "UNSATISFIED_CONSTRAINT" });
  });
  it("rejects an impossible required waypoint inside an obstacle", async () => {
    await expect(
      getLayout({
        graph: fixture(),
        scope: { mode: "partial", edgeIds: ["ab"] },
        constraints: [c.waypoint({ id: "blocked", edgeId: "ab", point: { x: 180, y: 20 } })],
      }),
    ).rejects.toMatchObject({ code: "UNSATISFIED_CONSTRAINT" });
  });
  it("rejects unsupported algorithm constraints instead of ignoring them", async () => {
    await expect(
      getLayout({
        graph: fixture(),
        algorithm: "fixed",
        constraints: [c.pin({ id: "pin", entity: { nodeId: "a" }, x: 1 })],
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_LAYOUT" });
  });
  it("applies geometry constraints to full native layout", async () => {
    const result = await getLayout({
      graph: fixture(),
      constraints: [c.pin({ id: "pin", entity: { nodeId: "a" }, x: 100, y: 200 })],
    });
    expect(result.graph.nodes[0]).toMatchObject({ x: 100, y: 200 });
  });
});

describe("authoring boundary cases", () => {
  it.each(["up", "down", "left", "right"] as const)(
    "routes deterministically in %s direction",
    async (direction) => {
      const graph = fixture();
      const result = await getLayout({
        graph,
        options: { direction },
        scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" },
      });
      expect(result.graph.nodes).toEqual(graph.nodes);
      expect(result.graph.edges[0]!.points!.length).toBeGreaterThan(1);
      for (const node of graph.nodes)
        expect(routeCrosses(result.graph.edges[0]!.points, node)).toBe(false);
      expect(result.diagnostics.some((d) => d.code === "ROUTE_BLOCKED")).toBe(false);
    },
  );
  it("keeps unrelated edges unchanged", async () => {
    const graph = fixture();
    graph.edges.push({ ...graph.edges[0]!, id: "other", y: 180 });
    const result = await getLayout({
      graph,
      scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" },
    });
    expect(result.graph.edges[1]).toEqual(graph.edges[1]);
    expect(result.patches.every((p) => "id" in p && p.id === "ab")).toBe(true);
  });
  it("rejects duplicate constraint IDs and non-finite expressions", async () => {
    const pin = c.pin({ id: "pin", entity: { nodeId: "a" }, x: 1 });
    await expect(
      getLayout({
        graph: fixture(),
        scope: { mode: "partial", nodeIds: ["a"] },
        constraints: [pin, pin],
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONSTRAINT" });
    await expect(
      getLayout({
        graph: fixture(),
        scope: { mode: "partial", nodeIds: ["a"] },
        constraints: [{ ...pin, x: NaN }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONSTRAINT" });
  });
  it("relaxes an impossible soft waypoint without discarding a feasible required waypoint", async () => {
    const result = await getLayout({
      graph: fixture(),
      scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" },
      constraints: [
        c.waypoint({ id: "required", edgeId: "ab", point: { x: 270, y: 120 } }),
        c.waypoint({ id: "soft", edgeId: "ab", point: { x: 180, y: 20 }, strength: "weak" }),
      ],
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "CONSTRAINT_VIOLATION", constraintIds: ["soft"] }),
    );
    expect(result.graph.edges[0]!.points).toContainEqual({ x: 270, y: 120 });
  });
  it("preserves relative port geometry and connects to the named port", async () => {
    const graph = fixture();
    graph.nodes[0]!.ports = [
      { name: "out", direction: "out", data: null, x: 80, y: 10, width: 0, height: 0 },
    ];
    graph.edges[0]!.sourcePort = "out";
    const result = await getLayout({
      graph,
      scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" },
    });
    expect(result.graph.nodes).toEqual(graph.nodes);
    expect(result.graph.edges[0]!.points![0]).toEqual({ x: 80, y: 10 });
  });
  it("routes a self-loop without crossing its node interior", async () => {
    const graph = fixture();
    graph.edges[0]!.targetId = "a";
    const result = await getLayout({
      graph,
      scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" },
    });
    expect(routeCrosses(result.graph.edges[0]!.points, graph.nodes[0]!)).toBe(false);
    expect(result.graph.edges[0]!.points!.length).toBeGreaterThan(2);
  });
  it("respects labels-only permissions even when node movement needs routing", async () => {
    const graph = fixture();
    const result = await getLayout({
      graph,
      scope: { mode: "partial", nodeIds: ["a"], edgeGeometry: "labels" },
      constraints: [c.pin({ id: "move", entity: { nodeId: "a" }, y: 150 })],
    });
    expect(result.graph.edges[0]!.points).toEqual(graph.edges[0]!.points);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "ROUTE_REPAIR_REQUIRED" }),
    );
  });
  it("reports label-only constraint movement with routes preserved", async () => {
    const graph = fixture();
    const result = await getLayout({
      graph,
      scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "labels" },
      constraints: [c.pin({ id: "label", entity: { edgeId: "ab", part: "label" }, y: 200 })],
    });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "ROUTE_PRESERVED" }));
    expect(result.graph.edges[0]!.points).toEqual(graph.edges[0]!.points);
  });
});

it("rejects incomplete named port geometry instead of using the node center", async () => {
  const graph = fixture();
  graph.nodes[0]!.ports = [{ name: "out", data: null }] as (typeof graph.nodes)[0]["ports"];
  graph.edges[0]!.sourcePort = "out";
  await expect(
    getLayout({ graph, scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" } }),
  ).rejects.toMatchObject({ code: "MISSING_GEOMETRY" });
});

it("reports required label repair without moving a fixed label", async () => {
  const graph = fixture();
  graph.edges[0]!.x = 180;
  graph.edges[0]!.y = 10;
  graph.edges[0]!.width = 20;
  const result = await getLayout({
    graph,
    scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" },
  });
  expect(result.graph.edges[0]).toMatchObject({ x: 180, y: 10 });
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: "LABEL_REPAIR_REQUIRED", entityIds: ["ab"] }),
  );
});

it("requires dimensions for measured labels and rejects invalid node measurement", async () => {
  const graph = fixture();
  const incomplete = {
    ...graph,
    edges: graph.edges.map((e) => ({ ...e, label: "hello", width: undefined })),
  };
  await expect(
    getLayout({ graph: incomplete, scope: { mode: "partial", edgeIds: ["ab"] } }),
  ).rejects.toMatchObject({ code: "MISSING_GEOMETRY" });
  const unmeasured = createGraph({ nodes: [{ id: "a" }], edges: [] });
  await expect(
    getLayout({
      graph: unmeasured,
      options: { measure: () => ({ width: NaN, height: 20 }) },
      scope: { mode: "partial", nodeIds: ["a"] },
    }),
  ).rejects.toMatchObject({ code: "MISSING_GEOMETRY" });
});

it("routes sibling edges in their parent frame and crossing edges in world coordinates", async () => {
  const graph = getFixedLayout(
    createGraph({
      nodes: [
        { id: "parent", x: 100, y: 200, width: 400, height: 200 },
        { id: "a", parentId: "parent", x: 20, y: 30, width: 60, height: 40 },
        { id: "b", parentId: "parent", x: 200, y: 30, width: 60, height: 40 },
        { id: "outside", x: 600, y: 230, width: 60, height: 40 },
      ],
      edges: [
        { id: "inside", sourceId: "a", targetId: "b" },
        { id: "cross", sourceId: "b", targetId: "outside" },
      ],
    }),
    { direction: "right" },
  );
  const result = await getLayout({
    graph,
    scope: { mode: "partial", edgeIds: ["inside", "cross"], edgeGeometry: "routes" },
  });
  expect(result.graph.nodes).toEqual(graph.nodes);
  expect(result.graph.edges[0]!.points![0]).toEqual({ x: 80, y: 50 });
  expect(result.graph.edges[0]!.points!.at(-1)).toEqual({ x: 200, y: 50 });
  expect(result.graph.edges[1]!.points![0]).toEqual({ x: 360, y: 250 });
  expect(result.graph.edges[1]!.points!.at(-1)).toEqual({ x: 600, y: 250 });
  const reordered = await getLayout({
    graph: { ...graph, nodes: [...graph.nodes.slice(1), graph.nodes[0]!] },
    scope: { mode: "partial", edgeIds: ["inside", "cross"], edgeGeometry: "routes" },
  });
  expect(reordered.graph.edges).toEqual(result.graph.edges);
});

it("solves nested leaf constraints in world coordinates and returns parent-relative patches", async () => {
  const graph = getFixedLayout(
    createGraph({
      nodes: [
        { id: "parent", x: 100, y: 200, width: 400, height: 400 },
        { id: "child", parentId: "parent", x: 30, y: 30, width: 40, height: 40 },
      ],
      edges: [],
    }),
  );
  const result = await getLayout({
    graph,
    scope: { mode: "partial", nodeIds: ["child"] },
    constraints: [c.pin({ id: "world", entity: { nodeId: "child" }, x: 180, y: 280 })],
  });
  expect(result.graph.nodes[0]).toEqual(graph.nodes[0]);
  expect(result.graph.nodes[1]).toMatchObject({ x: 80, y: 80 });
  expect(result.diagnostics.some((d) => d.code === "CONTAINMENT_VIOLATION")).toBe(false);
  const patched = structuredClone(graph);
  applyPatches(patched, [...result.patches]);
  expect(patched).toEqual(result.graph);
});

it("rejects cyclic parent frames without recursing indefinitely", async () => {
  const graph = fixture();
  graph.nodes[0]!.parentId = "b";
  graph.nodes[1]!.parentId = "a";
  await expect(
    getLayout({ graph, scope: { mode: "partial", edgeIds: ["ab"] } }),
  ).rejects.toMatchObject({ code: "INVALID_GRAPH" });
});

describe("review regressions", () => {
  it("persists the partial direction override for subsequent requests", async () => {
    const first = await getLayout({
      graph: fixture(),
      options: { direction: "down" },
      scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" },
    });
    expect(first.graph.direction).toBe("down");
    const next = await getLayout({
      graph: first.graph,
      scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" },
    });
    expect(next.graph.edges).toEqual(first.graph.edges);
  });
  it.each([undefined, []])(
    "preserves authored labels without a usable route: %j",
    async (points) => {
      const graph = fixture();
      graph.edges[0]!.points = points;
      const result = await getLayout({
        graph,
        scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "labels" },
      });
      expect(result.graph.edges).toEqual(graph.edges);
    },
  );
  it("routes local edges with many distant obstacles and a required waypoint", async () => {
    const graph = fixture();
    graph.nodes.push(
      ...Array.from({ length: 150 }, (_, i) => ({
        ...graph.nodes[2]!,
        id: `far-${i}`,
        x: 10000 + i * 100,
        y: 10000 + i * 100,
        width: 30,
        height: 30,
      })),
    );
    const result = await getLayout({
      graph,
      scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" },
      constraints: [c.waypoint({ id: "via", edgeId: "ab", point: { x: 110, y: 100 } })],
    });
    expect(result.diagnostics.some((d) => d.code === "ROUTE_BLOCKED")).toBe(false);
    for (const node of graph.nodes)
      expect(routeCrosses(result.graph.edges[0]!.points, node)).toBe(false);
  });
  it.each(["ORTHOGONAL", "SPLINES"] as const)(
    "preserves unrelated full-layout edges with %s routing",
    async (edgeRouting) => {
      const graph = fixture();
      const options = { settings: { edgeRouting } };
      const baseline = await getLayout({ graph, options });
      const result = await getLayout({
        graph,
        options,
        constraints: [c.pin({ id: "island", entity: { nodeId: "obstacle" }, x: 5000, y: 5000 })],
      });
      expect(result.graph.edges).toEqual(baseline.graph.edges);
    },
  );
  it("changes only a constraint-referenced label with custom full routing", async () => {
    const graph = fixture();
    const options = {
      strategies: {
        routeEdges: () => ({
          pointsByEdgeId: new Map([
            [
              "ab",
              [
                { x: 80, y: 20 },
                { x: 320, y: 20 },
              ],
            ],
          ]),
        }),
      },
    };
    const baseline = await getLayout({ graph, options });
    const result = await getLayout({
      graph,
      options,
      constraints: [
        c.pin({ id: "label", entity: { edgeId: "ab", part: "label" }, x: 500, y: 500 }),
      ],
    });
    expect(result.graph.edges[0]!.points).toEqual(baseline.graph.edges[0]!.points);
    expect(result.graph.edges[0]).toMatchObject({ x: 500, y: 500 });
  });
  it("explicitly rejects constrained full compound layout", async () => {
    const graph = createGraph({
      nodes: [{ id: "parent" }, { id: "child", parentId: "parent" }],
      edges: [],
    });
    await expect(
      getLayout({ graph, constraints: [c.pin({ id: "pin", entity: { nodeId: "child" }, x: 20 })] }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_LAYOUT" });
  });
});

describe("bounded authoring work", () => {
  function blocked() {
    return getFixedLayout(
      createGraph({
        nodes: [
          { id: "parent", x: 0, y: 0, width: 10, height: 10 },
          { id: "child", parentId: "parent", x: 0, y: 0, width: 20, height: 20 },
          ...Array.from({ length: 800 }, (_, i) => ({
            id: `fixed-${i}`,
            x: i * 30,
            y: i * 30,
            width: 25,
            height: 25,
          })),
        ],
        edges: [],
      }),
    );
  }
  it("bounds blocked candidate generation/evaluation and preserves the input", () => {
    const graph = blocked();
    let checks = 0;
    const context: LayoutExecutionContext = {
      scope: { mode: "partial", nodeIds: ["child"] },
      diagnostics: [],
      measurePhase: (_, run) => run(),
      throwIfAborted: () => {
        checks++;
      },
    };
    const result = runPartialLayout(graph, {}, context, (input) => input as typeof graph);
    expect(result.nodes).toEqual(graph.nodes);
    expect(context.diagnostics.some((d) => d.code === "PLACEMENT_BLOCKED")).toBe(true);
    expect(checks).toBeGreaterThan(1);
    expect(checks).toBeLessThan(3000);
  });
  it("checks cancellation during candidate generation", () => {
    const graph = blocked();
    let checks = 0;
    expect(() =>
      runPartialLayout(
        graph,
        {},
        {
          scope: { mode: "partial", nodeIds: ["child"] },
          diagnostics: [],
          measurePhase: (_, run) => run(),
          throwIfAborted: () => {
            if (++checks === 10) throw new Error("cancelled");
          },
        },
        (input) => input as typeof graph,
      ),
    ).toThrow("cancelled");
    expect(checks).toBe(10);
  });
  it("repairs a moved endpoint but preserves an unrelated full-layout edge", async () => {
    const graph = createGraph({
      nodes: ["a", "b", "c", "d"].map((id) => ({ id, width: 60, height: 40 })),
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "cd", sourceId: "c", targetId: "d" },
      ],
    });
    const baseline = await getLayout({ graph });
    const result = await getLayout({
      graph,
      constraints: [c.pin({ id: "move", entity: { nodeId: "a" }, x: 2000, y: 2000 })],
    });
    expect(result.graph.edges.find((e) => e.id === "ab")!.points).not.toEqual(
      baseline.graph.edges.find((e) => e.id === "ab")!.points,
    );
    expect(result.graph.edges.find((e) => e.id === "cd")).toEqual(
      baseline.graph.edges.find((e) => e.id === "cd"),
    );
    await expect(
      getLayout({
        graph,
        options: { settings: { edgeRouting: "SPLINES" } },
        constraints: [c.pin({ id: "move", entity: { nodeId: "a" }, x: 2000, y: 2000 })],
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_LAYOUT" });
  });
});
