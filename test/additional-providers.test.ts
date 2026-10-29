import { createGraph } from "@statelyai/graph";
import OracleELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import {
  forceAlgorithm,
  getForceLayout,
  getLayout,
  getRadialLayout,
  getStressLayout,
  getTreeLayout,
  radialAlgorithm,
  stressAlgorithm,
  treeAlgorithm,
} from "../src";
import ELK from "../src/elkjs";

const algorithms = [treeAlgorithm, radialAlgorithm, forceAlgorithm, stressAlgorithm];
const nodes = [
  { id: "a", width: 120, height: 48, data: { name: "A" } },
  { id: "b", width: 80, height: 35, data: { name: "B" } },
  { id: "c", width: 160, height: 50, data: { name: "C" } },
  { id: "d", width: 40, height: 100, data: { name: "D" } },
];
const edges = [
  { id: "ab", sourceId: "a", targetId: "b", data: { guard: "ok" } },
  { id: "ac", sourceId: "a", targetId: "c", data: { guard: "other" } },
];
const fixture = () =>
  createGraph({
    nodes: structuredClone(nodes),
    edges: structuredClone(edges),
    data: { title: "example" },
  });
const input = () => ({
  id: "root",
  children: structuredClone(nodes),
  edges: edges.map(({ id, sourceId, targetId }) => ({
    id,
    sources: [sourceId],
    targets: [targetId],
  })),
});

function expectFinite(graph: Awaited<ReturnType<typeof getLayout>>["graph"]) {
  for (const node of graph.nodes)
    expect([node.x, node.y, node.width, node.height].every(Number.isFinite)).toBe(true);
  for (const edge of graph.edges) {
    expect(edge.points?.length).toBeGreaterThanOrEqual(2);
    expect(
      edge.points?.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
    ).toBe(true);
  }
}

