import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { getLayeredLayout } from "../src";

it("recursively lays out nested child graphs and sizes their parents", () => {
  const graph = createGraph({
    nodes: [
      { id: "root", parentId: null },
      { id: "parent", parentId: "root" },
      { id: "a", parentId: "parent", width: 100, height: 56 },
      { id: "b", parentId: "parent", width: 100, height: 56 },
    ],
    edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
  });

  const result = getLayeredLayout(graph);
  const byId = new Map(result.nodes.map((node) => [node.id, node]));
  expect(byId.get("root")).toMatchObject({ x: 0, y: 0, width: 268, height: 104 });
  expect(byId.get("parent")).toMatchObject({ x: 12, y: 12, width: 244, height: 80 });
  expect(byId.get("a")).toMatchObject({ x: 12, y: 12, width: 100, height: 56 });
  expect(byId.get("b")).toMatchObject({ x: 132, y: 12, width: 100, height: 56 });
});
