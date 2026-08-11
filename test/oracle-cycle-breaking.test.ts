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

  it("matches MODEL_ORDER flow alignment for reversed edges", async () => {
    const input = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.separateConnectedComponents": "false",
        "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
      },
      children: [
        { id: "a", width: 30, height: 20 },
        { id: "b", width: 40, height: 25 },
        { id: "c", width: 35, height: 30 },
        { id: "d", width: 30, height: 25 },
      ],
      edges: [
        { id: "ab", sources: ["a"], targets: ["b"] },
        { id: "ac", sources: ["a"], targets: ["c"] },
        { id: "bd", sources: ["b"], targets: ["d"] },
        { id: "dc", sources: ["d"], targets: ["c"] },
      ],
    };
    const oracle = await new ELK().layout(input);
    const native = getLayeredLayout(
      createGraph({
        nodes: input.children,
        edges: input.edges.map((edge) => ({
          id: edge.id,
          sourceId: edge.sources[0]!,
          targetId: edge.targets[0]!,
        })),
      }),
      {
        direction: "right",
        settings: {
          edgeRouting: "ORTHOGONAL",
          separateConnectedComponents: false,
          "cycleBreaking.strategy": "MODEL_ORDER",
        },
      },
    );
    for (const expectedNode of oracle.children ?? []) {
      const actualNode = native.nodes.find(({ id }) => id === expectedNode.id);
      expect(actualNode?.x).toBeCloseTo(expectedNode.x ?? Number.NaN, 12);
      expect(actualNode?.y).toBeCloseTo(expectedNode.y ?? Number.NaN, 12);
    }
    for (const expectedEdge of oracle.edges ?? []) {
      const section = expectedEdge.sections?.[0];
      const expectedPoints = section
        ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
        : [];
      const actualPoints = native.edges.find(({ id }) => id === expectedEdge.id)?.points ?? [];
      expect(actualPoints).toHaveLength(expectedPoints.length);
      expectedPoints.forEach((point, index) => {
        expect(actualPoints[index]?.x).toBeCloseTo(point.x, 12);
        expect(actualPoints[index]?.y).toBeCloseTo(point.y, 12);
      });
    }
  });
});

