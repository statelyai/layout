import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { applyGroupedEdgeLengthCompaction } from "../src/layered/grouped-compaction";
import type { LayeredPhaseInput } from "../src/layered/types";

it("keeps a merged cross-port column attached to both endpoint nodes", () => {
  const graph = createGraph({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ id: "e", sourceId: "a", targetId: "b" }],
  });
  const input: LayeredPhaseInput = {
    graph,
    direction: "right",
    settings: {},
    sizes: new Map(),
    constrainedLayerByNodeId: new Map(),
    spacing: { node: 20, layer: 20 },
    padding: { top: 12, left: 12, bottom: 12, right: 12 },
  };
  const placement = {
    rectByNodeId: new Map([
      ["a", { x: 17, y: 62, width: 30, height: 20 }],
      ["b", { x: 12, y: 12, width: 40, height: 30 }],
    ]),
  };
  const routes = {
    pointsByEdgeId: new Map([
      [
        "e",
        [
          { x: 32, y: 62 },
          { x: 32, y: 52 },
          { x: 32, y: 52 },
          { x: 32, y: 42 },
        ],
      ],
    ]),
  };
  applyGroupedEdgeLengthCompaction(input, placement, routes);
  const points = routes.pointsByEdgeId.get("e")!;
  expect(points[0]).toEqual({ x: placement.rectByNodeId.get("a")!.x + 15, y: 62 });
  expect(points.at(-1)).toEqual({ x: placement.rectByNodeId.get("b")!.x + 20, y: 42 });
  expect(points.map((p) => p.x)).toEqual([points[0]!.x, points[0]!.x, points[0]!.x, points[0]!.x]);
});
