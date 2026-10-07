import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { removeCenterLabelJunctions } from "../src/layered/center-labels";
import { joinLongEdgeRoutes, type LongEdgeExpansion } from "../src/layered/long-edges";

for (const direction of ["right", "left", "down", "up"] as const) {
  it(`preserves a label-port turn when joining compacted ${direction} tracks`, () => {
    const horizontal = direction === "right" || direction === "left";
    const p = (flow: number, cross: number) =>
      horizontal ? { x: flow, y: cross } : { x: cross, y: flow };
    const id = "__layout_dummy:label:edge";
    const graph = createGraph({
      nodes: [{ id: "a" }, { id }, { id: "b" }],
      edges: [
        { id: "first", sourceId: "a", targetId: id },
        { id: "last", sourceId: id, targetId: "b" },
      ],
    });
    const expansion: LongEdgeExpansion = {
      input: {
        graph,
        sizes: new Map(),
        constrainedLayerByNodeId: new Map(),
        direction,
        spacing: { node: 3, layer: 4 },
        padding: { top: 2, bottom: 2, left: 2, right: 2 },
        settings: {},
      },
      orientation: { reversedEdgeIds: new Set() },
      assignment: { layerByNodeId: new Map() },
      segmentIdsByEdgeId: new Map([["edge", ["first", "last"]]]),
      labelDummyIdByEdgeId: new Map([["edge", id]]),
    };
    const routes = {
      pointsByEdgeId: new Map([
        ["first", [p(0, 0), p(10, 0), p(10, 5)]],
        ["last", [p(12, 5), p(12, 3), p(20, 3)]],
      ]),
    };
    const joined = joinLongEdgeRoutes(
      removeCenterLabelJunctions(routes, expansion, expansion.labelDummyIdByEdgeId, "ORTHOGONAL"),
      expansion.segmentIdsByEdgeId,
      false,
      false,
      10,
      true,
    ).pointsByEdgeId.get("edge")!;
    expect(joined[0]).toEqual(p(0, 0));
    expect(joined.at(-1)).toEqual(p(20, 3));
    for (let index = 1; index < joined.length; index++) {
      expect(
        joined[index]!.x === joined[index - 1]!.x || joined[index]!.y === joined[index - 1]!.y,
      ).toBe(true);
    }
    expect(joined).toContainEqual(p(10, 5));
    expect(joined).toContainEqual(p(12, 5));
  });
}
