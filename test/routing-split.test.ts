import { expect, it } from "vitest";
import { splitPathAtBounds } from "../src/routing/path-split";
import { flattenPath, getPathLength, pathFromPoints, splitSegment } from "../src/routing/path";
import type { RouteBounds, RoutePath } from "../src/routing/types";

function boundary(point: { x: number; y: number }, bounds: RouteBounds) {
  expect(point.x).toBeGreaterThanOrEqual(bounds.x - 1e-6);
  expect(point.x).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-6);
  expect(point.y).toBeGreaterThanOrEqual(bounds.y - 1e-6);
  expect(point.y).toBeLessThanOrEqual(bounds.y + bounds.height + 1e-6);
  expect(
    Math.min(
      Math.abs(point.x - bounds.x),
      Math.abs(point.x - bounds.x - bounds.width),
      Math.abs(point.y - bounds.y),
      Math.abs(point.y - bounds.y - bounds.height),
    ),
  ).toBeLessThan(1e-6);
}

it("cuts a line at the label borders", () => {
  const path = pathFromPoints([
    { x: 0, y: 10 },
    { x: 100, y: 10 },
  ]);
  expect(splitPathAtBounds(path, { x: 40, y: 0, width: 20, height: 20 })).toEqual({
    before: pathFromPoints([
      { x: 0, y: 10 },
      { x: 40, y: 10 },
    ]),
    after: pathFromPoints([
      { x: 60, y: 10 },
      { x: 100, y: 10 },
    ]),
  });
});

it("keeps the outer legs across multiple entries and exits", () => {
  const path = pathFromPoints([
    { x: 0, y: 10 },
    { x: 100, y: 10 },
    { x: 0, y: 20 },
    { x: 100, y: 20 },
  ]);
  const result = splitPathAtBounds(path, { x: 40, y: 0, width: 20, height: 30 })!;
  expect(result.before).toEqual(
    pathFromPoints([
      { x: 0, y: 10 },
      { x: 40, y: 10 },
    ]),
  );
  expect(result.after).toEqual(
    pathFromPoints([
      { x: 60, y: 20 },
      { x: 100, y: 20 },
    ]),
  );
});

const curves: RoutePath[] = [
  {
    start: { x: 0, y: 0 },
    segments: [{ kind: "quadratic", control: { x: 100, y: 100 }, to: { x: 200, y: 0 } }],
  },
  {
    start: { x: 0, y: 0 },
    segments: [
      {
        kind: "cubic",
        control1: { x: 30, y: 100 },
        control2: { x: 170, y: 100 },
        to: { x: 200, y: 0 },
      },
    ],
  },
  {
    start: { x: 0, y: 0 },
    segments: [
      {
        kind: "arc",
        rx: 120,
        ry: 70,
        rotation: 35,
        largeArc: true,
        sweep: false,
        to: { x: 200, y: 0 },
      },
    ],
  },
  {
    start: { x: 0, y: 0 },
    segments: [
      {
        kind: "arc",
        rx: 20,
        ry: 10,
        rotation: -20,
        largeArc: false,
        sweep: true,
        to: { x: 200, y: 0 },
      },
    ],
  },
];
it.each(curves)("preserves exact curve families at boundary intersections", (path) => {
  const midpoint = splitSegment(path.start, path.segments[0]!, 0.5)[1].start;
  const bounds = { x: midpoint.x - 10, y: midpoint.y - 10, width: 20, height: 20 };
  const result = splitPathAtBounds(path, bounds)!;
  expect(result).toBeDefined();
  expect(result.before.segments[0]!.kind).toBe(path.segments[0]!.kind);
  expect(result.after.segments[0]!.kind).toBe(path.segments[0]!.kind);
  boundary(result.before.segments.at(-1)!.to, bounds);
  boundary(result.after.start, bounds);
  expect(result.before.start).toEqual(path.start);
  expect(result.after.segments.at(-1)!.to).toEqual(path.segments[0]!.to);
  expect(getPathLength(result.before) + getPathLength(result.after)).toBeLessThan(
    getPathLength(path),
  );
  for (const part of [result.before, result.after])
    for (const point of flattenPath(part, { tolerance: 0.01 }))
      expect(
        point.x <= bounds.x + 1e-7 ||
          point.x >= bounds.x + bounds.width - 1e-7 ||
          point.y <= bounds.y + 1e-7 ||
          point.y >= bounds.y + bounds.height - 1e-7,
      ).toBe(true);
});

it("ignores tangent touches, boundary runs and paths ending inside", () => {
  const tangent: RoutePath = {
    start: { x: 0, y: 100 },
    segments: [{ kind: "quadratic", control: { x: 100, y: 0 }, to: { x: 200, y: 100 } }],
  };
  expect(splitPathAtBounds(tangent, { x: 80, y: -20, width: 40, height: 70 })).toBeUndefined();
  expect(
    splitPathAtBounds(
      pathFromPoints([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
      { x: 40, y: 0, width: 20, height: 20 },
    ),
  ).toBeUndefined();
  expect(
    splitPathAtBounds(
      pathFromPoints([
        { x: 0, y: 10 },
        { x: 50, y: 10 },
      ]),
      { x: 40, y: 0, width: 20, height: 20 },
    ),
  ).toBeUndefined();
});

it("rejects malformed bounds and handles degenerate bounds", () => {
  const path = pathFromPoints([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]);
  expect(() => splitPathAtBounds(path, { x: 0, y: 0, width: -1, height: 20 })).toThrow(RangeError);
  expect(splitPathAtBounds(path, { x: 20, y: 0, width: 0, height: 20 })).toBeUndefined();
});
