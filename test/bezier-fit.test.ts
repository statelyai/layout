import type { RouteBounds as Rect } from "../src/routing/types";
import type { BezierGuide as PathData } from "../src/routing/bezier-fit";
import { describe, expect, it } from "vitest";
import {
  bezierAvoidsRect,
  fitBezierTransition,
  tryFitOrganicTransition,
  splitBezier,
  trimBezierPathStart,
  type CubicBezier,
} from "../src/routing/bezier-fit";

const label: Rect = { x: 200, y: 100, width: 100, height: 60 };
const source: PathData = {
  points: [
    { x: 100, y: 30 },
    { x: 150, y: 30 },
    { x: 150, y: 130 },
    { x: 200, y: 130 },
  ],
  sourceDirection: "right",
  targetDirection: "left",
};
const target: PathData = {
  points: [
    { x: 300, y: 130 },
    { x: 350, y: 130 },
    { x: 350, y: 240 },
    { x: 400, y: 240 },
  ],
  sourceDirection: "right",
  targetDirection: "left",
};
function curves(path: PathData): CubicBezier[] {
  if (!path.path) return [];
  let start = path.path.start;
  const result: CubicBezier[] = [];
  for (const segment of path.path.segments) {
    if (segment.kind !== "cubic") throw new Error("Expected cubic geometry");
    const curve = {
      start,
      control1: segment.control1,
      control2: segment.control2,
      end: segment.to,
    };
    result.push(curve);
    start = curve.end;
  }
  return result;
}

describe("Bézier routing", () => {
  it("keeps perpendicular state tangents and clips the center-directed curve at the label", () => {
    const fitted = fitBezierTransition({
      source,
      target,
      label,
      obstacles: [],
      avoidObstacles: false,
    });
    const first = curves(fitted.source)[0]!;
    const last = curves(fitted.target).at(-1)!;
    expect(first.start).toEqual(source.points[0]);
    expect(first.control1.y).toBe(first.start.y);
    expect(first.control1.x).toBeGreaterThan(first.start.x);
    expect(last.end).toEqual(target.points.at(-1));
    expect(last.control2.y).toBe(last.end.y);
    expect(last.control2.x).toBeLessThan(last.end.x);
    for (const point of [first.end, last.start]) {
      expect(point.x).toBeGreaterThanOrEqual(label.x - 1e-6);
      expect(point.x).toBeLessThanOrEqual(label.x + label.width + 1e-6);
      expect(point.y).toBeGreaterThanOrEqual(label.y - 1e-6);
      expect(point.y).toBeLessThanOrEqual(label.y + label.height + 1e-6);
      expect(
        Math.min(
          Math.abs(point.x - label.x),
          Math.abs(point.x - label.x - label.width),
          Math.abs(point.y - label.y),
          Math.abs(point.y - label.y - label.height),
        ),
      ).toBeLessThan(1e-6);
    }
  });

  it("joins both virtual label-center cubics with the same tangent", () => {
    const fitted = fitBezierTransition({
      source,
      target,
      label: { x: 250, y: 130, width: 0, height: 0 },
      obstacles: [],
      avoidObstacles: false,
    });
    const left = curves(fitted.source)[0]!;
    const right = curves(fitted.target)[0]!;
    expect(left.end).toEqual(right.start);
    const a = {
      x: left.end.x - left.control2.x,
      y: left.end.y - left.control2.y,
    };
    const b = {
      x: right.control1.x - right.start.x,
      y: right.control1.y - right.start.y,
    };
    expect(a.x * b.y - a.y * b.x).toBeCloseTo(0);
    expect(a.x * b.x + a.y * b.y).toBeGreaterThan(0);
    expect(a.x * 210 - a.y * 300).toBeCloseTo(0);
    expect(Math.abs(a.y)).toBeGreaterThan(0);
  });

  it.each([
    ["left", -1, 0],
    ["right", 1, 0],
    ["top", 0, -1],
    ["bottom", 0, 1],
  ] as const)("keeps both %s attachment tangents perpendicular", (side, x, y) => {
    const fitted = fitBezierTransition({
      source: { ...source, sourceDirection: side },
      target: { ...target, targetDirection: side },
      label,
      obstacles: [],
      avoidObstacles: false,
    });
    const first = curves(fitted.source)[0]!;
    const last = curves(fitted.target).at(-1)!;
    const departure = {
      x: first.control1.x - first.start.x,
      y: first.control1.y - first.start.y,
    };
    const outwardTarget = {
      x: last.control2.x - last.end.x,
      y: last.control2.y - last.end.y,
    };
    for (const vector of [departure, outwardTarget]) {
      expect(vector.x * y - vector.y * x).toBeCloseTo(0);
      expect(vector.x * x + vector.y * y).toBeGreaterThan(0);
    }
  });

  it("rejects a small obstacle hit between endpoints and retains a safe topology", () => {
    const direct = fitBezierTransition({
      source,
      target,
      label,
      obstacles: [],
      avoidObstacles: false,
    });
    const point = splitBezier(curves(direct.source)[0]!, 0.25)[0].end;
    const blocker = { x: point.x - 2, y: point.y - 2, width: 4, height: 4 };
    expect(bezierAvoidsRect(curves(direct.source)[0]!, blocker)).toBe(false);
    const avoided = fitBezierTransition({
      source,
      target,
      label,
      obstacles: [blocker],
      avoidObstacles: true,
    });
    expect(avoided.source.path).not.toEqual(direct.source.path);
    expect(
      [...curves(avoided.source), ...curves(avoided.target)].every((curve) =>
        bezierAvoidsRect(curve, blocker),
      ),
    ).toBe(true);
  });

  it("reduces corner smoothing near an obstacle without cutting the guide corner", () => {
    const blocker = { x: 151, y: 31, width: 20, height: 60 };
    const fitted = fitBezierTransition({
      source,
      target,
      label,
      obstacles: [blocker],
      avoidObstacles: true,
    });
    expect(curves(fitted.source).every((curve) => bezierAvoidsRect(curve, blocker))).toBe(true);
  });

  it("preserves empty routes", () => {
    const empty = { ...source, points: [], path: undefined };
    expect(
      fitBezierTransition({
        source: empty,
        target,
        label,
        obstacles: [],
        avoidObstacles: true,
      }).source,
    ).toBe(empty);
  });
});

