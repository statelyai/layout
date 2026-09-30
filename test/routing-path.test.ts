import { segmentCrossesRect } from "../src/routing/path";
import { describe, expect, it } from "vitest";
import {
  flattenPath,
  getPathBounds,
  getPathLength,
  getPointAtLength,
  getTangentAtLength,
  pathFromPoints,
  roundCorners,
  toSvgPath,
  type RoutePath,
} from "../src/routing";
const cubic: RoutePath = {
  start: { x: 0, y: 0 },
  segments: [
    {
      kind: "cubic",
      control1: { x: 0, y: 100 },
      control2: { x: 100, y: 100 },
      to: { x: 100, y: 0 },
    },
  ],
};
describe("route geometry", () => {
  it("serializes mixed segments without changing the source", () => {
    const path: RoutePath = {
      start: { x: 0, y: 0 },
      segments: [
        { kind: "line", to: { x: 10, y: 0 } },
        { kind: "quadratic", control: { x: 20, y: 0 }, to: { x: 20, y: 10 } },
        {
          kind: "arc",
          rx: 10,
          ry: 10,
          rotation: 0,
          largeArc: false,
          sweep: true,
          to: { x: 30, y: 20 },
        },
      ],
    };
    expect(toSvgPath(path)).toBe("M 0 0 L 10 0 Q 20 0 20 10 A 10 10 0 0 1 30 20");
  });
  it("flattens curves rather than connecting only their endpoints", () => {
    const points = flattenPath(cubic, { tolerance: 0.1 });
    expect(points.length).toBeGreaterThan(10);
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(75);
    expect(points[0]).toEqual(cubic.start);
    expect(points.at(-1)).toEqual({ x: 100, y: 0 });
    expect(getPathLength(cubic, { tolerance: 0.001 })).toBeCloseTo(200, 2);
    expect(getPointAtLength(cubic, 100, { tolerance: 0.001 }).x).toBeCloseTo(50, 2);
    expect(getTangentAtLength(cubic, 0, { tolerance: 0.001 }).y).toBeCloseTo(1, 3);
  });
  it("captures collinear overshooting control points", () => {
    const path: RoutePath = {
      start: { x: 0, y: 0 },
      segments: [{ kind: "quadratic", control: { x: 100, y: 0 }, to: { x: 10, y: 0 } }],
    };
    expect(Math.max(...flattenPath(path).map((p) => p.x))).toBeGreaterThan(40);
  });
  it("flattens radius-corrected, rotated, large elliptical arcs", () => {
    const path: RoutePath = {
      start: { x: 0, y: 0 },
      segments: [
        {
          kind: "arc",
          rx: 10,
          ry: 5,
          rotation: 30,
          largeArc: true,
          sweep: false,
          to: { x: 80, y: 30 },
        },
      ],
    };
    const points = flattenPath(path, { tolerance: 0.05 }),
      bounds = getPathBounds(path);
    expect(points.length).toBeGreaterThan(15);
    expect(points.at(-1)).toEqual({ x: 80, y: 30 });
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(bounds.x - 1e-8);
      expect(p.x).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-8);
      expect(p.y).toBeGreaterThanOrEqual(bounds.y - 1e-8);
      expect(p.y).toBeLessThanOrEqual(bounds.y + bounds.height + 1e-8);
    }
  });
  it("clamps corner radii on short segments and preserves endpoints", () => {
    const path = pathFromPoints([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
        { x: 40, y: 10 },
      ]),
      rounded = roundCorners(path, { radius: 100 });
    expect(rounded.start).toEqual(path.start);
    expect(rounded.segments.at(-1)!.to).toEqual({ x: 40, y: 10 });
    expect(rounded.segments.filter((s) => s.kind === "arc").map((s) => s.rx)).toEqual([
      expect.closeTo(5),
      expect.closeTo(5),
    ]);
    expect(toSvgPath(path, { radius: 100 })).toContain("A 5 5");
    expect(path.segments.every((s) => s.kind === "line")).toBe(true);
  });
  it("reports impossible approximation budgets", () => {
    expect(() => flattenPath(cubic, { tolerance: 0 })).toThrow();
    expect(() => flattenPath(cubic, { tolerance: 0.001, maxSegments: 2 })).toThrow(/maxSegments/);
  });
  it("handles zero-length paths", () => {
    const path = pathFromPoints([{ x: 2, y: 3 }]);
    expect(getPathLength(path)).toBe(0);
    expect(getPointAtLength(path, 10)).toEqual({ x: 2, y: 3 });
    expect(getTangentAtLength(path, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("curve obstacle intersection", () => {
  it("distinguishes a cubic hull overlap from an actual thin obstacle crossing", () => {
    const segment = cubic.segments[0]!;
    expect(segmentCrossesRect(cubic.start, segment, { x: 45, y: 10, width: 10, height: 10 })).toBe(
      false,
    );
    expect(
      segmentCrossesRect(cubic.start, segment, {
        x: 49.999,
        y: 74.999,
        width: 0.002,
        height: 0.002,
      }),
    ).toBe(true);
  });
  it("detects quadratic crossings without treating the whole hull as occupied", () => {
    const segment = {
      kind: "quadratic" as const,
      control: { x: 50, y: 100 },
      to: { x: 100, y: 0 },
    };
    expect(segmentCrossesRect({ x: 0, y: 0 }, segment, { x: 49, y: 49, width: 2, height: 2 })).toBe(
      true,
    );
    expect(segmentCrossesRect({ x: 0, y: 0 }, segment, { x: 49, y: 89, width: 2, height: 2 })).toBe(
      false,
    );
  });
  it("uses the actual arc sweep instead of the full ellipse", () => {
    const segment = {
      kind: "arc" as const,
      rx: 10,
      ry: 10,
      rotation: 0,
      largeArc: false,
      sweep: true,
      to: { x: 10, y: 0 },
    };
    const start = { x: 0, y: 10 };
    expect(segmentCrossesRect(start, segment, { x: 8, y: 8, width: 1, height: 1 })).toBe(false);
    expect(segmentCrossesRect(start, segment, { x: 2.9, y: 2.9, width: 0.1, height: 0.1 })).toBe(
      true,
    );
    expect(segmentCrossesRect(start, segment, { x: 15, y: 15, width: 1, height: 1 })).toBe(false);
  });
});
