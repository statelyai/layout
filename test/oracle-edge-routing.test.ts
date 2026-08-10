import { createGraph } from "@statelyai/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge } from "elkjs/lib/elk-api";
import { expect, it } from "vitest";
import { getLayeredLayout } from "../src";

const nodes = [
  { id: "a", width: 30, height: 20 },
  { id: "b", width: 20, height: 50 },
  { id: "c", width: 40, height: 25 },
  { id: "d", width: 20, height: 30 },
  { id: "e", width: 30, height: 15 },
];
const edges = [
  { id: "ac", sourceId: "a", targetId: "c" },
  { id: "bc", sourceId: "b", targetId: "c" },
  { id: "bd", sourceId: "b", targetId: "d" },
  { id: "ce", sourceId: "c", targetId: "e" },
  { id: "de", sourceId: "d", targetId: "e" },
];

for (const edgeRouting of ["ORTHOGONAL", "POLYLINE", "SPLINES"] as const) {
  it(`matches ELK ${edgeRouting} implicit-port routes`, async () => {
    const oracle = await new ELK().layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.separateConnectedComponents": "false",
        "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
        "elk.layered.crossingMinimization.strategy": "NONE",
        "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.edgeRouting": edgeRouting,
      },
      children: structuredClone(nodes),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.sourceId],
        targets: [edge.targetId],
      })),
    });
    const native = getLayeredLayout(createGraph({ nodes, edges }), {
      direction: "right",
      settings: {
        "layering.strategy": "LONGEST_PATH_SOURCE",
        "crossingMinimization.strategy": "NONE",
        "crossingMinimization.greedySwitch.type": "OFF",
        "nodePlacement.strategy": "BRANDES_KOEPF",
        edgeRouting,
      },
    });

    for (const edge of oracle.edges ?? []) {
      const section = (edge as ElkExtendedEdge).sections?.[0];
      const expected = section
        ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
        : [];
      const actual = native.edges.find((candidate) => candidate.id === edge.id)?.points ?? [];
      expect(actual).toHaveLength(expected.length);
      actual.forEach((point, index) => {
        expect(point.x).toBeCloseTo(expected[index]?.x ?? Number.NaN, 12);
        expect(point.y).toBeCloseTo(expected[index]?.y ?? Number.NaN, 12);
      });
    }
  });
}

for (const splineMode of ["CONSERVATIVE", "CONSERVATIVE_SOFT"] as const) {
  it(`matches ELK ${splineMode} spline control points`, async () => {
    const splineNodes = [
      { id: "a", width: 30, height: 20 },
      { id: "b", width: 20, height: 50 },
      { id: "c", width: 40, height: 25 },
    ];
    const splineEdges = [
      { id: "ac", sourceId: "a", targetId: "c" },
      { id: "bc", sourceId: "b", targetId: "c" },
    ];
    const oracle = await new ELK().layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.edgeRouting": "SPLINES",
        "elk.layered.edgeRouting.splines.mode": splineMode,
        "elk.separateConnectedComponents": "false",
        "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
        "elk.layered.crossingMinimization.strategy": "NONE",
        "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      },
      children: structuredClone(splineNodes),
      edges: splineEdges.map((edge) => ({
        id: edge.id,
        sources: [edge.sourceId],
        targets: [edge.targetId],
      })),
    });
    const native = getLayeredLayout(createGraph({ nodes: splineNodes, edges: splineEdges }), {
      settings: {
        edgeRouting: "SPLINES",
        "edgeRouting.splines.mode": splineMode,
        separateConnectedComponents: false,
        "layering.strategy": "LONGEST_PATH_SOURCE",
        "crossingMinimization.strategy": "NONE",
        "crossingMinimization.greedySwitch.type": "OFF",
        "nodePlacement.strategy": "BRANDES_KOEPF",
      },
    });
    for (const edge of oracle.edges ?? []) {
      const section = (edge as ElkExtendedEdge).sections?.[0];
      const expected = section
        ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
        : [];
      const actual = native.edges.find((candidate) => candidate.id === edge.id)?.points ?? [];
      expect(actual).toHaveLength(expected.length);
      actual.forEach((point, index) => {
        expect(point.x).toBeCloseTo(expected[index]?.x ?? Number.NaN, 12);
        expect(point.y).toBeCloseTo(expected[index]?.y ?? Number.NaN, 12);
      });
    }
  });
}

