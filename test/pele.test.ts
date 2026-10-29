import ELK from "../src/elkjs";
import { createGraph } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import {
  getLayout,
  getLayoutAlgorithm,
  getLayoutRoutes,
  getPeleLayout,
  peleAlgorithm,
  routeToPolylines,
} from "../src";

import { requestGraph } from "./fixtures/pele-request";

function expectNoOverlaps(graph: ReturnType<typeof getPeleLayout>) {
  const rectangles = [...graph.nodes, ...graph.edges.filter((e) => e.width > 0 && e.height > 0)];
  for (let i = 0; i < rectangles.length; i++) {
    const a = rectangles[i]!;
    for (const b of rectangles.slice(i + 1)) {
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(overlapX > 0.1 && overlapY > 0.1, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  }
}

describe("Pele layout", () => {
  it("runs through the public algorithm interface without mutating input", async () => {
    const graph = requestGraph();
    const before = structuredClone(graph);
    const result = await getLayout({ graph, algorithm: "pele" });
    expect(getLayoutAlgorithm("pele")).toBe(peleAlgorithm);
    expect(result.graph).toEqual(getPeleLayout(graph));
    expect(graph).toEqual(before);
    expect(result.patches.length).toBeGreaterThan(0);
    expect(result.diagnostics).toEqual([]);
    expect(result.metrics.phases[0]?.id).toBe("pele");
  });

  it("keeps the native Pele algorithm separate from ELK discovery", async () => {
    const elk = new ELK();
    expect(
      (await elk.knownLayoutAlgorithms()).some((algorithm) => algorithm.id.includes("pele")),
    ).toBe(false);
    await expect(
      elk.layout({ id: "g", layoutOptions: { "elk.algorithm": "pele" } }),
    ).rejects.toThrow(/not found/);
  });

  it.each(["down", "up", "left", "right"] as const)(
    "keeps descriptions and guards, with no box overlaps going %s",
    (direction) => {
      const graph = requestGraph(true);
      const result = getPeleLayout(graph, { direction });
      expectNoOverlaps(result);
      expect(result.nodes.map((n) => n.data)).toEqual(graph.nodes.map((n) => n.data));
      expect(result.edges.map((e) => e.data)).toEqual(graph.edges.map((e) => e.data));
      expect(result.nodes.every((n) => n.width === 300 && n.height === 96)).toBe(true);
      const queued = result.nodes[0]!;
      const checking = result.nodes[1]!;
      if (direction === "down") expect(queued.y + queued.height).toBeLessThan(checking.y);
      if (direction === "up") expect(checking.y + checking.height).toBeLessThan(queued.y);
      if (direction === "right") expect(queued.x + queued.width).toBeLessThan(checking.x);
      if (direction === "left") expect(checking.x + checking.width).toBeLessThan(queued.x);
      const routes = getLayoutRoutes(result);
      expect(routes).toBe(result.compoundRoutes);
      expect(
        [...routes.values()].some((r) =>
          r.sections.some((s) => s.path.segments.some((p) => p.kind === "cubic")),
        ),
      ).toBe(true);
      for (const edge of result.edges) {
        const route = routes.get(edge.id)!;
        expect(route.status).toBe("routed");
        expect(route.label?.bounds).toEqual({
          x: edge.x,
          y: edge.y,
          width: edge.width,
          height: edge.height,
        });
        expect(route.sections).toHaveLength(2);
        expect(
          routeToPolylines(route)
            .flat()
            .every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
        ).toBe(true);
      }
    },
  );

  it("places shared outcomes together and keeps the two main flow pairs nearly aligned", () => {
    const input = requestGraph();
    for (const edge of input.edges)
      if (/IF|ELSE/.test(edge.label ?? "")) {
        edge.width = 0;
        edge.height = 0;
        edge.label = "";
      }
    const result = getPeleLayout(input);
    const [queued, checking, converting, checked, rejected, correction, applied] = result.nodes;
    expect(queued!.x + queued!.width / 2).toBeCloseTo(checking!.x + checking!.width / 2);
    expect(
      Math.abs(converting!.x + converting!.width / 2 - checked!.x - checked!.width / 2),
    ).toBeLessThanOrEqual(16);
    expect(converting!.x).toBeGreaterThan(checking!.x);
    expect(rejected!.y).toBeCloseTo(correction!.y);
    expect(correction!.y).toBeCloseTo(applied!.y);
  });

  it("keeps the measured request graph's curves out of node and guard interiors", () => {
    const graph = getPeleLayout(requestGraph(true));
    const boxes = [...graph.nodes, ...graph.edges];
    for (const route of getLayoutRoutes(graph).values()) {
      for (const point of routeToPolylines(route, { tolerance: 0.25 }).flat()) {
        for (const box of boxes) {
          const inside =
            point.x > box.x + 0.5 &&
            point.x < box.x + box.width - 0.5 &&
            point.y > box.y + 0.5 &&
            point.y < box.y + box.height - 0.5;
          expect(inside, `${route.edgeId} enters ${box.id}`).toBe(false);
        }
      }
    }
  });

  it("honors measured sizes and spacing deterministically", () => {
    const graph = requestGraph();
    const options = {
      measure: () => ({ width: 400, height: 120 }),
      measureLabel: () => ({ width: 220, height: 80 }),
      spacing: { node: 80, layer: 100 },
    };
    const result = getPeleLayout(graph, options);
    expect(result).toEqual(getPeleLayout(graph, options));
    expect(result.nodes.every((n) => n.width === 400 && n.height === 120)).toBe(true);
    expect(result.edges.every((e) => e.width === 220 && e.height === 80)).toBe(true);
    expectNoOverlaps(result);
  });

  it("routes cycles, parallel edges, and self loops", () => {
    const graph = createGraph({
      nodes: [
        { id: "a", width: 120, height: 60 },
        { id: "b", width: 120, height: 60 },
      ],
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "ab2", sourceId: "a", targetId: "b" },
        { id: "ba", sourceId: "b", targetId: "a" },
        { id: "loop", sourceId: "a", targetId: "a", width: 80, height: 20 },
      ],
    });
    const result = getPeleLayout(graph);
    expectNoOverlaps(result);
    expect(
      result.edges.every(
        (e) =>
          (e.points?.length ?? 0) > 1 &&
          e.points?.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      ),
    ).toBe(true);
    expect(result.edges[0]!.points).not.toEqual(result.edges[1]!.points);
  });

  it("supports empty graphs, isolated nodes, and a lone self loop", () => {
    for (const graph of [
      createGraph({ nodes: [] }),
      createGraph({ nodes: [{ id: "a" }, { id: "b" }] }),
      createGraph({ nodes: [{ id: "a" }], edges: [{ id: "loop", sourceId: "a", targetId: "a" }] }),
    ]) {
      const result = getPeleLayout(graph);
      expect(result.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    }
  });

  it("rejects unsupported hierarchy, ports, constraints, scopes and invalid sizes explicitly", async () => {
    expect(() =>
      getPeleLayout(createGraph({ nodes: [{ id: "a" }, { id: "b", parentId: "a" }] })),
    ).toThrow(/nested/);
    expect(() =>
      getPeleLayout(createGraph({ nodes: [{ id: "a", ports: [{ name: "out" }] }] })),
    ).toThrow(/ports/);
    expect(() => getPeleLayout(requestGraph(), { spacing: { node: -1 } })).toThrow(/nonnegative/);
    expect(() =>
      getPeleLayout(requestGraph(), { measure: () => ({ width: NaN, height: 30 }) }),
    ).toThrow(/finite/);
    await expect(
      getLayout({
        graph: requestGraph(),
        algorithm: "pele",
        scope: { mode: "partial", nodeIds: ["Queued"] },
      }),
    ).rejects.toThrow(/partial/);
    const controller = new AbortController();
    controller.abort();
    await expect(
      getLayout({ graph: requestGraph(), algorithm: "pele", signal: controller.signal }),
    ).rejects.toThrow();
  });
});
