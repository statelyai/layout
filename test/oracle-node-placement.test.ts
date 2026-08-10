import { createGraph } from "@statelyai/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { getLayeredLayout } from "../src";

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
  for (const strategy of ["SIMPLE", "INTERACTIVE", "BRANDES_KOEPF"] as const) {
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

      expect(positions(native.nodes)).toEqual(positions(oracle.children ?? []));
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
});
