import { createGraph } from "@statelyai/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import { getLayeredLayout, type CrossingMinimizationStrategy } from "../src";
import NativeELK, { type ElkNode } from "../src/elkjs";

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

it("matches ELK semi-interactive authored ordering", async () => {
  const positionedNode = (id: string, x: number, y: number) => ({
    id,
    width: 20,
    height: 20,
    layoutOptions: { "elk.position": `(${x},${y})` },
  });
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.crossingMinimization.semiInteractive": "true",
      "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
      "elk.layered.nodePlacement.strategy": "SIMPLE",
    },
    children: [
      positionedNode("a", 0, 100),
      positionedNode("b", 0, 0),
      positionedNode("c", 100, 100),
      positionedNode("d", 100, 0),
    ],
    edges: [
      { id: "ac", sources: ["a"], targets: ["c"] },
      { id: "bd", sources: ["b"], targets: ["d"] },
    ],
  };
  const expected = (await new ELK().layout(structuredClone(graph) as never)) as unknown as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect(actual.children?.map((node) => [node.x, node.y])).toEqual(
    expected.children?.map((node) => [node.x, node.y]),
  );
});

it("matches ELK semi-interactive ordering around long-edge dummy slots", async () => {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.separateConnectedComponents": "false",
      "elk.layered.crossingMinimization.semiInteractive": "true",
    },
    children: [
      { id: "a", x: 10, y: 90, width: 30, height: 20 },
      { id: "b", x: 100, y: 10, width: 40, height: 25 },
      { id: "c", x: 180, y: 70, width: 35, height: 30 },
      { id: "d", x: 70, y: 160, width: 30, height: 25 },
    ],
    edges: [
      { id: "ab", sources: ["a"], targets: ["b"] },
      { id: "ac", sources: ["a"], targets: ["c"] },
      { id: "bd", sources: ["b"], targets: ["d"] },
      { id: "dc", sources: ["d"], targets: ["c"] },
    ],
  };
  const expected = (await new ELK().layout(structuredClone(graph) as never)) as unknown as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  const rounded = (value: number | undefined) =>
    value === undefined ? undefined : Math.round(value * 1e12) / 1e12;
  const point = ({ x, y }: { x: number; y: number }) => ({ x: rounded(x), y: rounded(y) });
  const geometry = (layout: ElkNode) => ({
    size: [rounded(layout.width), rounded(layout.height)],
    nodes: layout.children?.map(({ id, x, y }) => [id, rounded(x), rounded(y)]),
    edges: layout.edges?.map(({ id, sections }) => [
      id,
      sections?.map(({ startPoint, bendPoints, endPoint }) => [
        point(startPoint),
        ...(bendPoints ?? []).map(point),
        point(endPoint),
      ]),
    ]),
  });
  expect(geometry(actual)).toEqual(geometry(expected));
});
