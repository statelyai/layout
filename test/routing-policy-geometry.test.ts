import { describe, expect, it } from "vitest";
import { flattenPath, pathFromPoints } from "../src/routing/path";
import {
  bezierThroughPoints,
  catmullRomPath,
  clipPathOutsideRect,
  pathEndpointTangent,
  pathReverseTravel,
  placeFollowingLabel,
} from "../src/routing/policy-geometry";
import type { RoutePath, RoutePoint } from "../src/routing/types";

function expectDirection(actual: RoutePoint, expected: RoutePoint) {
  const length = Math.hypot(expected.x, expected.y);
  expect(actual.x).toBeCloseTo(expected.x / length, 10);
  expect(actual.y).toBeCloseTo(expected.y / length, 10);
}

const knots = [
  { x: 0, y: 0 },
  { x: 80, y: 25 },
  { x: 100, y: 170 },
  { x: 270, y: 100 },
];
const families = [
  { name: "Catmull–Rom", build: catmullRomPath },
  {
    name: "Bézier",
    build: (points: readonly RoutePoint[], tangents: ReadonlyMap<number, RoutePoint> = new Map()) =>
      bezierThroughPoints(points, tangents, 0.5),
  },
];

describe.each(families)("$name policy geometry", ({ build }) => {
  it("interpolates every authored knot, with continuous automatic tangent directions", () => {
    const path = build(knots);
    expect([path.start, ...path.segments.map((segment) => segment.to)]).toEqual(knots);
    for (let i = 1; i < path.segments.length; i++) {
      const left = { start: knots[i - 1]!, segments: [path.segments[i - 1]!] };
      const right = { start: knots[i]!, segments: [path.segments[i]!] };
      expectDirection(pathEndpointTangent(left, "end"), pathEndpointTangent(right, "start"));
    }
  });

  it("uses normalized travel directions independently at source, label, and target", () => {
    const directions = new Map([
      [0, { x: 3, y: 4 }],
      [1, { x: -7, y: 2 }],
      [3, { x: -12, y: -5 }],
    ]);
    const path = build(knots, directions);
    expectDirection(pathEndpointTangent(path, "start"), directions.get(0)!);
    expectDirection(pathEndpointTangent(path, "end"), directions.get(3)!);
    expectDirection(
      pathEndpointTangent({ start: knots[0]!, segments: [path.segments[0]!] }, "end"),
      directions.get(1)!,
    );
    expectDirection(
      pathEndpointTangent({ start: knots[1]!, segments: [path.segments[1]!] }, "start"),
      directions.get(1)!,
    );
  });

  it("collapses repeated knots while retaining tangent indices", () => {
    const repeated = [knots[0]!, knots[0]!, knots[1]!, knots[1]!, knots[2]!];
    const path = build(repeated, new Map([[3, { x: 2, y: 3 }]]));
    expect([path.start, ...path.segments.map((segment) => segment.to)]).toEqual(knots.slice(0, 3));
    expectDirection(
      pathEndpointTangent({ start: path.start, segments: [path.segments[0]!] }, "end"),
      { x: 2, y: 3 },
    );
    expect(flattenPath(path).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(build([knots[0]!, knots[0]!])).toEqual({ start: knots[0], segments: [] });
  });
});

it("uses chord-scaled Bézier handles and line-equivalent geometry at zero curvature", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ];
  const path = bezierThroughPoints(points, new Map([[0, { x: 0, y: 8 }]]), 0.2);
  expect(path.segments[0]).toMatchObject({ control1: { x: 0, y: 20 } });
  const zero = bezierThroughPoints(points, new Map(), 0);
  expect(zero.segments[0]).toMatchObject({ control1: points[0], control2: points[1] });
  expectDirection(pathEndpointTangent(zero, "start"), { x: 1, y: 0 });
  expectDirection(pathEndpointTangent(zero, "end"), { x: 1, y: 0 });
});

it("uses the first nonzero analytic derivative at degenerate endpoints", () => {
  const path: RoutePath = {
    start: { x: 0, y: 0 },
    segments: [
      { kind: "line", to: { x: 0, y: 0 } },
      { kind: "cubic", control1: { x: 0, y: 0 }, control2: { x: 3, y: 4 }, to: { x: 3, y: 4 } },
      { kind: "line", to: { x: 3, y: 4 } },
    ],
  };
  expectDirection(pathEndpointTangent(path, "start"), { x: 3, y: 4 });
  expectDirection(pathEndpointTangent(path, "end"), { x: 3, y: 4 });
});

