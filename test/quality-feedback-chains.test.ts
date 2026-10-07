import fs from "node:fs";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { HARD, score } from "../scripts/parity/quality-gate";

const hard = (layout: ElkNode, input: ElkNode) => {
  const metrics = score(layout, input);
  return Object.fromEntries(HARD.map((key) => [key, metrics[key]]));
};
const clean = Object.fromEntries(HARD.map((key) => [key, 0]));

// Reversed feedback edges split by center-label and inverted-port dummies
// run as one feedback track instead of detouring around every segment.
it.each(["RIGHT", "LEFT", "DOWN", "UP"])(
  "routes cross-hierarchy feedback edges as one track: %s",
  async (direction) => {
    const input = JSON.parse(
      fs.readFileSync(new URL("fixtures/cross-hierarchy-viz.json", import.meta.url), "utf8"),
    ) as ElkNode;
    for (const node of [input, ...(input.children ?? [])])
      if (node === input || node.layoutOptions?.["elk.direction"])
        node.layoutOptions = { ...node.layoutOptions, "elk.direction": direction };
    expect(hard(await new NativeELK().layout(structuredClone(input)), input)).toEqual(clean);
  },
  30000,
);

it("routes a labeled feedback edge on one track", async () => {
  const label = (id: string) => [
    {
      id: `${id}:label`,
      text: id,
      width: 60,
      height: 20,
      layoutOptions: { "elk.edgeLabels.inline": "true", "elk.edgeLabels.placement": "CENTER" },
    },
  ];
  const input: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.layered.feedbackEdges": "true",
      "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
    },
    children: ["a", "b", "c"].map((id) => ({ id, width: 100, height: 60 })),
    edges: [
      ["a", "b"],
      ["b", "c"],
      ["c", "a"],
    ].map(([source, target]) => ({
      id: `${source}${target}`,
      sources: [source!],
      targets: [target!],
      labels: label(`${source}${target}`),
    })),
  };
  const layout = await new NativeELK().layout(structuredClone(input));
  expect(hard(layout, input)).toEqual(clean);
  const feedback = layout.edges!.find((edge) => edge.id === "ca")!.sections![0]!;
  expect(feedback.bendPoints).toHaveLength(4);
});
