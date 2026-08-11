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
  for (const expectedNode of oracle.children ?? []) {
    const actualNode = native.nodes.find(({ id }) => id === expectedNode.id);
    expect(actualNode?.x).toBeCloseTo(expectedNode.x ?? Number.NaN, 12);
    expect(actualNode?.y).toBeCloseTo(expectedNode.y ?? Number.NaN, 12);
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

it("appends long-edge dummies after normal nodes with model-order crossing minimization", async () => {
  const nodes = [
    ["n0", 26, 13],
    ["n1", 30, 27],
    ["n2", 35, 12],
    ["n3", 25, 34],
    ["n4", 31, 27],
    ["n5", 33, 22],
  ].map(([id, width, height]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
  }));
  const edges = [
    [0, 3],
    [0, 4],
    [1, 4],
    [3, 4],
  ].map(([source, target]) => ({
    id: `e${source}-${target}`,
    sourceId: `n${source}`,
    targetId: `n${target}`,
  }));
  const oracle = await new ELK().layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.edgeRouting": "POLYLINE",
      "elk.randomSeed": "5",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
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
    settings: {
      edgeRouting: "POLYLINE",
      randomSeed: 5,
      separateConnectedComponents: false,
      "layering.strategy": "NETWORK_SIMPLEX",
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

it("matches interactive target-port order with a long-edge spline", async () => {
  const nodes = [
    ["n0", 29, 18, 133, 73],
    ["n1", 15, 17, 169, 142],
    ["n2", 17, 27, 41, 147],
    ["n3", 40, 25, 53, 22],
    ["n4", 26, 27, 94, 100],
    ["n5", 14, 31, 11, 104],
  ].map(([id, width, height, x, y]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
    x: Number(x),
    y: Number(y),
  }));
  const edges = [
    [0, 1],
    [0, 3],
    [1, 3],
    [3, 4],
  ].map(([source, target]) => ({
    id: `e${source}-${target}`,
    sourceId: `n${source}`,
    targetId: `n${target}`,
  }));
  const oracle = await new ELK().layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.edgeRouting": "SPLINES",
      "elk.randomSeed": "9",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "INTERACTIVE",
    },
    children: structuredClone(nodes),
    edges: edges.map(({ id, sourceId, targetId }) => ({
      id,
      sources: [sourceId],
      targets: [targetId],
    })),
  });
  const native = getLayeredLayout(createGraph({ nodes, edges }), {
    settings: {
      edgeRouting: "SPLINES",
      randomSeed: 9,
      separateConnectedComponents: false,
      "layering.strategy": "NETWORK_SIMPLEX",
      "crossingMinimization.strategy": "INTERACTIVE",
      "crossingMinimization.greedySwitch.type": "OFF",
      "nodePlacement.strategy": "INTERACTIVE",
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

it("matches the minimum legal position for a RIGHT interactive long-edge spline", async () => {
  const nodes = [
    ["n0", 26, 24, 0, 75],
    ["n1", 26, 36, 124, 164],
    ["n2", 30, 14, 78, 156],
    ["n3", 14, 17, 58, 44],
    ["n4", 36, 14, 113, 80],
    ["n5", 34, 26, 165, 47],
  ].map(([id, width, height, x, y]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
    x: Number(x),
    y: Number(y),
  }));
  const edges = [
    [0, 1],
    [1, 2],
    [1, 4],
    [2, 4],
    [3, 4],
  ].map(([source, target]) => ({
    id: `e${source}-${target}`,
    sourceId: `n${source}`,
    targetId: `n${target}`,
  }));
  const options = {
    edgeRouting: "SPLINES" as const,
    randomSeed: 9,
    separateConnectedComponents: false,
    "layering.strategy": "BF_MODEL_ORDER" as const,
    "crossingMinimization.strategy": "INTERACTIVE" as const,
    "crossingMinimization.greedySwitch.type": "OFF" as const,
    "nodePlacement.strategy": "INTERACTIVE" as const,
  };
  const oracle = await new ELK().layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.edgeRouting": options.edgeRouting,
      "elk.randomSeed": String(options.randomSeed),
      "elk.separateConnectedComponents": String(options.separateConnectedComponents),
      "elk.layered.layering.strategy": options["layering.strategy"],
      "elk.layered.crossingMinimization.strategy": options["crossingMinimization.strategy"],
      "elk.layered.crossingMinimization.greedySwitch.type":
        options["crossingMinimization.greedySwitch.type"],
      "elk.layered.nodePlacement.strategy": options["nodePlacement.strategy"],
    },
    children: structuredClone(nodes),
    edges: edges.map(({ id, sourceId, targetId }) => ({
      id,
      sources: [sourceId],
      targets: [targetId],
    })),
  });
  const native = getLayeredLayout(createGraph({ nodes, edges }), { settings: options });
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

it("matches LEFT median-sweep long-edge ports and polyline joining", async () => {
  const nodes = [
    ["n0", 24, 15, 148, 143],
    ["n1", 13, 16, 94, 105],
    ["n2", 31, 31, 21, 113],
    ["n3", 34, 24, 89, 2],
    ["n4", 20, 40, 83, 181],
  ].map(([id, width, height, x, y]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
    x: Number(x),
    y: Number(y),
  }));
  const edges = [
    [0, 3],
    [1, 3],
    [2, 3],
    [0, 4],
    [1, 4],
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
      "elk.edgeRouting": "POLYLINE",
      "elk.randomSeed": "8",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "INTERACTIVE",
      "elk.layered.crossingMinimization.strategy": "MEDIAN_LAYER_SWEEP",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
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
      edgeRouting: "POLYLINE",
      randomSeed: 8,
      separateConnectedComponents: false,
      "layering.strategy": "INTERACTIVE",
      "crossingMinimization.strategy": "MEDIAN_LAYER_SWEEP",
      "crossingMinimization.greedySwitch.type": "OFF",
      "nodePlacement.strategy": "NETWORK_SIMPLEX",
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
    expect(actual).toEqual(expected);
  }
});

it("matches LEFT interactive physical-port spline ordering", async () => {
  const nodes = [
    ["n0", 29, 33, 51, 7],
    ["n1", 39, 26, 154, 23],
    ["n2", 28, 27, 134, 198],
    ["n3", 25, 40, 28, 85],
    ["n4", 21, 18, 143, 180],
    ["n5", 39, 19, 53, 46],
  ].map(([id, width, height, x, y]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
    x: Number(x),
    y: Number(y),
  }));
  const edges = [1, 3, 5].map((target) => ({
    id: `e0-${target}`,
    sourceId: "n0",
    targetId: `n${target}`,
  }));
  const oracle = await new ELK().layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "LEFT",
      "elk.edgeRouting": "SPLINES",
      "elk.randomSeed": "8",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "COFFMAN_GRAHAM",
      "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
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
      edgeRouting: "SPLINES",
      randomSeed: 8,
      separateConnectedComponents: false,
      "layering.strategy": "COFFMAN_GRAHAM",
      "crossingMinimization.strategy": "INTERACTIVE",
      "crossingMinimization.greedySwitch.type": "OFF",
      "nodePlacement.strategy": "NETWORK_SIMPLEX",
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

it("uses pre-placement source coordinates for leftward interactive long edges", async () => {
  const nodes = [
    ["n0", 38, 32, 111, 74],
    ["n1", 33, 20, 72, 90],
    ["n2", 25, 39, 132, 86],
    ["n3", 23, 30, 57, 103],
    ["n4", 12, 28, 174, 154],
    ["n5", 17, 28, 180, 199],
  ].map(([id, width, height, x, y]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
    x: Number(x),
    y: Number(y),
  }));
  const edges = [
    [3, 4],
    [1, 5],
    [2, 5],
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
      "elk.direction": "LEFT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.randomSeed": "3",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "BF_MODEL_ORDER",
      "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "INTERACTIVE",
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
      "layering.strategy": "BF_MODEL_ORDER",
      "crossingMinimization.strategy": "INTERACTIVE",
      "crossingMinimization.greedySwitch.type": "OFF",
      "nodePlacement.strategy": "INTERACTIVE",
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

it("compacts leftward interactive routing gaps and ranks near-straight dummy segments", async () => {
  const nodes = [
    ["n0", 40, 27, 44, 72],
    ["n1", 22, 32, 118, 68],
    ["n2", 13, 20, 95, 78],
    ["n3", 18, 38, 51, 82],
    ["n4", 33, 11, 155, 173],
    ["n5", 27, 33, 26, 56],
  ].map(([id, width, height, x, y]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
    x: Number(x),
    y: Number(y),
  }));
  const edges = [
    [1, 2],
    [0, 3],
    [3, 4],
    [0, 5],
    [2, 5],
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
      "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "INTERACTIVE",
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
      "layering.strategy": "NETWORK_SIMPLEX",
      "crossingMinimization.strategy": "INTERACTIVE",
      "crossingMinimization.greedySwitch.type": "OFF",
      "nodePlacement.strategy": "INTERACTIVE",
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

it("matches vertical interactive spline source order across a long edge", async () => {
  const nodes = [
    ["n0", 18, 26, 103, 140],
    ["n1", 16, 26, 36, 135],
    ["n2", 10, 32, 93, 166],
    ["n3", 15, 28, 80, 100],
    ["n4", 24, 21, 185, 147],
    ["n5", 37, 10, 153, 10],
  ].map(([id, width, height, x, y]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
    x: Number(x),
    y: Number(y),
  }));
  const edges = [
    [0, 1],
    [0, 2],
    [2, 4],
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
      "elk.direction": "DOWN",
      "elk.edgeRouting": "SPLINES",
      "elk.randomSeed": "7",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "STRETCH_WIDTH",
      "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    },
    children: structuredClone(nodes),
    edges: edges.map(({ id, sourceId, targetId }) => ({
      id,
      sources: [sourceId],
      targets: [targetId],
    })),
  });
  const native = getLayeredLayout(createGraph({ nodes, edges }), {
    direction: "down",
    settings: {
      edgeRouting: "SPLINES",
      randomSeed: 7,
      separateConnectedComponents: false,
      "layering.strategy": "STRETCH_WIDTH",
      "crossingMinimization.strategy": "INTERACTIVE",
      "crossingMinimization.greedySwitch.type": "OFF",
      "nodePlacement.strategy": "BRANDES_KOEPF",
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
    expect(native.edges.find(({ id }) => id === edge.id)?.points).toEqual(expected);
  }
});

it("matches vertical interactive orthogonal dependency cycles", async () => {
  const nodes = [
    ["n0", 26, 26, 162, 7],
    ["n1", 40, 20, 155, 2],
    ["n2", 38, 13, 91, 54],
    ["n3", 12, 17, 109, 118],
    ["n4", 15, 31, 15, 121],
    ["n5", 15, 18, 81, 164],
  ].map(([id, width, height, x, y]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
    x: Number(x),
    y: Number(y),
  }));
  const edges = [
    [1, 2],
    [0, 4],
    [1, 4],
    [3, 4],
    [0, 5],
    [1, 5],
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
      "elk.direction": "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.randomSeed": "1",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
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
    direction: "down",
    settings: {
      edgeRouting: "ORTHOGONAL",
      randomSeed: 1,
      separateConnectedComponents: false,
      "layering.strategy": "NETWORK_SIMPLEX",
      "crossingMinimization.strategy": "INTERACTIVE",
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
    expect(native.edges.find(({ id }) => id === edge.id)?.points).toEqual(expected);
  }
});

it("matches upward interactive long-edge anchors and polyline spacing", async () => {
  const nodes = [
    ["n0", 18, 10, 22, 74],
    ["n1", 40, 34, 21, 16],
    ["n2", 21, 33, 187, 17],
    ["n3", 31, 12, 55, 163],
    ["n4", 19, 12, 34, 27],
    ["n5", 31, 29, 195, 152],
  ].map(([id, width, height, x, y]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
    x: Number(x),
    y: Number(y),
  }));
  const edges = [
    [1, 2],
    [2, 3],
    [0, 4],
    [3, 4],
    [1, 5],
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
      "elk.randomSeed": "6",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "DF_MODEL_ORDER",
      "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "INTERACTIVE",
    },
    children: structuredClone(nodes),
    edges: edges.map(({ id, sourceId, targetId }) => ({
      id,
      sources: [sourceId],
      targets: [targetId],
    })),
  });
  const native = getLayeredLayout(createGraph({ nodes, edges }), {
    direction: "up",
    settings: {
      edgeRouting: "POLYLINE",
      randomSeed: 6,
      separateConnectedComponents: false,
      "layering.strategy": "DF_MODEL_ORDER",
      "crossingMinimization.strategy": "INTERACTIVE",
      "crossingMinimization.greedySwitch.type": "OFF",
      "nodePlacement.strategy": "INTERACTIVE",
    },
  });
  for (const expectedNode of oracle.children ?? []) {
    const actualNode = native.nodes.find(({ id }) => id === expectedNode.id);
    expect(actualNode?.x).toBeCloseTo(expectedNode.x ?? Number.NaN, 12);
    expect(actualNode?.y).toBeCloseTo(expectedNode.y ?? Number.NaN, 12);
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

it("matches upward interactive BK target-port order", async () => {
  const bkNodes = [
    ["n0", 29, 35, 14, 139],
    ["n1", 22, 40, 185, 61],
    ["n2", 36, 26, 148, 97],
    ["n3", 24, 10, 79, 159],
    ["n4", 32, 36, 45, 20],
    ["n5", 19, 11, 168, 162],
  ].map(([id, width, height, x, y]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
    x: Number(x),
    y: Number(y),
  }));
  const bkEdges = [
    [0, 2],
    [1, 2],
    [0, 4],
    [2, 4],
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
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.randomSeed": "1",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "STRETCH_WIDTH",
      "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    },
    children: structuredClone(bkNodes),
    edges: bkEdges.map(({ id, sourceId, targetId }) => ({
      id,
      sources: [sourceId],
      targets: [targetId],
    })),
  });
  const native = getLayeredLayout(createGraph({ nodes: bkNodes, edges: bkEdges }), {
    direction: "up",
    settings: {
      edgeRouting: "ORTHOGONAL",
      randomSeed: 1,
      separateConnectedComponents: false,
      "layering.strategy": "STRETCH_WIDTH",
      "crossingMinimization.strategy": "INTERACTIVE",
      "crossingMinimization.greedySwitch.type": "OFF",
      "nodePlacement.strategy": "BRANDES_KOEPF",
    },
  });
  for (const expectedNode of oracle.children ?? []) {
    const actualNode = native.nodes.find(({ id }) => id === expectedNode.id);
    expect(actualNode?.x).toBeCloseTo(expectedNode.x ?? Number.NaN, 12);
    expect(actualNode?.y).toBeCloseTo(expectedNode.y ?? Number.NaN, 12);
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

it("matches rightward interactive BK long-edge port order", async () => {
  const bkNodes = [
    ["n0", 37, 18, 192, 140],
    ["n1", 40, 12, 88, 9],
    ["n2", 14, 38, 39, 35],
    ["n3", 37, 15, 82, 40],
    ["n4", 17, 37, 125, 74],
    ["n5", 23, 39, 138, 58],
  ].map(([id, width, height, x, y]) => ({
    id: String(id),
    width: Number(width),
    height: Number(height),
    x: Number(x),
    y: Number(y),
  }));
  const bkEdges = [
    [0, 2],
    [1, 2],
    [1, 4],
    [2, 5],
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
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.randomSeed": "4",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "INTERACTIVE",
      "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
    },
    children: structuredClone(bkNodes),
    edges: bkEdges.map(({ id, sourceId, targetId }) => ({
      id,
      sources: [sourceId],
      targets: [targetId],
    })),
  });
  const native = getLayeredLayout(createGraph({ nodes: bkNodes, edges: bkEdges }), {
    direction: "right",
    settings: {
      edgeRouting: "ORTHOGONAL",
      randomSeed: 4,
      separateConnectedComponents: false,
      "layering.strategy": "INTERACTIVE",
      "crossingMinimization.strategy": "INTERACTIVE",
      "crossingMinimization.greedySwitch.type": "OFF",
      "nodePlacement.strategy": "BRANDES_KOEPF",
    },
  });
  for (const expectedNode of oracle.children ?? []) {
    const actualNode = native.nodes.find(({ id }) => id === expectedNode.id);
    expect(actualNode?.x).toBeCloseTo(expectedNode.x ?? Number.NaN, 12);
    expect(actualNode?.y).toBeCloseTo(expectedNode.y ?? Number.NaN, 12);
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