describe("final curve monotonicity", () => {
  it("measures interior reversal even when the endpoint knots are monotonic", () => {
    const path: RoutePath = {
      start: { x: 0, y: 0 },
      segments: [
        {
          kind: "cubic",
          control1: { x: 5 / 6, y: 0 },
          control2: { x: -1 / 3, y: 0 },
          to: { x: 0.5, y: 0 },
        },
      ],
    };
    expect(pathReverseTravel(path, "x", path.start, path.segments[0]!.to)).toBeCloseTo(
      1 / (3 * Math.sqrt(6)),
      12,
    );
  });

  it("forbids excursions when endpoint coordinates are equal", () => {
    const path: RoutePath = {
      start: { x: 0, y: 0 },
      segments: [
        { kind: "cubic", control1: { x: 1, y: 1 }, control2: { x: 1, y: 2 }, to: { x: 0, y: 3 } },
      ],
    };
    expect(pathReverseTravel(path, "x", path.start, path.segments[0]!.to)).toBeCloseTo(1.5, 12);
    expect(pathReverseTravel(path, "y", path.start, path.segments[0]!.to)).toBe(0);
  });

  it("considers the full large-arc sweep and its analytic endpoint tangent", () => {
    const path: RoutePath = {
      start: { x: 1, y: 0 },
      segments: [
        {
          kind: "arc",
          rx: 1,
          ry: 1,
          rotation: 0,
          largeArc: true,
          sweep: true,
          to: { x: 0, y: -1 },
        },
      ],
    };
    expect(pathReverseTravel(path, "x", path.start, path.segments[0]!.to)).toBeCloseTo(1, 12);
    expect(pathReverseTravel(path, "both", path.start, path.segments[0]!.to)).toBeCloseTo(2, 12);
    expectDirection(pathEndpointTangent(path, "start"), { x: 0, y: 1 });
    expectDirection(pathEndpointTangent(path, "end"), { x: 1, y: 0 });
  });

  it("orients reverse travel by source-to-target displacement", () => {
    const path = pathFromPoints([
      { x: 100, y: 0 },
      { x: 50, y: 0 },
      { x: 60, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(pathReverseTravel(path, "x", path.start, { x: 0, y: 0 })).toBe(10);
  });
});

describe("passive label placement", () => {
  it("uses arc length on an asymmetric cubic instead of its parameter midpoint", () => {
    // x(t) = 100t^3, y(t) = 100t^2; arc length has a closed-form integral.
    const path: RoutePath = {
      start: { x: 0, y: 0 },
      segments: [
        {
          kind: "cubic",
          control1: { x: 0, y: 0 },
          control2: { x: 0, y: 100 / 3 },
          to: { x: 100, y: 100 },
        },
      ],
    };
    const t = Math.sqrt((((13 ** 1.5 + 8) / 2) ** (2 / 3) - 4) / 9);
    const label = placeFollowingLabel([path], { width: 20, height: 10 }, {});
    expect(label.anchor.x).toBeCloseTo(100 * t ** 3, 6);
    expect(label.anchor.y).toBeCloseTo(100 * t ** 2, 6);
    expect(label.bounds.x).toBeCloseTo(100 * t ** 3 - 10, 6);
    expect(label.bounds.y).toBeCloseTo(100 * t ** 2 - 5, 6);
    expect(label.tangent.x).toBeCloseTo((3 * t) / Math.hypot(3 * t, 2), 7);
    expect(label.tangent.y).toBeCloseTo(2 / Math.hypot(3 * t, 2), 7);
    expect(label.anchor.x).toBeGreaterThan(12.5 + 20);
  });

  it("measures across multiple paths without counting section gaps", () => {
    const paths = [
      pathFromPoints([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
      pathFromPoints([
        { x: 100, y: 0 },
        { x: 100, y: 30 },
      ]),
    ];
    const label = placeFollowingLabel(paths, { width: 10, height: 6 }, { offset: 4 });
    expect(label.anchor.x).toBeCloseTo(96, 7);
    expect(label.anchor.y).toBeCloseTo(10, 7);
    expectDirection(label.tangent, { x: 0, y: 1 });
    expect(placeFollowingLabel(paths, { width: 0, height: 0 }, { fraction: 1 }).anchor).toEqual({
      x: 100,
      y: 30,
    });
    expect(placeFollowingLabel(paths, { width: 0, height: 0 }, { fraction: 0 }).anchor).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("places degenerate paths without dividing by zero", () => {
    expect(
      placeFollowingLabel(
        [pathFromPoints([{ x: 5, y: 8 }])],
        { width: 10, height: 4 },
        { offset: 10 },
      ),
    ).toEqual({
      bounds: { x: 0, y: 6, width: 10, height: 4 },
      anchor: { x: 5, y: 8 },
      tangent: { x: 0, y: 0 },
    });
  });
});

describe("label gap clipping", () => {
  it("splits cubic geometry exactly at label borders", () => {
    const path = bezierThroughPoints(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      new Map(),
      0.5,
    );
    const pieces = clipPathOutsideRect(path, { x: 40, y: -10, width: 20, height: 20 });
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.segments.at(-1)!.to.x).toBeCloseTo(40, 10);
    expect(pieces[1]!.start.x).toBeCloseTo(60, 10);
    expect(
      pieces.every((piece) => piece.segments.every((segment) => segment.kind === "cubic")),
    ).toBe(true);
    expectDirection(pathEndpointTangent(pieces[0]!, "end"), { x: 1, y: 0 });
    expectDirection(pathEndpointTangent(pieces[1]!, "start"), { x: 1, y: 0 });
  });

  it("clips an interior curve excursion although its endpoints miss the label", () => {
    const path: RoutePath = {
      start: { x: 0, y: 0 },
      segments: [{ kind: "quadratic", control: { x: 50, y: 100 }, to: { x: 100, y: 0 } }],
    };
    const pieces = clipPathOutsideRect(path, { x: 30, y: 35, width: 40, height: 30 });
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.segments.at(-1)!.to).toEqual(
      expect.objectContaining({ x: expect.closeTo(30, 10), y: expect.closeTo(42, 10) }),
    );
    expect(pieces[1]!.start).toEqual(
      expect.objectContaining({ x: expect.closeTo(70, 10), y: expect.closeTo(42, 10) }),
    );
  });

  it("preserves a split arc's ellipse and sweep", () => {
    const path: RoutePath = {
      start: { x: 10, y: 0 },
      segments: [
        {
          kind: "arc",
          rx: 10,
          ry: 10,
          rotation: 0,
          largeArc: false,
          sweep: true,
          to: { x: -10, y: 0 },
        },
      ],
    };
    const pieces = clipPathOutsideRect(path, { x: -5, y: 5, width: 10, height: 10 });
    expect(pieces).toHaveLength(2);
    for (const piece of pieces) {
      expect(piece.segments[0]!.kind).toBe("arc");
      for (const p of flattenPath(piece, { tolerance: 0.01 }))
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 10);
    }
  });
});
