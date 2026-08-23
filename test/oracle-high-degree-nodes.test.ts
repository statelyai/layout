import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

function layerRanks(graph: ElkNode) {
  const positions = [...new Set((graph.children ?? []).map((node) => node.x ?? 0))].sort(
    (left, right) => left - right,
  );
  return Object.fromEntries(
    (graph.children ?? []).map((node) => [String(node.id), positions.indexOf(node.x ?? 0)]),
  );
}

async function compareRanks(graph: ElkNode) {
  const oracle = (await new OracleELK().layout(
    structuredClone(graph) as never,
  )) as unknown as ElkNode;
  const native = await new NativeELK().layout(structuredClone(graph));
  expect(layerRanks(native)).toEqual(layerRanks(oracle));
}

function fixture(threshold: number, treeHeight: number): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.separateConnectedComponents": "false",
      "elk.layered.highDegreeNodes.treatment": "true",
      "elk.layered.highDegreeNodes.threshold": String(threshold),
      "elk.layered.highDegreeNodes.treeHeight": String(treeHeight),
    },
    children: ["h", "a", "b", "c", "d", "x", "y", "z"].map((id) => ({
      id,
      width: 20,
      height: 20,
    })),
    edges: [
      ["h", "a"],
      ["h", "b"],
      ["h", "c"],
      ["h", "d"],
      ["x", "y"],
      ["y", "z"],
    ].map(([source, target], index) => ({
      id: `e${index}`,
      sources: [source!],
      targets: [target!],
    })),
  };
}

describe("ELK high-degree-node parity", () => {
  it("moves bounded outgoing trees into inserted layers", async () => {
    await compareRanks(fixture(4, 2));
  });

  it("honors the degree threshold", async () => {
    await compareRanks(fixture(5, 2));
  });

  it("treats tree height zero as unbounded", async () => {
    const graph = fixture(4, 0);
    graph.children?.push({ id: "aa", width: 20, height: 20 });
    graph.edges?.push({ id: "deep", sources: ["a"], targets: ["aa"] });
    await compareRanks(graph);
  });

  it("rejects trees deeper than the configured height", async () => {
    const graph = fixture(4, 1);
    graph.children?.push({ id: "aa", width: 20, height: 20 });
    graph.edges?.push({ id: "deep", sources: ["a"], targets: ["aa"] });
    await compareRanks(graph);
  });
});
