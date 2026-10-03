import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import {
  attachExternalPortDummy,
  createExternalPortDummy,
} from "../src/layered/external-port-dummy";
import { nodeNodeSpacing } from "../src/layered/spacing";
import type { LayeredPhaseInput } from "../src/layered/types";

const graph = createGraph({
  id: "external-spacing",
  nodes: [
    "normal",
    "external-a",
    "external-b",
    "__layout_dummy:long:1",
    "__layout_dummy:label:e",
  ].map((id) => ({ id })),
  edges: [],
});
for (const node of graph.nodes.filter((node) => node.id.startsWith("external-"))) {
  attachExternalPortDummy(
    node,
    createExternalPortDummy({
      constraints: "FREE",
      side: "EAST",
      direction: "RIGHT",
      netFlow: 1,
      borderOffset: 5,
      size: { width: 0, height: 0 },
    }),
  );
}
const input: LayeredPhaseInput = {
  graph,
  sizes: new Map(),
  direction: "right",
  spacing: { node: 31, layer: 20 },
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  constrainedLayerByNodeId: new Map(),
  settings: {
    "spacing.portPort": 13,
    "spacing.edgeNode": 7,
    "spacing.edgeEdge": 5,
    "spacing.labelPortVertical": 2,
  },
};

it.each([
  ["external-a", "external-b", 13],
  ["external-a", "normal", 7],
  ["external-a", "__layout_dummy:long:1", 5],
  ["external-a", "__layout_dummy:label:e", 2],
] as const)("uses ELK type spacing for %s / %s", (first, second, expected) => {
  expect(nodeNodeSpacing(input, first, second)).toBe(expected);
  expect(nodeNodeSpacing(input, second, first)).toBe(expected);
});

it("uses the larger individual boundary-port spacing override", () => {
  const local = {
    ...input,
    nodeSettings: () => ({ "spacing.individual": { "spacing.portPort": 19 } }),
  };
  expect(nodeNodeSpacing(local, "external-a", "external-b")).toBe(19);
  expect(nodeNodeSpacing(local, "external-a", "normal")).toBe(7);
});