const organicSource = { x: 0, y: 0, width: 100, height: 60 };
const organicTarget = { x: 500, y: 280, width: 100, height: 70 };
const organicLabel = { x: 260, y: 140, width: 80, height: 40 };
const sides = ["left", "right", "top", "bottom"] as const;
const organicEndpoints = {
  source: { kind: "floating", bounds: organicSource, sides },
  target: { kind: "floating", bounds: organicTarget, sides },
} as const;
const organicInput = {
  source,
  target,
  label: organicLabel,
  endpoints: organicEndpoints,
  obstacles: [organicSource, organicTarget],
  avoidObstacles: true,
};

describe("organic Bézier routing", () => {
  it("retains a safe semantic detour when the bounded organic search is exhausted", () => {
    const wall = { x: 40, y: -1000, width: 20, height: 2010 };
    const sourceBounds = { x: -30, y: -10, width: 20, height: 20 };
    const targetBounds = { x: 150, y: -10, width: 20, height: 20 };
    const input = {
      source: {
        points: [
          { x: -10, y: 0 },
          { x: -10, y: -1020 },
          { x: 80, y: -1020 },
          { x: 80, y: 0 },
          { x: 90, y: 0 },
        ],
        sourceDirection: "right",
        targetDirection: "left",
      },
      target: {
        points: [
          { x: 110, y: 0 },
          { x: 140, y: 0 },
        ],
        sourceDirection: "right",
        targetDirection: "left",
      },
      label: { x: 90, y: -10, width: 20, height: 20 },
      endpoints: {
        source: { kind: "floating", bounds: sourceBounds, sides },
        target: { kind: "floating", bounds: targetBounds, sides },
      },
      obstacles: [
        sourceBounds,
        targetBounds,
        wall,
        ...Array.from({ length: 48 }, (_, index) => ({
          x: 45 + index / 10,
          y: -1,
          width: 1,
          height: 2,
        })),
      ],
      avoidObstacles: true,
    } satisfies Parameters<typeof fitBezierTransition>[0];
    expect(tryFitOrganicTransition(input)).toBeUndefined();
    const fitted = fitBezierTransition(input);
    expect(fitted.source.points.length).toBeGreaterThan(2);
    expect(curves(fitted.source).every((curve) => bezierAvoidsRect(curve, wall))).toBe(true);
  });

  it("preserves the port guide when an organic target leg is too short", () => {
    const portSource: PathData = {
      points: [
        { x: 80, y: 50 },
        { x: 120, y: 50 },
        { x: 120, y: -20 },
        { x: -180, y: -20 },
        { x: -180, y: 45 },
      ],
      sourceDirection: "right",
      targetDirection: "top",
    };
    const portTarget: PathData = {
      points: [
        { x: -175, y: 50 },
        { x: -184, y: 50 },
      ],
      sourceDirection: "right",
      targetDirection: "left",
    };
    const owner = { x: 0, y: 0, width: 100, height: 100 };
    const input = {
      source: portSource,
      target: portTarget,
      label: { x: -185, y: 45, width: 10, height: 10 },
      endpoints: {
        source: {
          kind: "port",
          point: { x: 80, y: 50 },
          direction: "right",
          escape: { x: 120, y: 50 },
          owner,
        },
        target: {
          kind: "floating",
          bounds: { x: -174, y: 40, width: 20, height: 20 },
          sides,
        },
      },
      obstacles: [],
      avoidObstacles: false,
    } satisfies Parameters<typeof fitBezierTransition>[0];
    expect(tryFitOrganicTransition(input)).toBeUndefined();
    expect(fitBezierTransition(input)).toEqual({
      source: portSource,
      target: portTarget,
    });
  });

  it.each([false, true])(
    "floats oblique attachments without cardinal hooks (avoid %s)",
    (avoidObstacles) => {
      const fitted = fitBezierTransition({ ...organicInput, avoidObstacles });
      const first = curves(fitted.source)[0]!;
      const last = curves(fitted.target).at(-1)!;
      expect(first.start.x).toBe(organicSource.x + organicSource.width);
      expect(first.start.y).toBeGreaterThan(organicSource.y);
      expect(first.control1.x).toBeGreaterThan(first.start.x);
      expect(first.control1.y).toBeGreaterThan(first.start.y);
      expect(last.control2.x).toBeLessThan(last.end.x);
      expect(last.control2.y).toBeLessThan(last.end.y);
      const length = Math.hypot(last.end.x - last.control2.x, last.end.y - last.control2.y);
      const tip = {
        x: last.end.x + (10 * (last.end.x - last.control2.x)) / length,
        y: last.end.y + (10 * (last.end.y - last.control2.y)) / length,
      };
      expect(tip.x).toBeCloseTo(organicTarget.x);
      expect(tip.y).toBeGreaterThan(organicTarget.y);
      expect(tip.y).toBeLessThan(organicTarget.y + organicTarget.height);
      expect(fitted.source.sourceDirection).toBe("right");
      expect(fitted.target.targetDirection).toBe("left");
    },
  );

  it("shares an oblique tangent through the required label center", () => {
    const fitted = fitBezierTransition({
      ...organicInput,
      label: { x: 300, y: 160, width: 0, height: 0 },
    });
    const left = curves(fitted.source).at(-1)!;
    const right = curves(fitted.target)[0]!;
    expect(left.end).toEqual({ x: 300, y: 160 });
    expect(right.start).toEqual(left.end);
    const a = {
      x: left.end.x - left.control2.x,
      y: left.end.y - left.control2.y,
    };
    const b = {
      x: right.control1.x - right.start.x,
      y: right.control1.y - right.start.y,
    };
    expect(a.x * b.y - a.y * b.x).toBeCloseTo(0);
    expect(a.x * b.x + a.y * b.y).toBeGreaterThan(0);
  });

  it("finds an any-angle detour around diagonal and overlapping blockers", () => {
    const blockers = [
      { x: 170, y: 75, width: 65, height: 75 },
      { x: 205, y: 92, width: 45, height: 60 },
    ];
    const direct = fitBezierTransition({
      ...organicInput,
      avoidObstacles: false,
    });
    expect(curves(direct.source).some((curve) => !bezierAvoidsRect(curve, blockers[0]!))).toBe(
      true,
    );
    const fitted = fitBezierTransition({
      ...organicInput,
      obstacles: [...organicInput.obstacles, ...blockers],
    });
    expect(fitted.source.path).not.toEqual(direct.source.path);
    for (const curve of [...curves(fitted.source), ...curves(fitted.target)])
      for (const blocker of [...organicInput.obstacles, ...blockers])
        expect(bezierAvoidsRect(curve, blocker)).toBe(true);
    expect(
      curves(fitted.source).some(
        (curve) =>
          Math.abs(curve.end.x - curve.start.x) > 1 && Math.abs(curve.end.y - curve.start.y) > 1,
      ),
    ).toBe(true);
  });

  it("certifies clearance around a sub-pixel blocker between sample positions", () => {
    const direct = fitBezierTransition(organicInput);
    const point = splitBezier(curves(direct.source)[0]!, 0.3731)[0].end;
    const blocker = {
      x: point.x - 0.005,
      y: point.y - 0.005,
      width: 0.01,
      height: 0.01,
    };
    const fitted = fitBezierTransition({
      ...organicInput,
      obstacles: [...organicInput.obstacles, blocker],
    });
    expect(fitted.source.path).not.toEqual(direct.source.path);
    expect(curves(fitted.source).every((curve) => bezierAvoidsRect(curve, blocker))).toBe(true);
  });

  it.each([false, true])(
    "honors a side facing away without crossing its own state (avoid %s)",
    (avoidObstacles) => {
      const fitted = fitBezierTransition({
        ...organicInput,
        avoidObstacles,
        endpoints: {
          ...organicEndpoints,
          source: { ...organicEndpoints.source, sides: ["left"] },
        },
      });
      expect(curves(fitted.source)[0]!.start.x).toBe(organicSource.x);
      expect(curves(fitted.source).every((curve) => bezierAvoidsRect(curve, organicSource))).toBe(
        true,
      );
    },
  );

  it("keeps an explicit invoke escape and prevents later owner reentry", () => {
    const owner = { x: 0, y: 0, width: 100, height: 100 };
    const point = { x: 50, y: 50 };
    const escape = { x: 120, y: 50 };
    const fitted = fitBezierTransition({
      ...organicInput,
      label: { x: -160, y: 140, width: 80, height: 40 },
      obstacles: [owner, organicTarget],
      endpoints: {
        ...organicEndpoints,
        source: { kind: "port", point, escape, direction: "right", owner },
      },
    });
    const first = curves(fitted.source)[0]!;
    expect(first.start).toEqual(point);
    expect(first.end).toEqual(escape);
    expect(first.control1.y).toBe(point.y);
    for (const curve of [...curves(fitted.source).slice(1), ...curves(fitted.target)])
      expect(bezierAvoidsRect(curve, owner)).toBe(true);
  });
});

