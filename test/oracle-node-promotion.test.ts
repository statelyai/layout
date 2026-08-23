import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

function layerRanks(graph: ElkNode): number[] {
  const positions = [...new Set((graph.children ?? []).map((node) => node.x ?? 0))].sort(
    (left, right) => left - right,
  );
  return (graph.children ?? []).map((node) => positions.indexOf(node.x ?? 0));
}

async function compare(input: ElkNode): Promise<void> {
  const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(input));
  expect(layerRanks(actual)).toEqual(layerRanks(expected));
}

function baseGraph(): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "LONGEST_PATH",
    },
    children: Array.from({ length: 8 }, (_, index) => ({
      id: `n${index}`,
      width: 20,
      height: 20,
    })),
    edges: [
      [0, 2],
      [0, 4],
      [0, 7],
      [1, 5],
      [1, 6],
      [3, 7],
      [6, 7],
    ].map(([source, target]) => ({
      id: `e${source}-${target}`,
      sources: [`n${source}`],
      targets: [`n${target}`],
    })),
  };
}

describe("ELK node-promotion parity", () => {
  for (const strategy of [
    "NONE",
    "NIKOLOV",
    "NIKOLOV_PIXEL",
    "NIKOLOV_IMPROVED",
    "NIKOLOV_IMPROVED_PIXEL",
    "DUMMYNODE_PERCENTAGE",
    "NODECOUNT_PERCENTAGE",
    "NO_BOUNDARY",
  ] as const) {
    it(`matches ${strategy}`, async () => {
      const input = baseGraph();
      input.layoutOptions!["elk.layered.layering.nodePromotion.strategy"] = strategy;
      input.layoutOptions!["elk.layered.layering.nodePromotion.maxIterations"] = "30";
      await compare(input);
    });
  }

  for (const iterations of [0, 10, 100]) {
    it(`matches percentage boundary ${iterations}`, async () => {
      const input: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.layering.strategy": "LONGEST_PATH",
          "elk.layered.layering.nodePromotion.strategy": "NODECOUNT_PERCENTAGE",
          "elk.layered.layering.nodePromotion.maxIterations": iterations,
        },
        children: Array.from({ length: 10 }, (_, index) => ({
          id: `n${index}`,
          width: 20,
          height: 20,
        })),
        edges: [
          [2, 5],
          [3, 4],
          [3, 7],
          [3, 8],
          [4, 6],
          [4, 9],
          [5, 9],
          [6, 9],
        ].map(([source, target]) => ({
          id: `e${source}-${target}`,
          sources: [`n${source}`],
          targets: [`n${target}`],
        })),
      };
      await compare(input);
    });
  }

  for (const [layering, strategy, edges] of [
    [
      "LONGEST_PATH_SOURCE",
      "MODEL_ORDER_LEFT_TO_RIGHT",
      [
        [1, 2],
        [2, 3],
        [3, 5],
        [1, 4],
        [4, 5],
      ],
    ],
    [
      "LONGEST_PATH",
      "MODEL_ORDER_RIGHT_TO_LEFT",
      [
        [1, 3],
        [3, 4],
        [4, 5],
        [1, 2],
        [2, 5],
      ],
    ],
  ] as const) {
    it(`matches ${strategy}`, async () => {
      await compare({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.layering.strategy": layering,
          "elk.layered.layering.nodePromotion.strategy": strategy,
        },
        children: [1, 2, 3, 4, 5].map((id) => ({
          id: String(id),
          width: 20,
          height: 20,
        })),
        edges: edges.map(([source, target]) => ({
          id: `${source}-${target}`,
          sources: [String(source)],
          targets: [String(target)],
        })),
      });
    });
  }
});
