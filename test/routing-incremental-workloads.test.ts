import { describe, expect, it } from "vitest";
import { routingDragFrames, sparseRoutingFixture } from "../bench/routing-fixtures";
import { orthogonalRouting } from "../src/routing";

describe.each([false, true])("sparse drag with custom settings %s", (customSettings) => {
  it("keeps each frame local and converges after a complete drag sequence", () => {
    const fixture = sparseRoutingFixture(1000, customSettings);
    const initial = orthogonalRouting.route(fixture.graph, fixture.settings);
    let previous = initial;
    const edits = routingDragFrames(fixture, 40);
    for (const { graph, diff } of edits) {
      const guarded = new Proxy(graph, {
        get(target, key) {
          if (key === "nodes" || key === "edges") throw new Error("Full graph read during drag");
          return Reflect.get(target, key);
        },
      });
      const update = orthogonalRouting.update(guarded, previous, diff);
      expect(update.snapshot.metrics.affectedEdges).toBe(1);
      expect(update.snapshot.metrics.routedEdges).toBe(1);
      expect(update.snapshot.metrics.obstacleCandidates).toBeLessThan(100);
      expect(update.patches.map((patch) => patch.edgeId)).toEqual(["edge500"]);
      expect(update.snapshot.routes.get("edge0")).toBe(initial.routes.get("edge0"));
      previous = update.snapshot;
    }
    expect([...previous.routes]).toEqual([
      ...orthogonalRouting.route(edits.at(-1)!.graph, fixture.settings).routes,
    ]);
    expect(initial.revision).toBe(0);
    expect(previous.revision).toBe(40);
  });
});