it("keeps the permitted side metadata when an organic anchor is a corner", () => {
  const bounds = { x: 0, y: 0, width: 100, height: 100 };
  const fitted = fitBezierTransition({
    ...organicInput,
    avoidObstacles: false,
    label: { x: 180, y: 180, width: 40, height: 40 },
    endpoints: {
      ...organicEndpoints,
      source: { kind: "floating", bounds, sides: ["bottom"] },
    },
  });
  expect(fitted.source.points[0]).toEqual({ x: 100, y: 100 });
  expect(fitted.source.sourceDirection).toBe("bottom");
});

it.each([false, true])("honors an explicit label tangent (floating %s)", (floating) => {
  const fitted = fitBezierTransition({
    ...organicInput,
    endpoints: floating ? organicEndpoints : undefined,
    avoidObstacles: false,
    label: { x: 300, y: 160, width: 0, height: 0 },
    labelTangent: { x: 1, y: 0 },
  });
  const left = curves(fitted.source).at(-1)!;
  const right = curves(fitted.target)[0]!;
  expect(left.end).toEqual({ x: 300, y: 160 });
  expect(right.start).toEqual(left.end);
  expect(left.control2.y).toBe(left.end.y);
  expect(left.control2.x).toBeLessThan(left.end.x);
  expect(right.control1.y).toBe(right.start.y);
  expect(right.control1.x).toBeGreaterThan(right.start.x);
});

