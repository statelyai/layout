import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { getLayeredLayout } from "../src";

// Components pack in reading order; in UP and LEFT layouts that used to put an
// isolated state before the main component's start (below an UP statechart).
it.each(["right", "left", "down", "up"] as const)(
  "never places a component before another's flow start (%s)",
  (direction) => {
    const node = (id: string) => ({ id, width: 100, height: 40 });
    const layout = getLayeredLayout(
      createGraph({
        id: "root",
        nodes: ["start", "a", "b", "c", "isolated"].map(node),
        edges: [
          { id: "start-a", sourceId: "start", targetId: "a" },
          { id: "start-b", sourceId: "start", targetId: "b" },
          { id: "a-c", sourceId: "a", targetId: "c" },
        ],
      }),
      { direction },
    );
    const rect = (id: string) => layout.nodes.find((candidate) => candidate.id === id)!;
    const start = rect("start"),
      isolated = rect("isolated");
    if (direction === "right") expect(isolated.x).toBeGreaterThanOrEqual(start.x);
    if (direction === "left")
      expect(isolated.x + isolated.width).toBeLessThanOrEqual(start.x + start.width);
    if (direction === "down") expect(isolated.y).toBeGreaterThanOrEqual(start.y);
    if (direction === "up")
      expect(isolated.y + isolated.height).toBeLessThanOrEqual(start.y + start.height);
  },
);
