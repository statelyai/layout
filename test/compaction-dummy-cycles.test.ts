import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createGraph } from "@statelyai/graph";
import type { EntityRect, Point } from "@statelyai/graph";
import { applyGroupedEdgeLengthCompaction } from "../src/layered/grouped-compaction";
import type { LayeredPhaseInput } from "../src/layered/types";
for (const seed of [3468128618, 3468144456]) {
  it(`compacts saved random seed ${seed} without dummy constraint cycles`, () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL(`./fixtures/compaction-dummy-cycle-${seed}.json`, import.meta.url),
        "utf8",
      ),
    );
    const graph = createGraph(fixture.graph);
    const nodeSettings = new Map<
      string,
      ReturnType<NonNullable<LayeredPhaseInput["nodeSettings"]>>
    >(fixture.nodeSettings);
    const portSettings = new Map<
      string,
      ReturnType<NonNullable<LayeredPhaseInput["portSettings"]>>
    >(fixture.portSettings);
    const input: LayeredPhaseInput = {
      ...fixture,
      graph,
      sizes: new Map(),
      constrainedLayerByNodeId: new Map(),
      nodeSettings: (n) => nodeSettings.get(n.id),
      portSettings: (p, n) => portSettings.get(`${n.id}\0${p.name}`),
    };
    const placement = { rectByNodeId: new Map<string, EntityRect>(fixture.rects) };
    const routes = { pointsByEdgeId: new Map<string, readonly Point[]>(fixture.routes) };
    const originalRoutes = structuredClone(routes.pointsByEdgeId);
    const originalRects = structuredClone(placement.rectByNodeId);
    const horizontal = input.direction === "right" || input.direction === "left";
    applyGroupedEdgeLengthCompaction(input, placement, routes, {
      reversedEdgeIds: new Set(fixture.orientation),
    });
    expect(routes.pointsByEdgeId.size).toBe(originalRoutes.size);
    for (const [id, points] of routes.pointsByEdgeId) {
      const original = originalRoutes.get(id)!;
      expect(points).toHaveLength(original.length);
      for (const [i, p] of points.entries()) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${id}.${i}`).toBe(true);
        expect(horizontal ? p.y : p.x).toBe(horizontal ? original[i]!.y : original[i]!.x);
        if (i)
          expect(
            Math.abs(p.x - points[i - 1]!.x) < 1e-6 || Math.abs(p.y - points[i - 1]!.y) < 1e-6,
            `${id}.${i} orthogonal`,
          ).toBe(true);
      }
    }
    for (const [id, rect] of placement.rectByNodeId) {
      expect(rect.width).toBe(originalRects.get(id)!.width);
      expect(rect.height).toBe(originalRects.get(id)!.height);
      expect(Number.isFinite(rect.x) && Number.isFinite(rect.y), id).toBe(true);
    }
    expect(graph).toEqual(createGraph(fixture.graph));
  });
}
