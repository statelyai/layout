import { createGraph } from "@statelyai/graph";
import type { LayoutFn } from "@statelyai/graph/layout";
import { describe, expect, it } from "vitest";
import {
  getLayeredLayout,
  getLayout,
  breakCyclesGreedily,
  breakCyclesWithDepthFirstSearch,
  routeEdgesOrthogonally,
  type LayeredLayoutOptions,
} from "../src";

const asGraphLayout: LayoutFn<LayeredLayoutOptions> = getLayeredLayout;
void asGraphLayout;

function createDiamond() {
  return createGraph({
    id: "diamond",
    nodes: [
      { id: "a", width: 80, height: 40, data: { role: "start" } },
      { id: "b", width: 80, height: 40 },
      { id: "c", width: 80, height: 40 },
      { id: "d", width: 80, height: 40 },
    ],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b" },
      { id: "ac", sourceId: "a", targetId: "c" },
      { id: "bd", sourceId: "b", targetId: "d" },
      { id: "cd", sourceId: "c", targetId: "d" },
    ],
  });
}

describe("getLayeredLayout", () => {
  it("preserves authored geometry when noLayout is enabled", () => {
    const graph = createGraph({
      nodes: [{ id: "a", x: 100, y: 200, width: 30, height: 20 }],
      edges: [],
    });
    const result = getLayeredLayout(graph, { settings: { noLayout: true } });
    expect(result.nodes[0]).toMatchObject({ x: 100, y: 200, width: 30, height: 20 });
  });
  it("lays out a graph without mutating it", () => {
    const graph = createDiamond();
    const before = structuredClone(graph);
    const result = getLayeredLayout(graph, { direction: "right" });

    expect(graph).toEqual(before);
    expect(result.nodes.find((node) => node.id === "a")?.x).toBeLessThan(
      result.nodes.find((node) => node.id === "b")?.x ?? 0,
    );
    expect(result.nodes.find((node) => node.id === "b")?.x).toBe(
      result.nodes.find((node) => node.id === "c")?.x,
    );
    expect(result.nodes.find((node) => node.id === "d")?.x).toBeGreaterThan(
      result.nodes.find((node) => node.id === "b")?.x ?? Infinity,
    );
    expect(result.nodes[0]?.data).toEqual({ role: "start" });
    expect(result.edges.every((edge) => edge.routing === "orthogonal")).toBe(true);
  });

  it("is deterministic for cyclic graphs", () => {
    const graph = createGraph({
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "bc", sourceId: "b", targetId: "c" },
        { id: "ca", sourceId: "c", targetId: "a" },
        { id: "aa", sourceId: "a", targetId: "a" },
      ],
    });

    expect(getLayeredLayout(graph)).toEqual(getLayeredLayout(graph));
    expect(getLayeredLayout(graph).edges.find((edge) => edge.id === "aa")?.points).toHaveLength(4);
  });

  it("lays out named ports and routes through them", () => {
    const graph = createGraph({
      nodes: [
        {
          id: "a",
          ports: [{ name: "out", direction: "out" }],
        },
        {
          id: "b",
          ports: [{ name: "in", direction: "in" }],
        },
      ],
      edges: [
        {
          id: "ab",
          sourceId: "a",
          sourcePort: "out",
          targetId: "b",
          targetPort: "in",
        },
      ],
    });

    const result = getLayeredLayout(graph, { direction: "right" });
    const source = result.nodes.find((node) => node.id === "a");
    const sourcePort = source?.ports?.[0];
    const routeStart = result.edges[0]?.points?.[0];

    expect(sourcePort?.x).toBe(source?.width);
    expect(routeStart?.x).toBe((source?.x ?? 0) + (sourcePort?.x ?? 0) + (sourcePort?.width ?? 0));
  });

  it("accepts a custom routing strategy", () => {
    const graph = createDiamond();
    let called = false;
    const result = getLayeredLayout(graph, {
      strategies: {
        routeEdges(input, orientation, placement) {
          called = true;
          return routeEdgesOrthogonally(input, orientation, placement);
        },
      },
    });

    expect(called).toBe(true);
    expect(result.edges[0]?.points?.length).toBeGreaterThan(1);
  });

  it("splits long edges for ordering and joins their routes", () => {
    const graph = createGraph({
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "bc", sourceId: "b", targetId: "c" },
        { id: "ac", sourceId: "a", targetId: "c" },
      ],
    });

    const result = getLayeredLayout(graph, {
      direction: "right",
      settings: { unnecessaryBendpoints: true },
    });
    const longEdge = result.edges.find((edge) => edge.id === "ac");
    const middleLayerX = result.nodes.find((node) => node.id === "b")?.x ?? 0;

    expect(longEdge?.points?.some((point) => point.x === middleLayerX)).toBe(true);
    expect(result.nodes.some((node) => node.id.startsWith("__layout_dummy:"))).toBe(false);
  });

  it("selects orthogonal, polyline, and spline routing", () => {
    const graph = createGraph({
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
    });

    const polyline = getLayeredLayout(graph, {
      direction: "right",
      settings: { edgeRouting: "POLYLINE" },
    });
    const splines = getLayeredLayout(graph, {
      direction: "right",
      settings: { edgeRouting: "SPLINES" },
    });

    expect(polyline.edges[0]?.routing).toBe("polyline");
    expect(polyline.edges[0]?.points).toHaveLength(2);
    expect(splines.edges[0]?.routing).toBe("splines");
    expect(splines.edges[0]?.points?.length).toBeGreaterThanOrEqual(2);
  });

  it("breaks cycles without consuming the JavaScript call stack", () => {
    const nodeCount = 20_000;
    const graph = createGraph({
      nodes: Array.from({ length: nodeCount }, (_, index) => ({
        id: `n${index}`,
      })),
      edges: Array.from({ length: nodeCount }, (_, index) => ({
        id: `e${index}`,
        sourceId: `n${index}`,
        targetId: `n${(index + 1) % nodeCount}`,
      })),
    });
    const result = breakCyclesWithDepthFirstSearch({
      graph,
      sizes: new Map(),
      direction: "down",
      spacing: { node: 40, layer: 60 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      constrainedLayerByNodeId: new Map(),
      settings: {},
    });

    expect(result.reversedEdgeIds.size).toBe(1);
  });

  it("matches ELK greedy cycle breaking for the seeded feedback-edge fixture", () => {
    const graph = createGraph({
      nodes: ["a", "b", "c", "d"].map((id) => ({ id })),
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "bc", sourceId: "b", targetId: "c" },
        { id: "ca", sourceId: "c", targetId: "a" },
        { id: "cd", sourceId: "c", targetId: "d" },
        { id: "db", sourceId: "d", targetId: "b" },
      ],
    });

    const result = breakCyclesGreedily({
      graph,
      sizes: new Map(),
      direction: "right",
      spacing: { node: 40, layer: 60 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      constrainedLayerByNodeId: new Map(),
      settings: { randomSeed: 1 },
    });

    // elkjs 0.11.1 with feedbackEdges=true routes only bc against the flow.
    expect([...result.reversedEdgeIds]).toEqual(["bc"]);
  });

  it("uses ELK's GREEDY default and accepts DEPTH_FIRST explicitly", () => {
    const graph = createGraph({
      nodes: ["a", "b", "c", "d"].map((id) => ({ id })),
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "bc", sourceId: "b", targetId: "c" },
        { id: "ca", sourceId: "c", targetId: "a" },
        { id: "cd", sourceId: "c", targetId: "d" },
        { id: "db", sourceId: "d", targetId: "b" },
      ],
    });

    const greedy = getLayeredLayout(graph, { direction: "right" });
    const depthFirst = getLayeredLayout(graph, {
      direction: "right",
      settings: { "cycleBreaking.strategy": "DEPTH_FIRST" },
    });

    expect(greedy).not.toEqual(depthFirst);
  });
});

describe("getLayout", () => {
  it("returns graph patches, diagnostics, and phase timings", async () => {
    const result = await getLayout({ graph: createDiamond() });

    expect(result.patches.length).toBeGreaterThan(0);
    expect(result.diagnostics).toEqual([]);
    expect(result.metrics.phases.map((phase) => phase.id)).toEqual([
      "cycle-breaking",
      "layer-assignment",
      "long-edge-splitting",
      "crossing-minimization",
      "node-placement",
      "port-margin-normalization",
      "edge-routing",
      "post-compaction",
      "long-edge-joining",
    ]);
  });

  it("exposes unsupported layout scopes explicitly", async () => {
    const graph = createDiamond();
    const previous = getLayeredLayout(graph);

    await expect(
      getLayout({
        graph,
        scope: { mode: "partial", previous, nodeIds: ["b"] },
      }),
    ).rejects.toThrow("does not support partial layout yet");
  });

  it("supports AbortSignal cancellation", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));

    await expect(getLayout({ graph: createDiamond(), signal: controller.signal })).rejects.toThrow(
      "stop",
    );
  });
});
