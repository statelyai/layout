import { expect, it } from "vitest";
import { measureQuality } from "../scripts/heuristic-quality.mjs";
const node = (id, x, y, width = 20, height = 20, parentId = null) => ({
  id,
  x,
  y,
  width,
  height,
  parentId,
});
const route = (id, points) => [
  id,
  {
    sections: [
      { path: { start: points[0], segments: points.slice(1).map((to) => ({ kind: "line", to })) } },
    ],
  },
];
const point = (x, y) => ({ x, y });
const score = (nodes, edges, routes) => measureQuality({ nodes, edges, routes }, { nodes, edges });
it("counts crossings at distinct coordinates once per edge pair", () => {
  const edges = [
    { id: "a", sourceId: "1", targetId: "2" },
    { id: "b", sourceId: "3", targetId: "4" },
  ];
  const m = score([], edges, [
    route("a", [point(0, 10), point(20, 10)]),
    route("b", [point(10, 0), point(10, 20)]),
  ]);
  expect(m.edgeCrossings).toBe(1);
  expect(m.edgeOverlapLength).toBe(0);
});
it("unions shared tracks across section splits", () => {
  const edges = [{ id: "a" }, { id: "b" }];
  const m = score([], edges, [
    route("a", [point(0, 0), point(20, 0)]),
    route("b", [point(5, 0), point(10, 0), point(15, 0)]),
  ]);
  expect(m.edgeOverlapLength).toBe(10);
  expect(m.bends).toBe(0);
});
it("excludes only shared endpoint terminal regions", () => {
  const nodes = [node("s", 0, 0)];
  const edges = [
    { id: "a", sourceId: "s", targetId: "x" },
    { id: "b", sourceId: "s", targetId: "y" },
  ];
  const m = score(nodes, edges, [
    route("a", [point(20, 10), point(100, 10)]),
    route("b", [point(20, 10), point(100, 10)]),
  ]);
  expect(m.edgeOverlapLength).toBe(68);
});
it("projects nested leaf bounds without treating container containment as overlap", () => {
  const nodes = [node("g", 100, 200, 100, 100), node("n", 20, 30, 20, 20, "g")];
  const m = score(nodes, [{ id: "a" }], [route("a", [point(110, 240), point(150, 240)])]);
  expect(m.nodeHits).toBe(1);
  expect(m.nodeOverlaps).toBe(0);
});
it("treats label occlusion equally for continuous and gapped routes", () => {
  const edge = { id: "a", x: 5, y: -5, width: 10, height: 10 };
  const continuous = score([], [edge], [route("a", [point(0, 0), point(20, 0)])]);
  const split = [
    "a",
    {
      sections: [
        ...route("a", [point(0, 0), point(5, 0)])[1].sections,
        ...route("a", [point(15, 0), point(20, 0)])[1].sections,
      ],
    },
  ];
  expect(continuous.routeLength).toBe(score([], [edge], [split]).routeLength);
  expect(continuous.edgeLabelHits).toBe(0);
});
it("detects retracing, diagonals, and missing routes separately", () => {
  const m = score(
    [],
    [{ id: "a" }, { id: "b" }],
    [route("a", [point(0, 0), point(20, 0), point(5, 0), point(10, 5)])],
  );
  expect(m.selfRetraceLength).toBe(15);
  expect(m.diagonals).toBe(1);
  expect(m.missingRoutes).toBe(1);
});
it("counts edge-label intersections and label collisions", () => {
  const m = score(
    [node("n", 0, 0)],
    [{ id: "a" }, { id: "b", x: 5, y: 5, width: 10, height: 10 }],
    [route("a", [point(0, 10), point(20, 10)]), route("b", [point(25, 25), point(30, 25)])],
  );
  expect(m.edgeLabelHits).toBe(1);
  expect(m.labelNodeOverlaps).toBe(1);
});

it("detects diagonal node penetration and unrelated container overlap", () => {
  const m = score(
    [node("a", 5, 5, 10, 10), node("g", 4, 4, 30, 30), node("child", 2, 2, 5, 5, "g")],
    [{ id: "e" }],
    [route("e", [point(0, 0), point(20, 20)])],
  );
  expect(m.diagonals).toBe(1);
  expect(m.nodeHits).toBe(2);
  expect(m.nodeOverlaps).toBe(2);
});

it("includes terminal-region boundaries when excluding shared attachments", () => {
  const nodes = [node("s", 0, 0)];
  const edges = [
    { id: "a", sourceId: "s", targetId: "x" },
    { id: "b", sourceId: "s", targetId: "y" },
  ];
  const m = score(nodes, edges, [
    route("a", [point(0, -12), point(30, -12)]),
    route("b", [point(0, -12), point(30, -12)]),
  ]);
  expect(m.edgeOverlapLength).toBe(0);
});
