import { describe, expect, it } from "vitest";
import {
  compileStatechartLayout,
  layoutStatechart,
  scoreStatechartLayout,
  type ElkNode,
} from "../src/elkjs";
import babyfood from "./fixtures/babyfood-statechart.json";

const scopes = {
  babyfood: { initialNodeId: "babyfood.waiting", direction: "RIGHT" as const },
  "babyfood.intro": { initialNodeId: "babyfood.intro.smallAmount", direction: "DOWN" as const },
  "babyfood.monitoring": {
    initialNodeId: "babyfood.monitoring.normal",
    direction: "DOWN" as const,
  },
};
const cycle: ElkNode = {
  id: "root",
  children: ["c", "a", "b"].map((id) => ({ id, width: 100, height: 50 })),
  edges: [
    ["a", "b"],
    ["b", "c"],
    ["c", "a"],
  ].map(([source, target]) => ({ id: source + target, sources: [source], targets: [target] })),
};

describe("statechart policy layout", () => {
  it("anchors a cycle in every direction without mutating the input", async () => {
    const original = structuredClone(cycle);
    for (const direction of ["UP", "DOWN", "LEFT", "RIGHT"] as const) {
      const result = await layoutStatechart(cycle, {
        scopes: { root: { initialNodeId: "a", direction } },
      });
      expect(result.paths.root).toEqual(["a", "b", "c"]);
      expect(result.score.pathOrder).toBe(0);
      expect(result.score.invalid).toBe(0);
      expect(result.attempts).toHaveLength(3);
    }
    expect(cycle).toEqual(original);
  });

  it("compiles the babyfood initial paths, shared exit and mixed directions", async () => {
    const before = structuredClone(babyfood);
    const plan = compileStatechartLayout(babyfood, scopes);
    expect(plan.paths["babyfood.intro"]).toEqual(
      ["smallAmount", "observe", "monitorBurp", "waitNextFeeding"].map(
        (id) => `babyfood.intro.${id}`,
      ),
    );
    expect(plan.paths["babyfood.monitoring"]).toEqual([
      "babyfood.monitoring.normal",
      "babyfood.monitoring.allergyWatch",
    ]);
    expect(plan.commonExits.babyfood).toEqual(["babyfood.allergyCheck"]);
    const result = await layoutStatechart(babyfood as ElkNode, { scopes });
    expect(result.score.overlaps).toBeLessThan(result.attempts[0].score.overlaps);
    const intro = result.graph.children!.find((node) => node.id === "babyfood.intro")!;
    expect([...intro.children!].sort((a, b) => a.y! - b.y!).map((node) => node.id)).toEqual(
      plan.paths["babyfood.intro"],
    );
    const monitoring = result.graph.children!.find((node) => node.id === "babyfood.monitoring")!;
    const normal = monitoring.children!.find((node) => node.id === "babyfood.monitoring.normal")!;
    const allergyWatch = monitoring.children!.find(
      (node) => node.id === "babyfood.monitoring.allergyWatch",
    )!;
    expect(normal.y! + normal.height!).toBeLessThan(allergyWatch.y!);
    const semantics = (node: ElkNode): unknown[] => [
      ...(node.edges ?? []).map((edge) => [
        edge.id,
        edge.sources,
        edge.targets,
        edge.labels?.map((label) => label.text),
      ]),
      ...(node.children ?? []).flatMap(semantics),
    ];
    expect(semantics(result.graph)).toEqual(semantics(before));
    expect(result.score.pathOrder).toBe(0);
    expect(result.score.invalid).toBe(0);
    expect(babyfood).toEqual(before);
    expect(
      result.graph.edges?.map((edge) => [
        edge.id,
        edge.sources,
        edge.targets,
        edge.labels?.map((label) => label.text),
      ]),
    ).toEqual(
      before.edges.map((edge) => [
        edge.id,
        edge.sources,
        edge.targets,
        edge.labels.map((label) => label.text),
      ]),
    );
  });

  it("stops inference at ambiguity and validates explicit paths", () => {
    const graph = structuredClone(cycle);
    graph.edges!.push({ id: "ac", sources: ["a"], targets: ["c"] });
    expect(compileStatechartLayout(graph, { root: { initialNodeId: "a" } }).paths.root).toEqual([
      "a",
    ]);
    expect(
      compileStatechartLayout(graph, { root: { preferredPath: ["a", "b", "c"] } }).paths.root,
    ).toEqual(["a", "b", "c"]);
    expect(() => compileStatechartLayout(graph, { root: { preferredPath: ["b", "a"] } })).toThrow(
      "Disconnected",
    );
    expect(() => compileStatechartLayout(graph, { missing: {} })).toThrow("Unknown");
    expect(() =>
      compileStatechartLayout(graph, { root: { initialNodeId: "b", preferredPath: ["a", "b"] } }),
    ).toThrow("initial");
    expect(() =>
      compileStatechartLayout(graph, { root: { initialNodeId: "a", preferredPath: [] } }),
    ).toThrow("initial");
  });

  it("bounds engine calls and keeps baseline when no policy improves it", async () => {
    const result = await layoutStatechart(cycle, { scopes: {}, maxAttempts: 1 });
    expect(result.attempts).toHaveLength(1);
    expect(result.attempt).toBe(0);
    await expect(layoutStatechart(cycle, { scopes: {}, maxAttempts: 4 })).rejects.toThrow(
      RangeError,
    );
  });

  it("respects authored strategy aliases and overrides direction aliases explicitly", async () => {
    const graph = structuredClone(cycle);
    graph.layoutOptions = {
      direction: "LEFT",
      "org.eclipse.elk.layered.cycleBreaking.strategy": "GREEDY",
    };
    const plan = compileStatechartLayout(graph, {
      root: { initialNodeId: "a", direction: "DOWN" },
    });
    expect(plan.graph.layoutOptions?.["elk.layered.cycleBreaking.strategy"]).toBeUndefined();
    expect(plan.graph.layoutOptions?.direction).toBe("DOWN");
    const result = await layoutStatechart(graph, {
      scopes: { root: { direction: "DOWN" } },
      maxAttempts: 1,
    });
    expect(result.graph.layoutOptions?.direction).toBe("DOWN");
  });

  it("deduplicates port successors and preserves all parallel transitions", async () => {
    const graph: ElkNode = {
      id: "r",
      children: [
        { id: "a", width: 100, height: 50, ports: [{ id: "out", width: 1, height: 1 }] },
        { id: "b", width: 100, height: 50 },
      ],
      edges: ["first", "second", "third"].map((id) => ({
        id,
        sources: ["out"],
        targets: ["b"],
        labels: [{ text: id, width: 40, height: 30 }],
      })),
    };
    const result = await layoutStatechart(graph, { scopes: { r: { initialNodeId: "a" } } });
    expect(result.paths.r).toEqual(["a", "b"]);
    expect(result.graph.edges).toHaveLength(3);
    expect(result.attempt).toBe(2);
    expect(result.attempts[2].score.overlaps).toBeLessThan(result.attempts[1].score.overlaps);
    expect(result.graph.edges?.[1].labels?.[0].layoutOptions).toMatchObject({
      "elk.edgeLabels.placement": "HEAD",
    });
    expect(result.graph.edges?.[2].labels?.[0].layoutOptions).toMatchObject({
      "elk.edgeLabels.placement": "TAIL",
    });
    expect(graph.edges?.[1].layoutOptions).toBeUndefined();
  });

  it("scores an unspecified compound direction using the adapter default", async () => {
    const graph: ElkNode = {
      id: "outer",
      layoutOptions: { "elk.direction": "DOWN", "elk.hierarchyHandling": "INCLUDE_CHILDREN" },
      children: [structuredClone(cycle)],
    };
    const result = await layoutStatechart(graph, { scopes: { root: { initialNodeId: "a" } } });
    expect(result.score.pathOrder).toBe(0);
  });

  it("scores invalid geometry, node/label overlap and proper route crossings", () => {
    const score = scoreStatechartLayout({
      id: "r",
      width: 200,
      height: 200,
      children: [
        { id: "a", x: 0, y: 0, width: 20, height: 20 },
        { id: "b", x: 10, y: 10, width: 20, height: 20 },
      ],
      edges: [
        { id: "x", sections: [{ startPoint: { x: 0, y: 50 }, endPoint: { x: 100, y: 50 } }] },
        { id: "y", sections: [{ startPoint: { x: 50, y: 0 }, endPoint: { x: 50, y: 100 } }] },
        { id: "missing" },
      ],
    });
    expect(score).toEqual({
      invalid: 1,
      overlaps: 1,
      pathOrder: 0,
      crossings: 1,
      bends: 0,
      routeLength: 200,
    });
  });

  it("excludes no-layout aliases from candidate scoring", () => {
    const score = scoreStatechartLayout({
      id: "r",
      width: 100,
      height: 100,
      children: [{ id: "fixed", layoutOptions: { "elk.noLayout": "true" } }],
      edges: [
        {
          id: "edge",
          sections: [{ startPoint: { x: 0, y: 0 }, endPoint: { x: 10, y: 0 } }],
          labels: [
            {
              text: "fixed",
              properties: { "org.eclipse.elk.noLayout": "true" },
            },
          ],
        },
      ],
    });
    expect(score.invalid).toBe(0);
  });
});