describe("additional native providers", () => {
  for (const algorithm of algorithms) {
    it(`${algorithm.id} handles measured disconnected graphs without mutation`, async () => {
      const graph = fixture(),
        original = structuredClone(graph);
      const result = await getLayout({ graph, algorithm: algorithm.id });
      expectFinite(result.graph);
      expect(graph).toEqual(original);
      expect(result.graph.data).toEqual(graph.data);
      expect(result.graph.nodes.map((node) => node.data)).toEqual(
        graph.nodes.map((node) => node.data),
      );
      expect(result.graph.edges.map((edge) => edge.data)).toEqual(
        graph.edges.map((edge) => edge.data),
      );
      expect(result.patches.length).toBeGreaterThan(0);
    });
    it(`${algorithm.id} handles empty and singleton graphs`, async () => {
      for (const children of [[], [nodes[0]!]]) {
        const result = await getLayout({
          graph: createGraph({ nodes: children, edges: [] }),
          algorithm: algorithm.id,
        });
        expectFinite(result.graph);
        expect(result.graph.nodes).toHaveLength(children.length);
      }
    });
    it(`${algorithm.id} rejects unsupported scopes and explicit ports`, async () => {
      const graph = fixture();
      await expect(
        getLayout({ graph, algorithm: algorithm.id, scope: { mode: "partial", nodeIds: ["a"] } }),
      ).rejects.toThrow("partial");
      await expect(
        getLayout({
          graph: createGraph({ nodes: [{ id: "a", ports: [{ name: "p" }] }], edges: [] }),
          algorithm: algorithm.id,
        }),
      ).rejects.toThrow("ports");
    });
  }
  it("tree separates measured subtrees and changes direction", () => {
    const down = getTreeLayout(fixture()),
      right = getTreeLayout(fixture(), { direction: "right" });
    expect(down.nodes.find((n) => n.id === "b")!.y).toBeGreaterThan(down.nodes[0]!.y);
    expect(right.nodes.find((n) => n.id === "b")!.x).toBeGreaterThan(right.nodes[0]!.x);
    expect(getTreeLayout(fixture(), { spacing: 100 })).not.toEqual(down);
  });
  it("mrtree spans cycles while radial rejects them", () => {
    const graph = fixture();
    graph.edges.push({
      id: "ba",
      sourceId: "b",
      targetId: "a",
      type: "edge",
      data: { guard: "cycle" },
    });
    expectFinite(getTreeLayout(graph));
    expect(() => getRadialLayout(graph)).toThrow("requires a tree");
    expectFinite(getForceLayout(graph));
    expectFinite(getStressLayout(graph));
  });
  it("radial avoids overlaps in a wide nonuniform star", () => {
    const graph = createGraph({
      nodes: Array.from({ length: 30 }, (_, i) => ({
        id: String(i),
        width: 100 + i * 3,
        height: 30 + i * 2,
      })),
      edges: Array.from({ length: 29 }, (_, i) => ({
        id: `e${i}`,
        sourceId: "0",
        targetId: String(i + 1),
      })),
    });
    const result = getRadialLayout(graph);
    for (let i = 0; i < result.nodes.length; i++)
      for (let j = i + 1; j < result.nodes.length; j++) {
        const a = result.nodes[i]!,
          b = result.nodes[j]!;
        expect(
          a.x + a.width <= b.x + 1e-6 ||
            b.x + b.width <= a.x + 1e-6 ||
            a.y + a.height <= b.y + 1e-6 ||
            b.y + b.height <= a.y + 1e-6,
        ).toBe(true);
      }
    expect(getRadialLayout(fixture(), { radius: 1000 })).not.toEqual(getRadialLayout(fixture()));
  });
  it("force repeats seeded models and responds to iterations and model", () => {
    const graph = fixture();
    expect(getForceLayout(graph, { seed: 7 })).toEqual(getForceLayout(graph, { seed: 7 }));
    expect(getForceLayout(graph, { seed: 8 })).not.toEqual(getForceLayout(graph, { seed: 7 }));
    expect(getForceLayout(graph, { iterations: 0 })).not.toEqual(getForceLayout(graph));
    expect(getForceLayout(graph, { model: "EADES" })).not.toEqual(getForceLayout(graph));
  });
  it("radial keeps zero-sized coincident nodes finite", () => {
    const graph = createGraph({
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
    });
    expectFinite(
      getRadialLayout(graph, {
        measure: () => ({ width: 0, height: 0 }),
        radius: 0,
        spacing: 0,
      }),
    );
  });
  it("force uses the pinned default model and orders components by node priority", () => {
    expect(getForceLayout(fixture())).toEqual(
      getForceLayout(fixture(), { model: "FRUCHTERMAN_REINGOLD" }),
    );
    const graph = createGraph({
      nodes: [
        { id: "a", width: 40, height: 20 },
        { id: "b", width: 40, height: 20 },
      ],
      edges: [],
    });
    const result = getForceLayout(graph, { priority: (node) => (node.id === "b" ? 2 : 1) });
    expect(result.nodes[1]!.x).toBeLessThan(result.nodes[0]!.x);
    const connected = createGraph({
      nodes: ["a", "b", "c"].map((id) => ({ id, width: 40, height: 20 })),
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "bc", sourceId: "b", targetId: "c" },
      ],
    });
    for (const model of ["EADES", "FRUCHTERMAN_REINGOLD"] as const) {
      expect(
        getForceLayout(connected, {
          model,
          seed: 7,
          priority: (node) => (node.id === "a" ? 100 : 1),
        }),
      ).not.toEqual(getForceLayout(connected, { model, seed: 7 }));
    }
  });
  it.each([getTreeLayout, getRadialLayout])(
    "lays out deep chains without recursive stack limits",
    (layout) => {
      const graph = createGraph({
        nodes: Array.from({ length: 5000 }, (_, i) => ({ id: String(i), width: 40, height: 20 })),
        edges: Array.from({ length: 4999 }, (_, i) => ({
          id: `e${i}`,
          sourceId: String(i),
          targetId: String(i + 1),
        })),
      });
      const result = layout(graph);
      expect(result.nodes).toHaveLength(5000);
      expectFinite(result);
    },
  );
  it("stress honors desired lengths, edge overrides, fixed anchors and locked axes", () => {
    const graph = createGraph({
      nodes: [
        { id: "a", width: 20, height: 20, x: 100, y: 80 },
        { id: "b", width: 20, height: 20, x: 300, y: 90 },
      ],
      edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
    });
    const result = getStressLayout(graph, { desiredEdgeLength: 200 });
    expect(
      Math.hypot(result.nodes[0]!.x - result.nodes[1]!.x, result.nodes[0]!.y - result.nodes[1]!.y),
    ).toBeCloseTo(200, 4);
    const override = getStressLayout(graph, { edgeLength: () => 300 });
    expect(
      Math.hypot(
        override.nodes[0]!.x - override.nodes[1]!.x,
        override.nodes[0]!.y - override.nodes[1]!.y,
      ),
    ).toBeCloseTo(300, 4);
    const fixed = getStressLayout(graph, { fixed: (n) => n.id === "a" });
    expect(fixed.nodes[0]).toMatchObject({ x: 100, y: 80 });
    const locked = getStressLayout(graph, { dimension: "X" });
    expect(locked.nodes.map((n) => n.y)).toEqual([80, 90]);
    expect(getStressLayout(graph, { seed: 7 })).toEqual(getStressLayout(graph, { seed: 7 }));
  });
});

