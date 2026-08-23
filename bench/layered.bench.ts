import { createGraph } from "@statelyai/graph";
import { getElkLayout } from "@statelyai/graph/layout/elk";
import { bench, describe } from "vitest";
import { getLayeredLayout } from "../src";

function createLayeredFixture(size: number) {
  return createGraph({
    id: `layered-${size}`,
    nodes: Array.from({ length: size }, (_, index) => ({
      id: `n${index}`,
      width: 100,
      height: 50,
    })),
    edges: Array.from({ length: Math.max(0, size - 1) }, (_, index) => ({
      id: `e${index}`,
      sourceId: `n${index}`,
      targetId: `n${index + 1}`,
    })),
  });
}

const graph = createLayeredFixture(100);

function createLayeredDagFixture(width: number, depth: number) {
  return createGraph({
    id: `layered-dag-${width}-${depth}`,
    nodes: Array.from({ length: width * depth }, (_, index) => ({
      id: `d${index}`,
      width: 40,
      height: 24,
    })),
    edges: Array.from({ length: depth - 1 }, (_, layer) =>
      Array.from({ length: width }, (_, column) =>
        [column, Math.min(width - 1, column + 1)].map((targetColumn, branch) => ({
          id: `d${layer}-${column}-${branch}`,
          sourceId: `d${layer * width + column}`,
          targetId: `d${(layer + 1) * width + targetColumn}`,
        })),
      ),
    ).flat(2),
  });
}

const dag = createLayeredDagFixture(10, 10);

describe("100-node layered chain", () => {
  bench("native TypeScript", () => {
    getLayeredLayout(graph, { direction: "right" });
  });

  bench("elkjs oracle", async () => {
    await getElkLayout(graph, { direction: "right" });
  });
});

describe("100-node layered DAG", () => {
  bench("native TypeScript", () => {
    getLayeredLayout(dag, { direction: "right" });
  });

  bench("elkjs oracle", async () => {
    await getElkLayout(dag, { direction: "right" });
  });
});
