import { describe, expect, it } from "vitest";
import ELK, { type ElkNode } from "../src/elkjs";

const directions = ["DOWN", "UP", "RIGHT", "LEFT"];
function separate(a: ElkNode, b: ElkNode) {
  return (
    a.x! + a.width! <= b.x! ||
    b.x! + b.width! <= a.x! ||
    a.y! + a.height! <= b.y! ||
    b.y! + b.height! <= a.y!
  );
}

describe.each(directions)("inline label constraints (%s)", (direction) => {
  it.each(
    ["NORTH", "NORTH_SOUTH", "EQUALLY"].flatMap((distribution) =>
      ["STACKED", "REVERSE_STACKED", "SEQUENCED"].map((ordering) => ({ distribution, ordering })),
    ),
  )(
    "reserves neighboring-node clearance for $distribution/$ordering loops",
    async ({ distribution, ordering }) => {
      const result = await new ELK().layout({
        id: "root",
        layoutOptions: { "elk.direction": direction },
        children: [
          { id: "a", width: 200, height: 100 },
          {
            id: "b",
            width: 200,
            height: 100,
            layoutOptions: {
              "elk.layered.edgeRouting.selfLoopDistribution": distribution,
              "elk.layered.edgeRouting.selfLoopOrdering": ordering,
            },
          },
          { id: "c", width: 200, height: 100 },
        ],
        edges: [
          { id: "ab", sources: ["a"], targets: ["b"] },
          { id: "bc", sources: ["b"], targets: ["c"] },
          ...Array.from({ length: distribution === "EQUALLY" ? 4 : 2 }, (_, i) => ({
            id: `loop${i}`,
            sources: ["b"],
            targets: ["b"],
            labels: [
              {
                id: `label${i}`,
                width: 160,
                height: 140,
                layoutOptions: { "elk.edgeLabels.inline": true },
              },
            ],
          })),
        ],
      });
      for (const edge of result.edges!)
        for (const label of edge.labels ?? [])
          for (const node of result.children!)
            expect(separate(label as ElkNode, node), `${edge.id}/${node.id}`).toBe(true);
    },
  );

  it.each(["NONE", "LEFT", "RIGHT"])(
    "keeps tall/wide center labels inside reserved endpoint intervals (%s)",
    async (compaction) => {
      const result = await new ELK().layout({
        id: "root",
        layoutOptions: {
          "elk.direction": direction,
          "elk.layered.compaction.postCompaction.strategy": compaction,
        },
        children: [
          { id: "a", width: 100, height: 80 },
          { id: "b", width: 120, height: 100 },
          { id: "c", width: 100, height: 80 },
        ],
        edges: [
          ["a", "b"],
          ["b", "c"],
          ["c", "a"],
        ].map(([source, target], i) => ({
          id: `e${i}`,
          sources: [source!],
          targets: [target!],
          labels: [
            {
              id: `l${i}`,
              width: 240,
              height: 160,
              layoutOptions: { "elk.edgeLabels.inline": true },
            },
          ],
        })),
      });
      const nodes = new Map(result.children!.map((n) => [n.id, n]));
      const axis = direction === "RIGHT" || direction === "LEFT" ? "x" : "y";
      const size = axis === "x" ? "width" : "height";
      for (const edge of result.edges!) {
        const source = nodes.get(edge.sources![0]!)!;
        const target = nodes.get(edge.targets![0]!)!;
        const label = edge.labels![0]!;
        expect(label[axis]).toBeGreaterThanOrEqual(
          Math.min(source[axis]! + source[size]!, target[axis]! + target[size]!),
        );
        expect(label[axis]! + label[size]!).toBeLessThanOrEqual(
          Math.max(source[axis]!, target[axis]!),
        );
      }
    },
  );

  it.each(["NORTH", "SOUTH", "EAST", "WEST"])(
    "reserves labeled fixed-port loops on %s",
    async (side) => {
      const result = await new ELK().layout({
        id: "root",
        layoutOptions: { "elk.direction": direction },
        children: [
          { id: "a", width: 200, height: 100 },
          {
            id: "b",
            width: 200,
            height: 100,
            layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
            ports: ["s", "t"].map((id) => ({
              id,
              width: 0,
              height: 0,
              layoutOptions: { "elk.port.side": side },
            })),
          },
          { id: "c", width: 200, height: 100 },
        ],
        edges: [
          { id: "ab", sources: ["a"], targets: ["b"] },
          { id: "bc", sources: ["b"], targets: ["c"] },
          {
            id: "loop",
            sources: ["s"],
            targets: ["t"],
            labels: [
              {
                id: "l",
                width: 160,
                height: 140,
                layoutOptions: { "elk.edgeLabels.inline": true },
              },
            ],
          },
        ],
      });
      const label = result.edges![2]!.labels![0]!;
      for (const node of result.children!)
        expect(separate(label as ElkNode, node), `${side}/${node.id}`).toBe(true);
    },
  );

  it.each(["edge", "label", "override"])(
    "preserves ancestor loop routing with %s-level inline options",
    async (level) => {
      const options = { "elk.edgeLabels.inline": true, "elk.edgeLabels.placement": "CENTER" };
      const result = await new ELK().layout({
        id: "root",
        layoutOptions: { "elk.direction": direction, "elk.hierarchyHandling": "INCLUDE_CHILDREN" },
        children: [{ id: "p", children: [{ id: "c", width: 100, height: 80 }] }],
        edges: [
          {
            id: "pc",
            sources: ["p"],
            targets: ["c"],
            layoutOptions:
              level === "edge"
                ? options
                : level === "override"
                  ? { "elk.edgeLabels.inline": false, "elk.edgeLabels.placement": "HEAD" }
                  : {},
            labels: [
              { id: "l", width: 120, height: 60, layoutOptions: level !== "edge" ? options : {} },
            ],
          },
        ],
      });
      const edge = result.edges![0]!;
      expect(separate(edge.labels![0]! as ElkNode, result.children![0]!)).toBe(true);
      expect(edge.sections![0]!.bendPoints!.length).toBeGreaterThanOrEqual(2);
    },
  );
});