describe("additional ELK adapter providers", () => {
  for (const { id } of algorithms) {
    for (const alias of [id, `elk.${id}`, `org.eclipse.elk.${id}`])
      it(`${alias} computes actual geometry`, async () => {
        const result = await new ELK().layout({
          ...input(),
          layoutOptions: { "elk.algorithm": alias },
        });
        expect(result.children?.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(
          true,
        );
        expect(result.edges?.every((e) => e.sections?.length)).toBe(true);
      });
    it(`${id} matches the oracle singleton and padding geometry`, async () => {
      const graph: ElkNode = {
        id: "root",
        children: [{ id: "a", width: 120, height: 48 }],
        layoutOptions: { "elk.algorithm": id },
      };
      const [actual, expected] = await Promise.all([
        new ELK().layout(structuredClone(graph)),
        new OracleELK().layout(structuredClone(graph)),
      ]);
      expect({ width: actual.width, height: actual.height, children: actual.children }).toEqual({
        width: expected.width,
        height: expected.height,
        children: expected.children?.map(({ id, x, y, width, height }) => ({
          id,
          x,
          y,
          width,
          height,
        })),
      });
    });
    it(`${id} rejects unsupported provider options and hyperedges`, async () => {
      await expect(
        new ELK().layout({
          ...input(),
          layoutOptions: { "elk.algorithm": id, [`elk.${id}.notImplemented`]: "true" },
        }),
      ).rejects.toThrow("not implemented");
      const graph = input();
      graph.edges[0]!.targets.push("c");
      await expect(
        new ELK().layout({ ...graph, layoutOptions: { "elk.algorithm": id } }),
      ).rejects.toThrow("hyperedges");
    });
  }
  it("bundled constructor algorithm lists do not filter inventory, matching real bundled ELK", async () => {
    for (const algorithms of [[], ["mrtree"], ["unknown"]]) {
      const [actual, expected] = await Promise.all([
        new ELK({ algorithms }).knownLayoutAlgorithms(),
        new OracleELK({ algorithms }).knownLayoutAlgorithms(),
      ]);
      expect(actual).toEqual(expected);
    }
  });
  it("preserves the pinned radial cycle exception", async () => {
    const graph = input();
    graph.edges.push({ id: "ba", sources: ["b"], targets: ["a"] });
    await expect(
      new ELK().layout({ ...graph, layoutOptions: { "elk.algorithm": "radial" } }),
    ).rejects.toThrow("java.lang.IllegalArgumentException: The given graph is not a tree!");
  });
  it("matches category discovery", async () => {
    expect(await new ELK().knownLayoutCategories()).toEqual(
      await new OracleELK().knownLayoutCategories(),
    );
  });
  it("graph options override call options which override constructor defaults", async () => {
    const elk = new ELK({ defaultLayoutOptions: { "elk.algorithm": "unknown" } });
    const result = await elk.layout(
      { ...input(), layoutOptions: { "elk.algorithm": "radial" } },
      { layoutOptions: { "elk.algorithm": "force" } },
    );
    expect(result.children?.length).toBe(4);
    const result2 = await elk.layout(input(), { layoutOptions: { "elk.algorithm": "mrtree" } });
    expect(result2.children?.length).toBe(4);
  });
});
