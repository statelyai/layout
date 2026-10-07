import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { getLayeredLayout } from "../src";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { HARD, score } from "../scripts/parity/quality-gate";
import { measureQuality } from "../scripts/heuristic-quality.mjs";
import vizFeedbackForm from "./fixtures/viz-feedback-form.json";
import vizTwoStateCycle from "./fixtures/viz-two-state-cycle.json";

const hard = (metrics: Record<string, number>) =>
  Object.fromEntries(HARD.map((key) => [key, metrics[key]]));
const clean = Object.fromEntries(HARD.map((key) => [key, 0]));

// Two edges on one track heading opposite ways read as one path.
for (const [name, fixture] of [
  ["viz-feedback-form", vizFeedbackForm],
  ["viz-two-state-cycle", vizTwoStateCycle],
] as const)
  it(`never shares a track in opposite directions (${name})`, async () => {
    const input = fixture as ElkNode;
    const layout = await new NativeELK().layout(structuredClone(input));
    expect(hard(score(layout, input))).toEqual(clean);
  });

// One port carrying an outgoing edge and a feedback edge back into it.
const sharedPort: ElkNode = {
  id: "root",
  layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT" },
  children: [
    {
      id: "a",
      width: 60,
      height: 40,
      layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
      ports: [{ id: "a.p", width: 4, height: 4, layoutOptions: { "elk.port.side": "EAST" } }],
    },
    { id: "b", width: 60, height: 40 },
    { id: "c", width: 60, height: 40 },
  ],
  edges: [
    { id: "ab", sources: ["a.p"], targets: ["b"] },
    { id: "bc", sources: ["b"], targets: ["c"] },
    { id: "ca", sources: ["c"], targets: ["a.p"] },
  ],
};

it("attaches a port's incoming and outgoing edges at distinct points", async () => {
  const layout = await new NativeELK().layout(structuredClone(sharedPort));
  expect(hard(score(layout, sharedPort))).toEqual(clean);
  const sections = Object.fromEntries(layout.edges!.map((edge) => [edge.id, edge.sections![0]!]));
  const start = sections.ab!.startPoint,
    end = sections.ca!.endPoint;
  // Both attach on the port's side, between the node border and the port's
  // outer face, apart along it, so their stubs run parallel.
  const a = layout.children!.find((child) => child.id === "a")!;
  for (const point of [start, end]) {
    expect(point.x).toBeGreaterThanOrEqual(a.x! + a.width! - 1e-6);
    expect(point.x).toBeLessThanOrEqual(a.x! + a.width! + 4 + 1e-6);
  }
  expect(Math.abs(start.y - end.y)).toBeGreaterThanOrEqual(10 - 1e-6);
});

it("separates opposite directions in native layouts", () => {
  const graph = createGraph({
    nodes: [
      { id: "a", width: 60, height: 40, ports: [{ name: "p", direction: "inout" }] },
      { id: "b", width: 60, height: 40 },
      { id: "c", width: 60, height: 40 },
    ],
    edges: [
      { id: "ab", sourceId: "a", sourcePort: "p", targetId: "b" },
      { id: "bc", sourceId: "b", targetId: "c" },
      { id: "ca", sourceId: "c", targetId: "a", targetPort: "p" },
    ],
  });
  const layout = getLayeredLayout(graph, { direction: "right" });
  const metrics = measureQuality(
    {
      nodes: layout.nodes,
      edges: layout.edges.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
      routes: new Map(
        layout.edges.map((edge) => [
          edge.id,
          {
            sections: [
              {
                path: {
                  start: edge.points![0]!,
                  segments: edge.points!.slice(1).map((to) => ({ kind: "line", to })),
                },
              },
            ],
          },
        ]),
      ),
    },
    { nodes: layout.nodes, edges: graph.edges },
  ) as Record<string, number>;
  expect(hard(metrics)).toEqual(clean);
});
