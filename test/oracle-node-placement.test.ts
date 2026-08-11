import { createGraph } from "@statelyai/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { getLayeredLayout } from "../src";
import NativeELK from "../src/elkjs";

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
    const [oracle, native] = await Promise.all([
      new ELK().layout(structuredClone(graph)),
      new NativeELK().layout(structuredClone(graph)),
    ]);
    expect(native.width).toBeCloseTo(oracle.width ?? Number.NaN, 12);
    expect(native.height).toBeCloseTo(oracle.height ?? Number.NaN, 12);
    for (const expectedNode of oracle.children ?? []) {
      const actualNode = native.children?.find((node) => node.id === expectedNode.id);
      expect(actualNode?.x).toBeCloseTo(expectedNode.x ?? Number.NaN, 12);
      expect(actualNode?.y).toBeCloseTo(expectedNode.y ?? Number.NaN, 12);
    }
  });
});
