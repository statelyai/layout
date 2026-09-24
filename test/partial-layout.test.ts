import { createGraph, applyPatches } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import { c, getLayout, getFixedLayout } from "../src";
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