it("uses perpendicular terminal tangents in orthogonal attachment mode", () => {
  const fitted = fitBezierTransition({ ...organicInput, attachmentMode: "orthogonal" });
  const first = curves(fitted.source)[0]!;
  const last = curves(fitted.target).at(-1)!;
  expect(first.control1.y).toBe(first.start.y);
  expect(first.control1.x).toBeGreaterThan(first.start.x);
  expect(last.control2.y).toBe(last.end.y);
  expect(last.control2.x).toBeLessThan(last.end.x);
  expect(last.end.x + 10).toBeCloseTo(organicTarget.x);
});

it.each([0, 24])("reserves requested target clearance of %s", (targetClearance) => {
  const fitted = fitBezierTransition({ ...organicInput, targetClearance });
  const last = curves(fitted.target).at(-1)!;
  const arrival = {
    x: last.end.x - last.control2.x,
    y: last.end.y - last.control2.y,
  };
  const length = Math.hypot(arrival.x, arrival.y);
  const boundary = {
    x: last.end.x + (arrival.x * targetClearance) / length,
    y: last.end.y + (arrival.y * targetClearance) / length,
  };
  expect(boundary.x).toBeCloseTo(organicTarget.x);
  expect(boundary.y).toBeGreaterThan(organicTarget.y);
  expect(boundary.y).toBeLessThan(organicTarget.y + organicTarget.height);
});