it("matches ELK merged implicit edge endpoints", async () => {
  const mergeNodes = ["a", "b", "c", "d", "e"].map((id) => ({
    id,
    width: 30,
    height: 30,
  }));
  const mergeEdges = [
    ["a", "c"],
    ["b", "c"],
    ["c", "d"],
    ["c", "e"],
  ].map(([sourceId, targetId], index) => ({ id: `edge${index}`, sourceId, targetId }));
  const oracle = await new ELK().layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.mergeEdges": "true",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
      "elk.layered.crossingMinimization.strategy": "NONE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "SIMPLE",
    },
    children: structuredClone(mergeNodes),
    edges: mergeEdges.map((edge) => ({
      id: edge.id,
      sources: [edge.sourceId!],
      targets: [edge.targetId!],
    })),
  });
  const native = getLayeredLayout(
    createGraph({
      nodes: mergeNodes,
      edges: mergeEdges.map((edge) => ({
        ...edge,
        sourceId: edge.sourceId!,
        targetId: edge.targetId!,
      })),
    }),
    {
      settings: {
        edgeRouting: "ORTHOGONAL",
        mergeEdges: true,
        separateConnectedComponents: false,
        "layering.strategy": "LONGEST_PATH_SOURCE",
        "crossingMinimization.strategy": "NONE",
        "crossingMinimization.greedySwitch.type": "OFF",
        "nodePlacement.strategy": "SIMPLE",
      },
    },
  );
  expect(native.nodes.map((node) => [node.x, node.y])).toEqual(
    oracle.children?.map((node) => [node.x, node.y]),
  );
  for (const edge of oracle.edges ?? []) {
    const section = (edge as ElkExtendedEdge).sections?.[0];
    const actual = native.edges.find((candidate) => candidate.id === edge.id)?.points;
    expect(actual?.[0]).toEqual(section?.startPoint);
    expect(actual?.at(-1)).toEqual(section?.endPoint);
  }
});

for (const edgeRouting of ["ORTHOGONAL", "POLYLINE", "SPLINES"] as const) {
  it(`matches ELK ${edgeRouting} self-loop routing`, async () => {
    const loopNodes = [{ id: "a", width: 40, height: 30 }];
    const loopEdges = [{ id: "loop", sourceId: "a", targetId: "a" }];
    const oracle = await new ELK().layout({
      id: "root",
      layoutOptions: { "elk.algorithm": "layered", "elk.edgeRouting": edgeRouting },
      children: structuredClone(loopNodes),
      edges: [{ id: "loop", sources: ["a"], targets: ["a"] }],
    });
    const native = getLayeredLayout(createGraph({ nodes: loopNodes, edges: loopEdges }), {
      settings: { edgeRouting },
    });
    const oracleNode = oracle.children?.[0];
    const nativeNode = native.nodes[0];
    expect(nativeNode?.x).toBeCloseTo(oracleNode?.x ?? Number.NaN, 12);
    expect(nativeNode?.y).toBeCloseTo(oracleNode?.y ?? Number.NaN, 12);
    const section = (oracle.edges?.[0] as ElkExtendedEdge | undefined)?.sections?.[0];
    const expected = section
      ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
      : [];
    const actual = native.edges[0]?.points ?? [];
    expect(actual).toHaveLength(expected.length);
    actual.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expected[index]?.x ?? Number.NaN, 12);
      expect(point.y).toBeCloseTo(expected[index]?.y ?? Number.NaN, 12);
    });
  });
}
