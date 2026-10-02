import { expect, it } from "vitest";
import { createGraph, type VisualGraph } from "@statelyai/graph";
import { getLayoutRoutes } from "../src";
import { repairFlatRouting } from "../src/layered/native-routing";

it("preserves a fixed implicit source side when repairing a labeled feedback edge", () => {
  const graph = createGraph({
    nodes: [
      { id: "a", x: 300, y: 0, width: 80, height: 60 },
      { id: "b", x: 0, y: 100, width: 80, height: 60 },
    ],
    edges: [
      {
        id: "ab",
        sourceId: "a",
        targetId: "b",
        x: 180,
        y: 100,
        width: 30,
        height: 22,
        points: [
          { x: 380, y: 30 },
          { x: 400, y: 30 },
          { x: 400, y: 111 },
          { x: 210, y: 111 },
          { x: 180, y: 111 },
          { x: 0, y: 130 },
        ],
      },
    ],
  }) as VisualGraph;
  const repaired = repairFlatRouting(graph, {
    direction: "right",
    nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
  });
  expect(repaired.nodes).toEqual(graph.nodes);
  for (const route of getLayoutRoutes(repaired).values())
    for (const section of route.sections)
      for (const endpoint of [section.from, section.to])
        if (endpoint.kind === "node") expect(endpoint.port).toBeUndefined();
  expect(repaired.edges[0]!.points![0]).toEqual({ x: 380, y: 30 });
  expect(repaired.edges[0]!.points!.at(-1)).toEqual({ x: 0, y: 130 });
});

it("uses the initial lead to preserve the fixed face at a corner attachment", () => {
  const graph = createGraph({
    nodes: [
      { id: "a", x: 300, y: 0, width: 80, height: 60 },
      { id: "b", x: 0, y: 100, width: 80, height: 60 },
    ],
    edges: [
      {
        id: "ab",
        sourceId: "a",
        targetId: "b",
        x: 180,
        y: 100,
        width: 30,
        height: 22,
        points: [
          { x: 380, y: 60 },
          { x: 380, y: 80 },
          { x: 210, y: 111 },
          { x: 180, y: 111 },
          { x: 80, y: 80 },
          { x: 80, y: 100 },
        ],
      },
    ],
  }) as VisualGraph;
  const repaired = repairFlatRouting(graph, {
    direction: "down",
    nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
  });
  expect(repaired.nodes).toEqual(graph.nodes);
  for (const route of getLayoutRoutes(repaired).values())
    for (const section of route.sections)
      for (const endpoint of [section.from, section.to])
        if (endpoint.kind === "node") expect(endpoint.port).toBeUndefined();
  expect(repaired.edges[0]!.points![0]).toEqual({ x: 380, y: 60 });
  expect(repaired.edges[0]!.points!.at(-1)).toEqual({ x: 80, y: 100 });
});
