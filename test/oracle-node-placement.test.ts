import { createGraph } from "@statelyai/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { getLayeredLayout } from "../src";
import NativeELK, { type ElkNode } from "../src/elkjs";

const edges = [
  { id: "ac", sourceId: "a", targetId: "c" },
  { id: "bc", sourceId: "b", targetId: "c" },
  { id: "bd", sourceId: "b", targetId: "d" },
  { id: "ce", sourceId: "c", targetId: "e" },
  { id: "de", sourceId: "d", targetId: "e" },
];

function positions(nodes: ReadonlyArray<{ id?: string | number; x?: number; y?: number }>) {
  return Object.fromEntries(nodes.map((node) => [String(node.id), node.y]));
}

describe("ELK node-placement oracle", () => {
  for (const [title, graph] of [
    [
      "UP disconnected BK block offsets",
      {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "UP",
          "elk.edgeRouting": "SPLINES",
          "elk.randomSeed": "6",
          "elk.separateConnectedComponents": "false",
          "elk.layered.layering.strategy": "INTERACTIVE",
          "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
          "elk.layered.crossingMinimization.greedySwitch.type": "ONE_SIDED",
          "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        },
        children: [
          { id: "n0", width: 27, height: 22, x: 37, y: 142 },
          { id: "n1", width: 12, height: 21, x: 93, y: 125 },
          { id: "n2", width: 21, height: 14, x: 64, y: 57 },
          { id: "n3", width: 16, height: 16, x: 8, y: 170 },
          { id: "n4", width: 26, height: 27, x: 11, y: 40 },
        ],
        edges: [{ id: "e1-2", sources: ["n1"], targets: ["n2"] }],
      },
    ],
    [
      "RIGHT BK block offsets with long-edge dummies",
      {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.edgeRouting": "POLYLINE",
          "elk.randomSeed": "5",
          "elk.separateConnectedComponents": "false",
          "elk.layered.layering.strategy": "STRETCH_WIDTH",
          "elk.layered.crossingMinimization.strategy": "MEDIAN_LAYER_SWEEP",
          "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
          "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        },
        children: [
          { id: "n0", width: 32, height: 39, x: 140, y: 6 },
          { id: "n1", width: 38, height: 31, x: 152, y: 44 },
          { id: "n2", width: 19, height: 10, x: 178, y: 143 },
          { id: "n3", width: 38, height: 32, x: 146, y: 53 },
          { id: "n4", width: 27, height: 36, x: 72, y: 38 },
          { id: "n5", width: 31, height: 21, x: 25, y: 127 },
        ],
        edges: [
          { id: "e0-2", sources: ["n0"], targets: ["n2"] },
          { id: "e2-4", sources: ["n2"], targets: ["n4"] },
          { id: "e0-5", sources: ["n0"], targets: ["n5"] },
        ],
      },
    ],
  ] satisfies ReadonlyArray<readonly [string, ElkNode]>) {
    it(`matches ${title}`, async () => {
      const [oracle, native] = await Promise.all([
        new ELK().layout(structuredClone(graph)),
        new NativeELK().layout(structuredClone(graph)),
      ]);
      expect(native.children?.map(({ id, x, y }) => [id, x, y])).toEqual(
        oracle.children?.map(({ id, x, y }) => [id, x, y]),
      );
    });
  }

  it("matches network-simplex separation between adjacent long-edge dummies", async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "SPLINES",
        "elk.randomSeed": "9",
        "elk.separateConnectedComponents": "false",
        "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      },
      children: [
        { id: "n0", width: 21, height: 29, x: 66, y: 75 },
        { id: "n1", width: 18, height: 32, x: 173, y: 79 },
        { id: "n2", width: 15, height: 16, x: 110, y: 114 },
        { id: "n3", width: 32, height: 18, x: 97, y: 119 },
        { id: "n4", width: 40, height: 35, x: 109, y: 124 },
        { id: "n5", width: 36, height: 27, x: 94, y: 59 },
      ],
      edges: [
        ["e0-1", "n0", "n1"],
        ["e1-2", "n1", "n2"],
        ["e0-4", "n0", "n4"],
        ["e0-5", "n0", "n5"],
        ["e1-5", "n1", "n5"],
        ["e2-5", "n2", "n5"],
        ["e4-5", "n4", "n5"],
      ].map(([id, source, target]) => ({ id, sources: [source], targets: [target] })),
    };
    const [oracle, native] = await Promise.all([
      new ELK().layout(structuredClone(graph)),
      new NativeELK().layout(structuredClone(graph)),
    ]);
    expect(positions(native.children ?? [])).toEqual(positions(oracle.children ?? []));
  });

  it("matches network-simplex separation after a long-edge dummy", async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.randomSeed": "2",
        "elk.separateConnectedComponents": "false",
        "elk.layered.layering.strategy": "COFFMAN_GRAHAM",
        "elk.layered.crossingMinimization.strategy": "MEDIAN_LAYER_SWEEP",
        "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      },
      children: [
        { id: "n0", width: 40, height: 10, x: 162, y: 6 },
        { id: "n1", width: 15, height: 40, x: 102, y: 149 },
        { id: "n2", width: 24, height: 21, x: 189, y: 129 },
        { id: "n3", width: 34, height: 22, x: 26, y: 145 },
        { id: "n4", width: 28, height: 33, x: 4, y: 53 },
        { id: "n5", width: 21, height: 21, x: 68, y: 198 },
      ],
      edges: [
        ["e0-3", "n0", "n3"],
        ["e2-3", "n2", "n3"],
        ["e0-4", "n0", "n4"],
        ["e1-4", "n1", "n4"],
        ["e0-5", "n0", "n5"],
        ["e2-5", "n2", "n5"],
        ["e4-5", "n4", "n5"],
      ].map(([id, source, target]) => ({ id, sources: [source], targets: [target] })),
    };
    const [oracle, native] = await Promise.all([
      new ELK().layout(structuredClone(graph)),
      new NativeELK().layout(structuredClone(graph)),
    ]);
    expect(positions(native.children ?? [])).toEqual(positions(oracle.children ?? []));
  });

  it("matches LEFT network-simplex source ports and spline slots", async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "LEFT",
        "elk.edgeRouting": "SPLINES",
        "elk.randomSeed": "6",
        "elk.separateConnectedComponents": "false",
        "elk.layered.layering.strategy": "MIN_WIDTH",
        "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
        "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      },
      children: [
        { id: "n0", width: 24, height: 17, x: 111, y: 75 },
        { id: "n1", width: 27, height: 31, x: 125, y: 143 },
        { id: "n2", width: 39, height: 31, x: 34, y: 11 },
        { id: "n3", width: 32, height: 25, x: 140, y: 76 },
        { id: "n4", width: 30, height: 27, x: 185, y: 22 },
      ],
      edges: [
        { id: "e0-1", sources: ["n0"], targets: ["n1"] },
        { id: "e0-4", sources: ["n0"], targets: ["n4"] },
      ],
    };
    const [oracle, native] = await Promise.all([
      new ELK().layout(structuredClone(graph)),
      new NativeELK().layout(structuredClone(graph)),
    ]);
    expect([native.width, native.height]).toEqual([oracle.width, oracle.height]);
    expect(native.children?.map(({ id, x, y }) => [id, x, y])).toEqual(
      oracle.children?.map(({ id, x, y }) => [id, x, y]),
    );
    expect(
      native.edges?.map((edge) =>
        edge.sections?.map((section) => [
          section.startPoint,
          ...(section.bendPoints ?? []),
          section.endPoint,
        ]),
      ),
    ).toEqual(
      oracle.edges?.map((edge) =>
        edge.sections?.map((section) => [
          section.startPoint,
          ...(section.bendPoints ?? []),
          section.endPoint,
        ]),
      ),
    );
  });

  for (const strategy of [
    "SIMPLE",
    "INTERACTIVE",
    "BRANDES_KOEPF",
    "LINEAR_SEGMENTS",
    "NETWORK_SIMPLEX",
  ] as const) {
    it(`matches ${strategy} for normal flat nodes`, async () => {
      const nodes = [
        { id: "a", width: 30, height: 20, y: 0 },
        { id: "b", width: 20, height: 50, y: 50 },
        { id: "c", width: 40, height: 25, y: 10 },
        { id: "d", width: 20, height: 30, y: 55 },
        { id: "e", width: 30, height: 15, y: 20 },
      ];
      const oracle = await new ELK().layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
          "elk.layered.crossingMinimization.strategy": "NONE",
          "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
          "elk.layered.nodePlacement.strategy": strategy,
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
          "nodePlacement.strategy": strategy,
        },
      });

      const expected = positions(oracle.children ?? []);
      for (const [id, y] of Object.entries(positions(native.nodes))) {
        expect(y).toBeCloseTo(expected[id] ?? Number.NaN, 12);
      }
    });
  }

  for (const fixedAlignment of [
    "RIGHTDOWN",
    "RIGHTUP",
    "LEFTDOWN",
    "LEFTUP",
    "BALANCED",
  ] as const) {
    it(`matches BRANDES_KOEPF ${fixedAlignment}`, async () => {
      const nodes = [
        { id: "a", width: 30, height: 20 },
        { id: "b", width: 20, height: 50 },
        { id: "c", width: 40, height: 25 },
        { id: "d", width: 20, height: 30 },
        { id: "e", width: 30, height: 15 },
      ];
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
          "elk.layered.nodePlacement.bk.fixedAlignment": fixedAlignment,
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
          "nodePlacement.bk.fixedAlignment": fixedAlignment,
        },
      });

      const expected = positions(oracle.children ?? []);
      for (const [id, y] of Object.entries(positions(native.nodes))) {
        expect(y).toBeCloseTo(expected[id] ?? Number.NaN, 12);
      }
    });
  }

  const configurableNodes = [
    { id: "a", width: 30, height: 20 },
    { id: "b", width: 20, height: 50 },
    { id: "c", width: 40, height: 25 },
    { id: "d", width: 20, height: 30 },
    { id: "e", width: 30, height: 15 },
  ];
  const comparePlacementOption = async (
    strategy: "LINEAR_SEGMENTS" | "BRANDES_KOEPF",
    option: string,
    value: string,
  ) => {
    const layoutOptions = {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
      "elk.layered.crossingMinimization.strategy": "NONE",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": strategy,
      [option]: value,
    };
    const graph = {
      id: "root",
      layoutOptions,
      children: structuredClone(configurableNodes),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.sourceId],
        targets: [edge.targetId],
      })),
    };
    const oracle = await new ELK().layout(structuredClone(graph));
    const native = await new NativeELK().layout(structuredClone(graph));
    const expected = positions(oracle.children ?? []);
    for (const [id, y] of Object.entries(positions(native.children ?? []))) {
      expect(y).toBeCloseTo(expected[id] ?? Number.NaN, 12);
    }
  };

  for (const dampening of [0, 0.3, 1]) {
    it(`matches LINEAR_SEGMENTS deflection dampening ${dampening}`, () =>
      comparePlacementOption(
        "LINEAR_SEGMENTS",
        "elk.layered.nodePlacement.linearSegments.deflectionDampening",
        String(dampening),
      ));
  }

  for (const thoroughness of [1, 7, 20]) {
    it(`matches LINEAR_SEGMENTS thoroughness ${thoroughness}`, () =>
      comparePlacementOption("LINEAR_SEGMENTS", "elk.layered.thoroughness", String(thoroughness)));
  }

  for (const straightening of ["NONE", "IMPROVE_STRAIGHTNESS"] as const) {
    it(`matches BRANDES_KOEPF ${straightening} edge straightening`, () =>
      comparePlacementOption(
        "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.edgeStraightening",
        straightening,
      ));
  }

  for (const favorStraightEdges of [false, true]) {
    it(`matches BRANDES_KOEPF favor-straight-edges ${favorStraightEdges}`, () =>
      comparePlacementOption(
        "BRANDES_KOEPF",
        "elk.layered.nodePlacement.favorStraightEdges",
        String(favorStraightEdges),
      ));
  }

  for (const priority of [0, 1, 10, 100]) {
    it(`matches LINEAR_SEGMENTS straightness priority ${priority}`, async () => {
      const graph = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
          "elk.layered.crossingMinimization.strategy": "NONE",
          "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
          "elk.layered.nodePlacement.strategy": "LINEAR_SEGMENTS",
        },
        children: structuredClone(configurableNodes),
        edges: edges.map((edge, index) => ({
          id: edge.id,
          sources: [edge.sourceId],
          targets: [edge.targetId],
          ...(index === 0
            ? {
                layoutOptions: {
                  "elk.layered.priority.straightness": String(priority),
                },
              }
            : {}),
        })),
      };
      const [oracle, native] = await Promise.all([
        new ELK().layout(structuredClone(graph)),
        new NativeELK().layout(structuredClone(graph)),
      ]);

      const expected = positions(oracle.children ?? []);
      for (const [id, y] of Object.entries(positions(native.children ?? []))) {
        expect(y).toBeCloseTo(expected[id] ?? Number.NaN, 12);
      }
    });

    it(`matches NETWORK_SIMPLEX straightness priority ${priority}`, async () => {
      const graph = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
          "elk.layered.crossingMinimization.strategy": "NONE",
          "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
          "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        },
        children: structuredClone(configurableNodes),
        edges: edges.map((edge, index) => ({
          id: edge.id,
          sources: [edge.sourceId],
          targets: [edge.targetId],
          ...(index === 0
            ? {
                layoutOptions: {
                  "elk.layered.priority.straightness": String(priority),
                },
              }
            : {}),
        })),
      };
      const [oracle, native] = await Promise.all([
        new ELK().layout(structuredClone(graph)),
        new NativeELK().layout(structuredClone(graph)),
      ]);

      const expected = positions(oracle.children ?? []);
      for (const [id, y] of Object.entries(positions(native.children ?? []))) {
        expect(y).toBeCloseTo(expected[id] ?? Number.NaN, 12);
      }
    });
  }

  it("matches BRANDES_KOEPF implicit port order across several long edges", async () => {
    const graph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.aspectRatio": "1",
        "elk.layered.layering.strategy": "LONGEST_PATH",
        "elk.layered.wrapping.strategy": "OFF",
      },
      children: Array.from({ length: 10 }, (_, index) => ({
        id: `multi-${index}`,
        width: 20,
        height: 20,
      })),
      edges: [
        ...Array.from({ length: 9 }, (_, index) => ({
          id: `backbone-${index}`,
          sources: [`multi-${index}`],
          targets: [`multi-${index + 1}`],
        })),
        ...[
          [0, 3],
          [2, 5],
          [5, 8],
        ].map(([source, target], index) => ({
          id: `skip-${index}`,
          sources: [`multi-${source}`],
          targets: [`multi-${target}`],
        })),
      ],
    };
    const [oracleResult, nativeResult] = await Promise.all([
      new ELK().layout(structuredClone(graph)),
      new NativeELK().layout(structuredClone(graph)),
    ]);
    const oracle = oracleResult as ElkNode;
    const native = nativeResult as ElkNode;
    expect(native.width).toBeCloseTo(oracle.width ?? Number.NaN, 12);
    expect(native.height).toBeCloseTo(oracle.height ?? Number.NaN, 12);
    for (const expectedNode of oracle.children ?? []) {
      const actualNode = native.children?.find((node) => node.id === expectedNode.id);
      expect(actualNode?.x).toBeCloseTo(expectedNode.x ?? Number.NaN, 12);
      expect(actualNode?.y).toBeCloseTo(expectedNode.y ?? Number.NaN, 12);
    }
  });
});
