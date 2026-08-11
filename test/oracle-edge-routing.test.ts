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

for (const edgeRouting of ["UNDEFINED", "ORTHOGONAL", "POLYLINE", "SPLINES"] as const) {
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

for (const unnecessaryBendpoints of [false, true]) {
  it(`matches ELK unnecessary-bendpoint handling ${unnecessaryBendpoints}`, async () => {
    const longEdgeNodes = ["a", "b", "c"].map((id) => ({ id, width: 20, height: 20 }));
    const longEdges = [
      { id: "ab", sourceId: "a", targetId: "b" },
      { id: "bc", sourceId: "b", targetId: "c" },
      { id: "ac", sourceId: "a", targetId: "c" },
    ];
    const oracle = await new ELK().layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.layered.layering.strategy": "LONGEST_PATH",
        "elk.layered.unnecessaryBendpoints": String(unnecessaryBendpoints),
      },
      children: structuredClone(longEdgeNodes),
      edges: longEdges.map((edge) => ({
        id: edge.id,
        sources: [edge.sourceId],
        targets: [edge.targetId],
      })),
    });
    const native = getLayeredLayout(createGraph({ nodes: longEdgeNodes, edges: longEdges }), {
      settings: { unnecessaryBendpoints },
    });
    const section = (oracle.edges?.find((edge) => edge.id === "ac") as ElkExtendedEdge | undefined)
      ?.sections?.[0];
    const expected = section
      ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
      : [];
    const actual = native.edges.find((edge) => edge.id === "ac")?.points ?? [];
    expect(actual).toHaveLength(expected.length);
    actual.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expected[index]?.x ?? Number.NaN, 12);
      expect(point.y).toBeCloseTo(expected[index]?.y ?? Number.NaN, 12);
    });
  });
}

for (const [edgeRouting, option, values] of [
  ["SPLINES", "edgeRouting.splines.sloppy.layerSpacingFactor", [0, 0.2, 0.8]],
  ["POLYLINE", "edgeRouting.polyline.slopedEdgeZoneWidth", [0, 2, 20]],
] as const) {
  for (const value of values) {
    it(`matches ELK ${option}=${value}`, async () => {
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
          [`elk.layered.${option}`]: String(value),
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
          [option]: value,
        },
      });

      expect(native.nodes.map((node) => node.x)).toEqual(oracle.children?.map((node) => node.x));
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
}

for (const splineMode of ["CONSERVATIVE", "CONSERVATIVE_SOFT", "SLOPPY"] as const) {
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

it("matches vertical model-order ports on a long-edge sink", async () => {
  const sinkNodes = [
    ["n0", 35, 26],
    ["n1", 34, 14],
    ["n2", 35, 25],
    ["n3", 10, 38],
    ["n4", 38, 10],
    ["n5", 25, 26],
  ].map(([id, width, height]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
  }));
  const sinkEdges = [
    [0, 3],
    [1, 3],
    [2, 3],
    [0, 4],
    [2, 4],
    [1, 5],
    [2, 5],
    [3, 5],
    [4, 5],
  ].map(([source, target]) => ({
    id: `e${source}-${target}`,
    sourceId: `n${source}`,
    targetId: `n${target}`,
  }));
  const oracle = await new ELK().layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "UP",
      "elk.edgeRouting": "POLYLINE",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "STRETCH_WIDTH",
      "elk.layered.crossingMinimization.strategy": "NONE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "SIMPLE",
    },
    children: structuredClone(sinkNodes),
    edges: sinkEdges.map(({ id, sourceId, targetId }) => ({
      id,
      sources: [sourceId],
      targets: [targetId],
    })),
  });
  const native = getLayeredLayout(createGraph({ nodes: sinkNodes, edges: sinkEdges }), {
    direction: "up",
    settings: {
      edgeRouting: "POLYLINE",
      separateConnectedComponents: false,
      "layering.strategy": "STRETCH_WIDTH",
      "crossingMinimization.strategy": "NONE",
      "crossingMinimization.greedySwitch.type": "OFF",
      "nodePlacement.strategy": "SIMPLE",
    },
  });
  for (const node of oracle.children ?? []) {
    const actual = native.nodes.find(({ id }) => id === node.id);
    expect(actual?.x).toBeCloseTo(node.x ?? Number.NaN, 12);
    expect(actual?.y).toBeCloseTo(node.y ?? Number.NaN, 12);
  }
  for (const edge of oracle.edges ?? []) {
    const section = (edge as ElkExtendedEdge).sections?.[0];
    const expected = section
      ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
      : [];
    const actual = native.edges.find(({ id }) => id === edge.id)?.points ?? [];
    expect(actual).toHaveLength(expected.length);
    actual.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expected[index]?.x ?? Number.NaN, 12);
      expect(point.y).toBeCloseTo(expected[index]?.y ?? Number.NaN, 12);
    });
  }
});

