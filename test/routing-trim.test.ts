import { expect, it } from "vitest";
import { getPathLength, pathFromPoints, trimPath } from "../src/routing/path";
import type { RoutePath } from "../src/routing/types";

it("trims across polyline corners without diagonal shortcuts", () => {
  const path = pathFromPoints([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 20 },
  ]);
  expect(trimPath(path, { start: 15, end: 5 })).toEqual(
    pathFromPoints([
      { x: 10, y: 5 },
      { x: 10, y: 15 },
    ]),
  );
  expect(trimPath(path)).toBe(path);
  expect(trimPath(path, { start: 50 }).segments).toEqual([]);
});

it.each<RoutePath>([
  {
    start: { x: 0, y: 0 },
    segments: [{ kind: "quadratic", control: { x: 80, y: 100 }, to: { x: 200, y: 0 } }],
  },
  {
    start: { x: 0, y: 0 },
    segments: [
      {
        kind: "cubic",
        control1: { x: 0, y: 100 },
        control2: { x: 200, y: 100 },
        to: { x: 200, y: 0 },
      },
    ],
  },
  {
    start: { x: 0, y: 0 },
    segments: [
      {
        kind: "arc",
        rx: 100,
        ry: 100,
        rotation: 0,
        largeArc: false,
        sweep: true,
        to: { x: 200, y: 0 },
      },
    ],
  },
  {
    start: { x: 0, y: 0 },
    segments: [
      {
        kind: "arc",
        rx: 2,
        ry: 3,
        rotation: 35,
        largeArc: true,
        sweep: false,
        to: { x: 200, y: 0 },
      },
    ],
  },
])("retains curve kind and removes requested arc lengths", (path) => {
  const trimmed = trimPath(path, { start: 10, end: 20, tolerance: 0.001 });
  expect(trimmed.segments[0]?.kind).toBe(path.segments[0]?.kind);
  expect(
    getPathLength(path, { tolerance: 0.001 }) - getPathLength(trimmed, { tolerance: 0.001 }),
  ).toBeCloseTo(30, 1);
  expect(path.start).toEqual({ x: 0, y: 0 });
});

it("rejects malformed marker gaps", () => {
  expect(() => trimPath(pathFromPoints([{ x: 0, y: 0 }]), { end: -1 })).toThrow(RangeError);
});

it("does not trim past a requested marker gap on a straight cubic", () => {
  const path = {
    start: { x: 0, y: 600 },
    segments: [
      {
        kind: "cubic",
        control1: { x: 0, y: 550 },
        control2: { x: 0, y: 550 },
        to: { x: 0, y: 500 },
      },
    ],
  } satisfies import("../src/routing/types").RoutePath;
  const trimmed = trimPath(path, { end: 10 });
  expect(trimmed.segments.at(-1)!.to.y - 500).toBeLessThanOrEqual(10);
});
