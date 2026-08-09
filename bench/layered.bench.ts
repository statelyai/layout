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

describe("100-node layered chain", () => {
  bench("native TypeScript", () => {
    getLayeredLayout(graph, { direction: "right" });
  });

  bench("elkjs oracle", async () => {
    await getElkLayout(graph, { direction: "right" });
  });
});
