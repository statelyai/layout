import { createGraph } from "@statelyai/graph";
import type { EntityRect, Point } from "@statelyai/graph";
import { expect, it } from "vitest";
import { applyGroupedEdgeLengthCompaction } from "../src/layered/grouped-compaction";
import type { LayeredPhaseInput } from "../src/layered/types";
for (const direction of ["right", "left", "down", "up"] as const) {
  it(`moves port leads rigidly without adding bends in ${direction}`, () => {
    const vertical = direction === "down" || direction === "up";
    const negative = direction === "left" || direction === "up";
    const p = (x: number, y: number): Point =>
      vertical ? { x: y, y: negative ? 250 - x : x } : { x: negative ? 250 - x : x, y };
    const r = (x: number, y: number, width: number, height: number): EntityRect => ({
      ...p(x + (negative ? width : 0), y),
      width: vertical ? height : width,
      height: vertical ? width : height,
    });
    const graph = createGraph({
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ id: "e", sourceId: "a", targetId: "b" }],
    });
    const input: LayeredPhaseInput = {
      graph,
      direction,
      settings: {},
      sizes: new Map(),
      constrainedLayerByNodeId: new Map(),
      spacing: { node: 20, layer: 20 },
      padding: { top: 12, left: 12, bottom: 12, right: 12 },
    };
    const placement = {
      rectByNodeId: new Map([
        ["a", r(12, 12, 30, 20)],
        ["b", r(150, 72, 40, 30)],
      ]),
    };
    const points = [
      [27, 12],
      [27, 2],
      [200, 2],
      [200, 112],
      [170, 112],
      [170, 102],
    ].map(([x, y]) => p(x!, y!));
    const routes = { pointsByEdgeId: new Map([["e", points]]) };
    applyGroupedEdgeLengthCompaction(input, placement, routes);
    const after = routes.pointsByEdgeId.get("e")!;
    expect(after.length).toBe(points.length);
    const source = placement.rectByNodeId.get("a")!,
      target = placement.rectByNodeId.get("b")!;
    const endpoint = (node: EntityRect, crossOffset: number) =>
      vertical
        ? { x: node.x + crossOffset, y: node.y + node.height / 2 }
        : { x: node.x + node.width / 2, y: node.y + crossOffset };
    expect(after[0]).toEqual(endpoint(source, 0));
    expect(after.at(-1)).toEqual(endpoint(target, vertical ? target.width : target.height));
    for (let i = 1; i < after.length; i++) {
      expect(after[i]!.x === after[i - 1]!.x || after[i]!.y === after[i - 1]!.y).toBe(true);
      for (const node of placement.rectByNodeId.values()) {
        const a = after[i - 1]!,
          b = after[i]!;
        const hits =
          a.x === b.x
            ? a.x > node.x &&
              a.x < node.x + node.width &&
              Math.max(a.y, b.y) > node.y &&
              Math.min(a.y, b.y) < node.y + node.height
            : a.y > node.y &&
              a.y < node.y + node.height &&
              Math.max(a.x, b.x) > node.x &&
              Math.min(a.x, b.x) < node.x + node.width;
        expect(hits).toBe(false);
      }
    }
  });
}
