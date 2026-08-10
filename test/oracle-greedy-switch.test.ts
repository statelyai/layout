import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

const children = Array.from({ length: 9 }, (_, index) => ({
  id: `n${Math.floor(index / 3)}${index % 3}`,
  width: 20,
  height: 20,
}));
const edges = [
  ["n00", "n10"],
  ["n00", "n12"],
  ["n01", "n12"],
  ["n02", "n10"],
  ["n10", "n22"],
  ["n12", "n21"],
].map(([source, target], index) => ({
  id: `edge${index}`,
  sources: [source!],
  targets: [target!],
}));

for (const type of ["ONE_SIDED", "TWO_SIDED"] as const) {
  it(`matches ELK ${type} greedy switching`, async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.edgeRouting": "SPLINES",
        "elk.separateConnectedComponents": "false",
        "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
        "elk.layered.crossingMinimization.strategy": "NONE",
        "elk.layered.crossingMinimization.greedySwitch.type": type,
        "elk.layered.nodePlacement.strategy": "SIMPLE",
      },
      children: structuredClone(children),
      edges: structuredClone(edges),
    };
    const expected = (await new OracleELK().layout(
      structuredClone(graph) as never,
    )) as unknown as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(graph));
    for (const expectedNode of expected.children ?? []) {
      const actualNode = actual.children?.find(
        (candidate) => String(candidate.id) === String(expectedNode.id),
      );
      expect(actualNode?.x).toBeCloseTo(expectedNode.x ?? Number.NaN, 12);
      expect(actualNode?.y).toBeCloseTo(expectedNode.y ?? Number.NaN, 12);
    }
  });
}

it("matches ELK greedy-switch activation threshold", async () => {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.edgeRouting": "SPLINES",
      "elk.separateConnectedComponents": "false",
      "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
      "elk.layered.crossingMinimization.strategy": "NONE",
      "elk.layered.crossingMinimization.greedySwitch.type": "TWO_SIDED",
      "elk.layered.crossingMinimization.greedySwitch.activationThreshold": "9",
      "elk.layered.nodePlacement.strategy": "SIMPLE",
    },
    children: structuredClone(children),
    edges: structuredClone(edges),
  };
  const expected = (await new OracleELK().layout(
    structuredClone(graph) as never,
  )) as unknown as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect(actual.children?.map((node) => node.y)).toEqual(expected.children?.map((node) => node.y));
});
