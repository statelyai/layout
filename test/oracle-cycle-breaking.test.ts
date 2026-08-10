import { createGraph } from "@statelyai/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { breakCyclesGreedily, getLayeredLayout, type CycleBreakingStrategy } from "../src";

interface EdgeFixture {
  id: string;
  sourceId: string;
  targetId: string;
  priority?: number;
}

async function getElkFeedbackEdges(nodeIds: string[], edges: EdgeFixture[]): Promise<Set<string>> {
  const elk = new ELK();
  const result = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.randomSeed": "1",
      "elk.layered.feedbackEdges": "true",
    },
    children: nodeIds.map((id) => ({ id, width: 20, height: 20 })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.sourceId],
      targets: [edge.targetId],
      ...(edge.priority === undefined
        ? {}
        : { layoutOptions: { "elk.layered.priority.direction": String(edge.priority) } }),
    })),
  });
  const xByNodeId = new Map(result.children?.map((node) => [String(node.id), node.x ?? 0]));
  return new Set(
    edges
      .filter(
        (edge) =>
          edge.sourceId !== edge.targetId &&
          (xByNodeId.get(edge.sourceId) ?? 0) > (xByNodeId.get(edge.targetId) ?? 0),
      )
      .map((edge) => edge.id),
  );
}

function getNativeFeedbackEdges(nodeIds: string[], edges: EdgeFixture[]): Set<string> {
  const graph = createGraph({
    nodes: nodeIds.map((id) => ({ id })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      data: { priority: edge.priority },
    })),
  });
  return new Set(
    breakCyclesGreedily({
      graph,
      sizes: new Map(),
      direction: "right",
      spacing: { node: 40, layer: 60 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      constrainedLayerByNodeId: new Map(),
      settings: { randomSeed: 1 },
      edgeSettings: (edge) => ({
        "priority.direction": (edge.data as { priority?: number }).priority,
      }),
    }).reversedEdgeIds,
  );
}

describe("ELK greedy cycle-breaking oracle", () => {
  const fixtures: Array<{ nodes: string[]; edges: EdgeFixture[] }> = [
    {
      nodes: ["a", "b", "c"],
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "bc", sourceId: "b", targetId: "c" },
        { id: "ca", sourceId: "c", targetId: "a" },
      ],
    },
    {
      nodes: ["a", "b", "c", "d"],
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "bc", sourceId: "b", targetId: "c" },
        { id: "ca", sourceId: "c", targetId: "a" },
        { id: "cd", sourceId: "c", targetId: "d" },
        { id: "db", sourceId: "d", targetId: "b" },
      ],
    },
    {
      nodes: ["a", "b", "c", "d", "e"],
      edges: [
        { id: "ab", sourceId: "a", targetId: "b" },
        { id: "bc", sourceId: "b", targetId: "c" },
        { id: "ca", sourceId: "c", targetId: "a" },
        { id: "cd", sourceId: "c", targetId: "d" },
        { id: "de", sourceId: "d", targetId: "e" },
        { id: "ec", sourceId: "e", targetId: "c" },
        { id: "aa", sourceId: "a", targetId: "a" },
      ],
    },
    {
      nodes: ["a", "b", "c"],
      edges: [
        { id: "ab", sourceId: "a", targetId: "b", priority: 20 },
        { id: "bc", sourceId: "b", targetId: "c" },
        { id: "ca", sourceId: "c", targetId: "a" },
      ],
    },
  ];

  for (const [index, fixture] of fixtures.entries()) {
    it(`matches feedback edges for fixture ${index + 1}`, async () => {
      await expect(getElkFeedbackEdges(fixture.nodes, fixture.edges)).resolves.toEqual(
        getNativeFeedbackEdges(fixture.nodes, fixture.edges),
      );
    });
  }
});

describe("ELK cycle-breaking strategy oracle", () => {
  const nodes = [
    { id: "a", x: 80 },
    { id: "b", x: 20 },
    { id: "c", x: 50 },
    { id: "d", x: 110 },
  ];
  const edges: EdgeFixture[] = [
    { id: "ab", sourceId: "a", targetId: "b" },
    { id: "bc", sourceId: "b", targetId: "c" },
    { id: "ca", sourceId: "c", targetId: "a" },
    { id: "cd", sourceId: "c", targetId: "d" },
    { id: "db", sourceId: "d", targetId: "b" },
  ];

  const strategies: CycleBreakingStrategy[] = [
    "DEPTH_FIRST",
    "INTERACTIVE",
    "MODEL_ORDER",
    "GREEDY_MODEL_ORDER",
    "SCC_CONNECTIVITY",
    "SCC_NODE_TYPE",
    "DFS_NODE_ORDER",
    "BFS_NODE_ORDER",
  ];

  for (const strategy of strategies) {
    it(`matches ${strategy}`, async () => {
      const elk = new ELK();
      const elkResult = await elk.layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.randomSeed": "1",
          "elk.layered.cycleBreaking.strategy": strategy,
          "elk.layered.feedbackEdges": "true",
        },
        children: nodes.map((node) => ({ ...node, y: 0, width: 20, height: 20 })),
        edges: edges.map((edge) => ({
          id: edge.id,
          sources: [edge.sourceId],
          targets: [edge.targetId],
        })),
      });
      const elkX = new Map(elkResult.children?.map((node) => [String(node.id), node.x ?? 0]));
      const expected = new Set(
        edges
          .filter(
            (edge) =>
              (elkX.get(edge.sourceId) ?? 0) > (elkX.get(edge.targetId) ?? 0) &&
              edge.sourceId !== edge.targetId,
          )
          .map((edge) => edge.id),
      );

      const graph = createGraph({
        nodes: nodes.map((node) => ({ ...node, width: 20, height: 20 })),
        edges,
      });
      const native = getLayeredLayout(graph, {
        direction: "right",
        settings: { "cycleBreaking.strategy": strategy, randomSeed: 1 },
      });
      const nativeX = new Map(native.nodes.map((node) => [node.id, node.x]));
      const actual = new Set(
        edges
          .filter(
            (edge) =>
              (nativeX.get(edge.sourceId) ?? 0) > (nativeX.get(edge.targetId) ?? 0) &&
              edge.sourceId !== edge.targetId,
          )
          .map((edge) => edge.id),
      );

      expect(actual).toEqual(expected);
    });
  }
});