describe("ELK enforced cycle-breaking group order", () => {
  const nodeIds = ["a", "b", "c", "d"];
  const groupById = new Map([
    ["a", 2],
    ["b", 0],
    ["c", 1],
    ["d", 0],
  ]);
  const edges: EdgeFixture[] = [
    { id: "ab", sourceId: "a", targetId: "b" },
    { id: "bc", sourceId: "b", targetId: "c" },
    { id: "ca", sourceId: "c", targetId: "a" },
    { id: "cd", sourceId: "c", targetId: "d" },
    { id: "db", sourceId: "d", targetId: "b" },
  ];

  for (const strategy of [
    "MODEL_ORDER",
    "GREEDY_MODEL_ORDER",
    "DFS_NODE_ORDER",
    "BFS_NODE_ORDER",
    "SCC_CONNECTIVITY",
    "SCC_NODE_TYPE",
  ] as const) {
    it(`matches ${strategy}`, async () => {
      const expectedGraph = await new ELK().layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.cycleBreaking.strategy": strategy,
          "elk.layered.feedbackEdges": "true",
          "elk.layered.considerModelOrder.groupModelOrder.cbGroupOrderStrategy": "ENFORCED",
        },
        children: nodeIds.map((id) => ({
          id,
          width: 20,
          height: 20,
          layoutOptions: {
            "elk.layered.considerModelOrder.groupModelOrder.cycleBreakingId": String(
              groupById.get(id),
            ),
          },
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          sources: [edge.sourceId],
          targets: [edge.targetId],
        })),
      });
      const graph = createGraph({
        nodes: nodeIds.map((id) => ({ id })),
        edges,
      });
      const actualGraph = getLayeredLayout(graph, {
        direction: "right",
        settings: {
          "cycleBreaking.strategy": strategy,
          feedbackEdges: true,
          "considerModelOrder.groupModelOrder.cbGroupOrderStrategy": "ENFORCED",
        },
        nodeSettings: (node) => ({
          "considerModelOrder.groupModelOrder.cycleBreakingId": groupById.get(node.id),
        }),
      });
      const feedback = (positions: ReadonlyMap<string, number>): Set<string> =>
        new Set(
          edges
            .filter(
              (edge) => (positions.get(edge.sourceId) ?? 0) > (positions.get(edge.targetId) ?? 0),
            )
            .map((edge) => edge.id),
        );
      expect(feedback(new Map(actualGraph.nodes.map((node) => [node.id, node.x])))).toEqual(
        feedback(
          new Map(expectedGraph.children?.map((node) => [String(node.id), node.x ?? 0]) ?? []),
        ),
      );
    });
  }

  for (const groupOrder of ["ONLY_WITHIN_GROUP", "MODEL_ORDER", "ENFORCED"] as const) {
    it(`matches GREEDY_MODEL_ORDER with ${groupOrder} cycle groups`, async () => {
      const expected = await new ELK().layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.layered.cycleBreaking.strategy": "GREEDY_MODEL_ORDER",
          "elk.layered.feedbackEdges": "true",
          "elk.layered.considerModelOrder.groupModelOrder.cbGroupOrderStrategy": groupOrder,
        },
        children: nodeIds.map((id) => ({
          id,
          width: 20,
          height: 20,
          layoutOptions: {
            "elk.layered.considerModelOrder.groupModelOrder.cycleBreakingId": String(
              groupById.get(id),
            ),
          },
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          sources: [edge.sourceId],
          targets: [edge.targetId],
        })),
      });
      const actual = getLayeredLayout(
        createGraph({ nodes: nodeIds.map((id) => ({ id })), edges }),
        {
          settings: {
            "cycleBreaking.strategy": "GREEDY_MODEL_ORDER",
            feedbackEdges: true,
            "considerModelOrder.groupModelOrder.cbGroupOrderStrategy": groupOrder,
          },
          nodeSettings: (node) => ({
            "considerModelOrder.groupModelOrder.cycleBreakingId": groupById.get(node.id),
          }),
        },
      );
      const feedback = (positions: ReadonlyMap<string, number>) =>
        edges
          .filter(
            ({ sourceId, targetId }) =>
              (positions.get(sourceId) ?? 0) > (positions.get(targetId) ?? 0),
          )
          .map(({ id }) => id);
      expect(feedback(new Map(actual.nodes.map(({ id, x }) => [id, x])))).toEqual(
        feedback(new Map(expected.children?.map(({ id, x }) => [String(id), x ?? 0]) ?? [])),
      );
    });
  }

  for (const [option, value] of [
    ["cbPreferredSourceId", 2],
    ["cbPreferredTargetId", 1],
    ["cbPreferredSourceId", 99],
    ["cbPreferredTargetId", 99],
  ] as const) {
    it(`matches SCC_NODE_TYPE ${option}=${value}`, async () => {
      const rootOptions = {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.separateConnectedComponents": "false",
        "elk.layered.cycleBreaking.strategy": "SCC_NODE_TYPE",
        "elk.layered.feedbackEdges": "true",
        [`elk.layered.considerModelOrder.groupModelOrder.${option}`]: String(value),
      };
      const expectedGraph = await new ELK().layout({
        id: "root",
        layoutOptions: rootOptions,
        children: nodeIds.map((id) => ({
          id,
          width: 20,
          height: 20,
          layoutOptions: {
            "elk.layered.considerModelOrder.groupModelOrder.cycleBreakingId": String(
              groupById.get(id),
            ),
          },
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          sources: [edge.sourceId],
          targets: [edge.targetId],
        })),
      });
      const actualGraph = getLayeredLayout(
        createGraph({ nodes: nodeIds.map((id) => ({ id })), edges }),
        {
          direction: "right",
          settings: {
            "cycleBreaking.strategy": "SCC_NODE_TYPE",
            feedbackEdges: true,
            [`considerModelOrder.groupModelOrder.${option}`]: value,
          },
          nodeSettings: (node) => ({
            "considerModelOrder.groupModelOrder.cycleBreakingId": groupById.get(node.id),
          }),
        },
      );
      const feedback = (positions: ReadonlyMap<string, number>): Set<string> =>
        new Set(
          edges
            .filter(
              (edge) => (positions.get(edge.sourceId) ?? 0) > (positions.get(edge.targetId) ?? 0),
            )
            .map((edge) => edge.id),
        );

      expect(feedback(new Map(actualGraph.nodes.map((node) => [node.id, node.x])))).toEqual(
        feedback(
          new Map(expectedGraph.children?.map((node) => [String(node.id), node.x ?? 0]) ?? []),
        ),
      );
    });
  }
});
