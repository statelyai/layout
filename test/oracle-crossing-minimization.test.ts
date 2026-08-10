import { createGraph } from "@statelyai/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { getLayeredLayout, type CrossingMinimizationStrategy } from "../src";

const nodes = [
  { id: "a", width: 20, height: 20, y: 80 },
  { id: "b", width: 20, height: 20, y: 0 },
  { id: "c", width: 20, height: 20, y: 70 },
  { id: "d", width: 20, height: 20, y: 10 },
  { id: "e", width: 20, height: 20, y: 60 },
  { id: "f", width: 20, height: 20, y: 20 },
];
const edges = [
  { id: "ad", sourceId: "a", targetId: "d" },
  { id: "bc", sourceId: "b", targetId: "c" },
  { id: "cf", sourceId: "c", targetId: "f" },
  { id: "de", sourceId: "d", targetId: "e" },
  { id: "ac", sourceId: "a", targetId: "c" },
];

function layerOrders(values: ReadonlyArray<{ id?: string | number; x?: number; y?: number }>) {
  const byLayer = new Map<number, Array<{ id: string; y: number }>>();
  for (const node of values) {
    const x = node.x ?? 0;
    const layer = byLayer.get(x) ?? [];
    layer.push({ id: String(node.id), y: node.y ?? 0 });
    byLayer.set(x, layer);
  }
  return [...byLayer.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, layer]) => layer.sort((left, right) => left.y - right.y).map((node) => node.id));
}

describe("ELK crossing-minimization oracle", () => {
  for (const strategy of [
    "LAYER_SWEEP",
    "MEDIAN_LAYER_SWEEP",
    "INTERACTIVE",
    "NONE",
  ] satisfies CrossingMinimizationStrategy[]) {
    it(`matches ${strategy} layer order`, async () => {
      const elk = new ELK();
      const oracle = await elk.layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
          "elk.layered.crossingMinimization.strategy": strategy,
          "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
        },
        children: nodes,
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
          "crossingMinimization.strategy": strategy,
          "crossingMinimization.greedySwitch.type": "OFF",
        },
      });

      expect(layerOrders(native.nodes)).toEqual(layerOrders(oracle.children ?? []));
    });
  }
});
