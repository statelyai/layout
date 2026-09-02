import { createGraph } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import { applyPostCompaction } from "../src/layered/strategies";
import type { EdgeRoutes, LayeredPhaseInput, NodePlacement } from "../src/layered/types";

describe("post-compaction routing", () => {
  it("discards stale long-spline controls after moving route endpoints", () => {
    const graph = createGraph({
      nodes: [
        { id: "source", width: 20, height: 20 },
        { id: "target", width: 20, height: 20 },
      ],
      edges: [{ id: "edge", sourceId: "source", targetId: "target" }],
    });
    const input: LayeredPhaseInput = {
      graph,
      sizes: new Map([
        ["source", { width: 20, height: 20 }],
        ["target", { width: 20, height: 20 }],
      ]),
      direction: "right",
      spacing: { node: 20, layer: 20 },
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
      constrainedLayerByNodeId: new Map(),
      settings: {
        edgeRouting: "SPLINES",
        "compaction.postCompaction.strategy": "LEFT",
      },
    };
    const placement: NodePlacement = {
      rectByNodeId: new Map([
        ["source", { x: 20, y: 20, width: 20, height: 20 }],
        ["target", { x: 80, y: 50, width: 20, height: 20 }],
      ]),
    };
    const controls = new Map([
      [
        "edge",
        [
          { x: 50, y: 30 },
          { x: 70, y: 60 },
        ],
      ],
    ]);
    const routes: EdgeRoutes = {
      pointsByEdgeId: new Map([
        [
          "edge",
          [
            { x: 40, y: 30 },
            { x: 80, y: 60 },
          ],
        ],
      ]),
      splineNubControlsByEdgeId: controls,
    };

    applyPostCompaction(input, placement, routes);

    expect(routes.splineNubControlsByEdgeId?.has("edge")).toBe(false);
  });

  it("keeps four-point vertical self loops orthogonal after moving their node", () => {
    const graph = createGraph({
      nodes: [{ id: "node", width: 20, height: 20 }],
      edges: [{ id: "loop", sourceId: "node", targetId: "node" }],
    });
    const input: LayeredPhaseInput = {
      graph,
      sizes: new Map([["node", { width: 20, height: 20 }]]),
      direction: "down",
      spacing: { node: 20, layer: 20 },
      padding: { top: 12, right: 12, bottom: 12, left: 12 },
      constrainedLayerByNodeId: new Map(),
      settings: {
        edgeRouting: "ORTHOGONAL",
        "compaction.postCompaction.strategy": "LEFT",
      },
    };
    const placement: NodePlacement = {
      rectByNodeId: new Map([["node", { x: 20, y: 20, width: 20, height: 20 }]]),
    };
    const routes: EdgeRoutes = {
      pointsByEdgeId: new Map([
        [
          "loop",
          [
            { x: 25, y: 20 },
            { x: 25, y: 0 },
            { x: 35, y: 0 },
            { x: 35, y: 20 },
          ],
        ],
      ]),
      outsideFeedbackEdgeIds: new Set(["loop"]),
    };

    applyPostCompaction(input, placement, routes);

    const points = routes.pointsByEdgeId.get("loop")!;
    expect(points).toHaveLength(4);
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1]!;
      const point = points[index]!;
      expect(previous.x === point.x || previous.y === point.y).toBe(true);
    }
  });
});
