import { createGraph } from "@statelyai/graph";
import type { EntityRect, Point } from "@statelyai/graph";
import { expect, it } from "vitest";
import { applyGroupedEdgeLengthCompaction } from "../src/layered/grouped-compaction";
import type { LayeredPhaseInput } from "../src/layered/types";

for (const direction of ["right", "left", "down", "up"] as const) {
  for (const strategy of ["LEFT", "RIGHT"] as const) {
    it(`moves degenerate self-loop corners with their owner (${direction}, ${strategy})`, () => {
      const vertical = direction === "down" || direction === "up";
      const negative = direction === "left" || direction === "up";
      const point = (flow: number, cross: number): Point => {
        const value = negative ? 250 - flow : flow;
        return vertical ? { x: cross, y: value } : { x: value, y: cross };
      };
      const before: EntityRect = {
        ...point(negative ? 110 : 80, 12),
        width: vertical ? 20 : 30,
        height: vertical ? 30 : 20,
      };
      const graph = createGraph({
        nodes: [{ id: "owner" }],
        edges: [{ id: "loop", sourceId: "owner", targetId: "owner" }],
      });
      const input: LayeredPhaseInput = {
        graph,
        direction,
        settings: { "compaction.postCompaction.strategy": strategy },
        sizes: new Map(),
        constrainedLayerByNodeId: new Map(),
        spacing: { node: 20, layer: 20 },
        padding: { top: 12, left: 12, bottom: 12, right: 12 },
      };
      const placement = { rectByNodeId: new Map([["owner", before]]) };
      const points = [point(110, 22), point(120, 22), point(120, 22), point(110, 22)];
      const routes = { pointsByEdgeId: new Map([["loop", points]]) };
      applyGroupedEdgeLengthCompaction(input, placement, routes);
      const after = placement.rectByNodeId.get("owner")!;
      expect(after).not.toEqual(before);
      expect(routes.pointsByEdgeId.get("loop")).toEqual(
        points.map((p) => ({ x: p.x + after.x - before.x, y: p.y + after.y - before.y })),
      );
    });
  }
}
