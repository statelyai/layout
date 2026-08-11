import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

it("matches ELK's non-serialized incremental metadata options", async () => {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.debugMode": "true",
      "elk.interactiveLayout": "true",
      "elk.layered.generatePositionAndLayerIds": "true",
      "elk.topdown.scaleFactor": "0.5",
    },
    children: [
      {
        id: "a",
        width: 20,
        height: 20,
        layoutOptions: {
          "elk.layered.layering.layerId": "8",
          "elk.layered.crossingMinimization.positionId": "4",
          "elk.layered.layering.layerChoiceConstraint": "0",
          "elk.layered.crossingMinimization.positionChoiceConstraint": "0",
          "elk.layered.crossingMinimization.inLayerPredOf": "b",
          "elk.topdown.scaleFactor": "2",
        },
      },
      {
        id: "b",
        width: 20,
        height: 20,
        layoutOptions: {
          "elk.layered.layering.layerId": "2",
          "elk.layered.crossingMinimization.positionId": "1",
          "elk.layered.layering.layerChoiceConstraint": "1",
          "elk.layered.crossingMinimization.positionChoiceConstraint": "0",
          "elk.layered.crossingMinimization.inLayerSuccOf": "a",
        },
      },
    ],
    edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
  };
  const expected = (await new OracleELK().layout(structuredClone(graph) as never)) as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect(actual.children?.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual(
    expected.children?.map(({ x, y, width, height }) => ({ x, y, width, height })),
  );
  expect(actual.edges?.map((edge) => edge.sections)).toEqual(
    expected.edges?.map((edge) => edge.sections),
  );
});