it("matches STRETCH_WIDTH spline dependency cycle breaking", async () => {
  const cycleNodes = [
    ["n0", 35, 13],
    ["n1", 24, 21],
    ["n2", 32, 24],
    ["n3", 22, 23],
    ["n4", 22, 37],
    ["n5", 12, 30],
  ].map(([id, width, height]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
  }));
  const cycleEdges = [
    [0, 1],
    [0, 2],
    [0, 4],
    [2, 4],
    [0, 5],
    [1, 5],
    [4, 5],
  ].map(([source, target]) => ({
    id: `e${source}-${target}`,
    sourceId: `n${source}`,
    targetId: `n${target}`,
  }));
  const oracle = await new ELK().layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "SPLINES",
      "elk.randomSeed": "9",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "STRETCH_WIDTH",
      "elk.layered.crossingMinimization.strategy": "NONE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "SIMPLE",
    },
    children: structuredClone(cycleNodes),
    edges: cycleEdges.map(({ id, sourceId, targetId }) => ({
      id,
      sources: [sourceId],
      targets: [targetId],
    })),
  });
  const native = getLayeredLayout(createGraph({ nodes: cycleNodes, edges: cycleEdges }), {
    settings: {
      edgeRouting: "SPLINES",
      randomSeed: 9,
      separateConnectedComponents: false,
      "layering.strategy": "STRETCH_WIDTH",
      "crossingMinimization.strategy": "NONE",
      "crossingMinimization.greedySwitch.type": "OFF",
      "nodePlacement.strategy": "SIMPLE",
    },
  });
  expect(native.nodes.map(({ x, y }) => [x, y])).toEqual(
    oracle.children?.map(({ x, y }) => [x, y]),
  );
  for (const edge of oracle.edges ?? []) {
    const section = (edge as ElkExtendedEdge).sections?.[0];
    const expected = section
      ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
      : [];
    const actual = native.edges.find(({ id }) => id === edge.id)?.points ?? [];
    expect(actual).toHaveLength(expected.length);
    actual.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expected[index]?.x ?? Number.NaN, 12);
      expect(point.y).toBeCloseTo(expected[index]?.y ?? Number.NaN, 12);
    });
  }
});

it("keeps near-straight long-edge segments in their dependency-derived orthogonal slot", async () => {
  const nodes = [
    ["n0", 15, 22],
    ["n1", 30, 36],
    ["n2", 27, 18],
    ["n3", 31, 37],
    ["n4", 29, 21],
    ["n5", 25, 32],
  ].map(([id, width, height]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
  }));
  const edges = [
    [0, 2],
    [1, 4],
    [2, 4],
    [1, 5],
    [3, 5],
  ].map(([source, target]) => ({
    id: `e${source}-${target}`,
    sourceId: `n${source}`,
    targetId: `n${target}`,
  }));
  const oracle = await new ELK().layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "LEFT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.randomSeed": "3",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "STRETCH_WIDTH",
      "elk.layered.crossingMinimization.strategy": "NONE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "SIMPLE",
    },
    children: structuredClone(nodes),
    edges: edges.map(({ id, sourceId, targetId }) => ({
      id,
      sources: [sourceId],
      targets: [targetId],
    })),
  });
  const native = getLayeredLayout(createGraph({ nodes, edges }), {
    direction: "left",
    settings: {
      edgeRouting: "ORTHOGONAL",
      randomSeed: 3,
      separateConnectedComponents: false,
      "layering.strategy": "STRETCH_WIDTH",
      "crossingMinimization.strategy": "NONE",
      "crossingMinimization.greedySwitch.type": "OFF",
      "nodePlacement.strategy": "SIMPLE",
    },
  });
  expect(native.nodes.map(({ x, y }) => [x, y])).toEqual(
    oracle.children?.map(({ x, y }) => [x, y]),
  );
  for (const edge of oracle.edges ?? []) {
    const section = (edge as ElkExtendedEdge).sections?.[0];
    const expected = section
      ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
      : [];
    const actual = native.edges.find(({ id }) => id === edge.id)?.points ?? [];
    expect(actual).toHaveLength(expected.length);
    actual.forEach((point, index) => {
      expect(point.x).toBeCloseTo(expected[index]?.x ?? Number.NaN, 12);
      expect(point.y).toBeCloseTo(expected[index]?.y ?? Number.NaN, 12);
    });
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
