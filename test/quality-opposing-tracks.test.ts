import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { getLayeredLayout } from "../src";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { HARD, score } from "../scripts/parity/quality-gate";
import { measureQuality } from "../scripts/heuristic-quality.mjs";
import { separateOpposingTracks } from "../src/layered/opposing-tracks";
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

// Merged portless edges attach at one point per node side, so an edge and a
// reversed edge between the same nodes run on one straight line. That point
// is an implicit shared port: each direction gets its own attachment.
// Ends less than EPS apart count as one point.
it.each([0, 1e-7])("splits portless ends that share one attachment point (off by %s)", (off) => {
  const nodes = new Map([
    ["a", { x: 0, y: 0, width: 60, height: 40 }],
    ["b", { x: 200, y: 0, width: 60, height: 40 }],
  ]);
  const changed = separateOpposingTracks({
    nodes,
    leaves: new Set(nodes.keys()),
    spacing: 10,
    routes: [
      {
        id: "ab",
        ends: ["a", "b"],
        points: [
          { x: 60, y: 20 },
          { x: 200, y: 20 },
        ],
      },
      {
        id: "ba",
        ends: ["b", "a"],
        points: [
          { x: 200, y: 20 + off },
          { x: 60, y: 20 + off },
        ],
      },
    ].map((route) => ({ ...route, labels: [], movable: true })),
  });
  const ab = changed.get("ab")!,
    ba = changed.get("ba")!;
  // Both stay straight, on the node sides, a spacing apart.
  expect(ab.map((p) => p.x)).toEqual([60, 200]);
  expect(ba.map((p) => p.x)).toEqual([200, 60]);
  expect(ab[0]!.y).toBe(ab[1]!.y);
  expect(ba[0]!.y).toBe(ba[1]!.y);
  expect(Math.abs(ab[0]!.y - ba[0]!.y)).toBeCloseTo(10);
});

it("never shares a track in opposite directions with merged edges", async () => {
  const sizes = [
    [72, 54],
    [60, 42],
    [84, 42],
    [60, 46],
    [96, 50],
  ];
  const ends = [
    [4, 0],
    [2, 3],
    [0, 4],
    [0, 4],
    [2, 4],
    [3, 1],
    [1, 4],
    [4, 0],
    [4, 1],
  ];
  const input: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "LEFT",
      "elk.layered.mergeEdges": "true",
    },
    children: sizes.map(([width, height], i) => ({ id: `n${i}`, width, height })),
    edges: ends.map(([source, target], i) => ({
      id: `e${i}`,
      sources: [`n${source}`],
      targets: [`n${target}`],
    })),
  };
  const layout = await new NativeELK().layout(structuredClone(input));
  expect(hard(score(layout, input))).toEqual(clean);
});