describe("Bézier renderer trimming", () => {
  it("trims the requested length from the start and retains the end", () => {
    const result = trimBezierPathStart("M 0 0 C 30 0 60 0 90 0", 20)!;
    const coordinates = result.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
    expect(coordinates[0]).toBeCloseTo(20, 4);
    expect(coordinates[1]).toBe(0);
    expect(coordinates.slice(-2)).toEqual([90, 0]);
  });

  it("limits trimming to half the total path", () => {
    const result = trimBezierPathStart("M 0 0 L 10 0", 20)!;
    const coordinates = result.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(coordinates[0]).toBeCloseTo(5, 4);
    expect(coordinates.slice(-2)).toEqual([10, 0]);
  });

  it("trims across complete segments and accepts quadratic curves", () => {
    const result = trimBezierPathStart("M 0 0 L 5 0 Q 15 0 25 0", 10)!;
    const coordinates = result.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(coordinates[0]).toBeCloseTo(10, 4);
    expect(coordinates.slice(-2)).toEqual([25, 0]);
    expect(result.match(/C/g)).toHaveLength(1);
  });

  it.each(["", "M 0 0", "M 0 0 C 1 2", "m 0 0 l 10 0", "M 0 0 A 5 5 0 0 0 10 0"])(
    "rejects unsupported or incomplete input %s",
    (path) => {
      expect(trimBezierPathStart(path)).toBeUndefined();
    },
  );
});
