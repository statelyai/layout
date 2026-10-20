import { pathFromPoints } from "./path";
import { shortestVisibilityPath } from "./bezier-visibility";
import type {
  RouteBounds as Rect,
  RoutePath,
  RoutePoint as Point,
  RouteSide as Direction,
} from "./types";

export interface BezierGuide {
  readonly points: readonly Point[];
  readonly sourceDirection: Direction;
  readonly targetDirection: Direction;
  readonly path?: RoutePath;
}

export type CubicBezier = {
  start: Point;
  control1: Point;
  control2: Point;
  end: Point;
};

export type BezierEndpoint =
  | { kind: "floating"; bounds: Rect; sides: readonly Direction[] }
  | {
      kind: "port";
      point: Point;
      direction: Direction;
      escape: Point;
      owner: Rect;
    };

export type BezierRoutingInput = {
  source: BezierGuide;
  target: BezierGuide;
  label: Rect;
  obstacles: readonly Rect[];
  terminalBounds?: readonly Rect[];
  avoidObstacles: boolean;
  attachmentMode?: "floating" | "orthogonal";
  labelTangent?: Point;
  targetClearance?: number;
  endpoints?: {
    source: BezierEndpoint;
    target: Extract<BezierEndpoint, { kind: "floating" }>;
  };
};

const VECTORS: Record<Direction, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};
const mix = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const offset = (point: Point, direction: Point, amount: number): Point => ({
  x: point.x + direction.x * amount,
  y: point.y + direction.y * amount,
});
function unit(from: Point, to: Point): Point {
  const length = distance(from, to);
  return length ? { x: (to.x - from.x) / length, y: (to.y - from.y) / length } : { x: 1, y: 0 };
}

export function splitBezier(curve: CubicBezier, t: number): [CubicBezier, CubicBezier] {
  const a = mix(curve.start, curve.control1, t);
  const b = mix(curve.control1, curve.control2, t);
  const c = mix(curve.control2, curve.end, t);
  const d = mix(a, b, t);
  const e = mix(b, c, t);
  const point = mix(d, e, t);
  return [
    { start: curve.start, control1: a, control2: d, end: point },
    { start: point, control1: e, control2: c, end: curve.end },
  ];
}

export function bezierAvoidsRect(curve: CubicBezier, rect: Rect, depth = 0): boolean {
  const points = [curve.start, curve.control1, curve.control2, curve.end];
  if (
    Math.max(...points.map((p) => p.x)) <= rect.x ||
    Math.min(...points.map((p) => p.x)) >= rect.x + rect.width ||
    Math.max(...points.map((p) => p.y)) <= rect.y ||
    Math.min(...points.map((p) => p.y)) >= rect.y + rect.height
  )
    return true;
  if (depth >= 12) return false;
  const [left, right] = splitBezier(curve, 0.5);
  return bezierAvoidsRect(left, rect, depth + 1) && bezierAvoidsRect(right, rect, depth + 1);
}

function safe(curves: readonly CubicBezier[], obstacles: readonly Rect[]): boolean {
  return curves.every((curve) => obstacles.every((rect) => bezierAvoidsRect(curve, rect)));
}

function straight(start: Point, end: Point): CubicBezier {
  return {
    start,
    control1: mix(start, end, 1 / 3),
    control2: mix(start, end, 2 / 3),
    end,
  };
}

function simpleCurve(start: Point, end: Point, departure: Point, arrival: Point): CubicBezier {
  const handle = Math.max(12, distance(start, end) / 3);
  return {
    start,
    control1: offset(start, departure, handle),
    control2: offset(end, arrival, -handle),
    end,
  };
}

function coordinateRoots(a: number, b: number, c: number, d: number, value: number): number[] {
  const cubic = -a + 3 * b - 3 * c + d;
  const quadratic = 3 * a - 6 * b + 3 * c;
  const linear = -3 * a + 3 * b;
  const evaluate = (t: number) => ((cubic * t + quadratic) * t + linear) * t + a - value;
  const critical: number[] = [];
  if (Math.abs(cubic) < 1e-10) {
    if (Math.abs(quadratic) > 1e-10) critical.push(-linear / (2 * quadratic));
  } else {
    const discriminant = quadratic * quadratic - 3 * cubic * linear;
    if (discriminant >= 0) {
      critical.push(
        (-quadratic - Math.sqrt(discriminant)) / (3 * cubic),
        (-quadratic + Math.sqrt(discriminant)) / (3 * cubic),
      );
    }
  }
  const intervals = [0, ...critical.filter((t) => t > 0 && t < 1).sort((x, y) => x - y), 1];
  const roots: number[] = [];
  for (let index = 1; index < intervals.length; index++) {
    let low = intervals[index - 1]!;
    let high = intervals[index]!;
    if (Math.abs(evaluate(low)) < 1e-9) roots.push(low);
    if (evaluate(low) * evaluate(high) > 0) continue;
    const sign = evaluate(low) < 0;
    for (let step = 0; step < 42; step++) {
      const middle = (low + high) / 2;
      if (evaluate(middle) < 0 === sign) low = middle;
      else high = middle;
    }
    roots.push((low + high) / 2);
  }
  return roots;
}

function pointInLabel(point: Point, label: Rect): boolean {
  return (
    point.x >= label.x &&
    point.x <= label.x + label.width &&
    point.y >= label.y &&
    point.y <= label.y + label.height
  );
}

function labelIntersections(curve: CubicBezier, label: Rect): number[] {
  const inside = (point: Point) =>
    point.x >= label.x - 1e-6 &&
    point.x <= label.x + label.width + 1e-6 &&
    point.y >= label.y - 1e-6 &&
    point.y <= label.y + label.height + 1e-6;
  return [
    ...[label.x, label.x + label.width].flatMap((x) =>
      coordinateRoots(curve.start.x, curve.control1.x, curve.control2.x, curve.end.x, x),
    ),
    ...[label.y, label.y + label.height].flatMap((y) =>
      coordinateRoots(curve.start.y, curve.control1.y, curve.control2.y, curve.end.y, y),
    ),
  ]
    .filter((t) => t > 1e-9 && t < 1 - 1e-9 && inside(splitBezier(curve, t)[0].end))
    .sort((a, b) => a - b);
}

function clipAtLabel(curve: CubicBezier, label: Rect, source: boolean): CubicBezier {
  const intersections = labelIntersections(curve, label);
  const t = source ? intersections[0] : intersections.at(-1);
  return t === undefined ? curve : splitBezier(curve, t)[source ? 0 : 1];
}

function smoothGuide(path: BezierGuide, obstacles: readonly Rect[]): CubicBezier[] {
  const points = path.points.filter(
    (p, index, all) => !index || distance(p, all[index - 1]!) > 1e-8,
  );
  const first = points[0];
  if (!first) return [];
  const curves: CubicBezier[] = [];
  let cursor = first;
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1]!;
    const corner = points[index]!;
    const next = points[index + 1]!;
    let radius = Math.min(48, distance(previous, corner) / 3, distance(corner, next) / 3);
    let rounded: CubicBezier | undefined;
    for (let attempt = 0; attempt < 10; attempt++, radius /= 2) {
      const start = offset(corner, unit(corner, previous), radius);
      const end = offset(corner, unit(corner, next), radius);
      const candidate = {
        start,
        control1: mix(start, corner, 0.55228475),
        control2: mix(end, corner, 0.55228475),
        end,
      };
      if (safe([candidate], obstacles)) {
        rounded = candidate;
        break;
      }
    }
    if (rounded) {
      curves.push(straight(cursor, rounded.start), rounded);
      cursor = rounded.end;
    } else {
      curves.push(straight(cursor, corner));
      cursor = corner;
    }
  }
  const last = points.at(-1)!;
  curves.push(straight(cursor, last));
  return curves;
}

function toBezierGuide(guide: BezierGuide, curves: CubicBezier[]): BezierGuide {
  if (!curves.length) return guide;
  const start = curves[0]!.start;
  return {
    ...guide,
    points: [start, ...curves.map((curve) => curve.end)],
    path: {
      start,
      segments: curves.map((curve) => ({
        kind: "cubic",
        control1: curve.control1,
        control2: curve.control2,
        to: curve.end,
      })),
    },
  };
}

function curvesToSvg(curves: readonly CubicBezier[]): string {
  const start = curves[0]!.start;
  return `M ${start.x} ${start.y} ${curves.map((curve) => `C ${curve.control1.x} ${curve.control1.y} ${curve.control2.x} ${curve.control2.y} ${curve.end.x} ${curve.end.y}`).join(" ")}`;
}

function curveLength(curve: CubicBezier, depth = 0): number {
  const chord = distance(curve.start, curve.end);
  const polygon =
    distance(curve.start, curve.control1) +
    distance(curve.control1, curve.control2) +
    distance(curve.control2, curve.end);
  if (polygon - chord < 0.001 || depth >= 12) return (polygon + chord) / 2;
  const [left, right] = splitBezier(curve, 0.5);
  return curveLength(left, depth + 1) + curveLength(right, depth + 1);
}

export function trimBezierPathStart(path: string, maximum = 20): string | undefined {
  const tokens = path.match(/-?(?:\d*\.)?\d+(?:e[+-]?\d+)?|[a-z]/gi) ?? [];
  let index = 0;
  const point = (): Point | undefined => {
    const x = Number(tokens[index++]);
    const y = Number(tokens[index++]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
  };
  if (tokens[index++] !== "M") return undefined;
  let start = point();
  if (!start) return undefined;
  const curves: CubicBezier[] = [];
  while (index < tokens.length) {
    const command = tokens[index++];
    let curve: CubicBezier;
    if (command === "C") {
      const control1 = point();
      const control2 = point();
      const end = point();
      if (!control1 || !control2 || !end) return undefined;
      curve = { start, control1, control2, end };
    } else if (command === "Q") {
      const control = point();
      const end = point();
      if (!control || !end) return undefined;
      curve = {
        start,
        control1: mix(start, control, 2 / 3),
        control2: mix(end, control, 2 / 3),
        end,
      };
    } else if (command === "L") {
      const end = point();
      if (!end) return undefined;
      curve = straight(start, end);
    } else return undefined;
    curves.push(curve);
    start = curve.end;
  }
  if (!curves.length) return undefined;
  const lengths = curves.map((curve) => curveLength(curve));
  let remaining = Math.min(maximum, lengths.reduce((sum, value) => sum + value, 0) / 2);
  for (let index = 0; index < curves.length; index++) {
    const curve = curves[index]!;
    if (remaining >= lengths[index]!) {
      remaining -= lengths[index]!;
      continue;
    }
    let low = 0;
    let high = 1;
    for (let step = 0; step < 24; step++) {
      const middle = (low + high) / 2;
      if (curveLength(splitBezier(curve, middle)[0]) < remaining) low = middle;
      else high = middle;
    }
    return curvesToSvg([splitBezier(curve, (low + high) / 2)[1], ...curves.slice(index + 1)]);
  }
  return curvesToSvg(curves);
}

function fitSemanticTransition({
  source,
  target,
  label,
  obstacles,
  terminalBounds = [],
  avoidObstacles,
  labelTangent,
}: BezierRoutingInput): { source: BezierGuide; target: BezierGuide } {
  const barriers = avoidObstacles ? [...obstacles, ...terminalBounds] : terminalBounds;
  const start = source.points[0];
  const end = target.points.at(-1);
  if (!start || !end) return { source, target };
  const center = {
    x: label.x + label.width / 2,
    y: label.y + label.height / 2,
  };
  const tangent = labelTangent
    ? unit({ x: 0, y: 0 }, labelTangent)
    : distance(start, end) > 1e-8
      ? unit(start, end)
      : unit(source.points.at(-1) ?? start, target.points[0] ?? end);
  const sourceCurve = simpleCurve(start, center, VECTORS[source.sourceDirection], tangent);
  const targetCurve = simpleCurve(
    center,
    end,
    tangent,
    offset({ x: 0, y: 0 }, VECTORS[target.targetDirection], -1),
  );
  const visibleSource = [clipAtLabel(sourceCurve, label, true)];
  const visibleTarget = [clipAtLabel(targetCurve, label, false)];
  if (safe([...visibleSource, ...visibleTarget], barriers)) {
    return {
      source: toBezierGuide(source, visibleSource),
      target: toBezierGuide(target, visibleTarget),
    };
  }
  const sourceGuide = smoothGuide(source, barriers);
  const targetGuide = smoothGuide(target, barriers);
  const sourceEnd = sourceGuide.at(-1);
  const targetStart = targetGuide[0];
  const hiddenHandle = Math.max(0, Math.min(label.width, label.height) / 4);
  if (sourceEnd) {
    const connector = {
      start: sourceEnd.end,
      control1: offset(sourceEnd.end, unit(sourceEnd.control2, sourceEnd.end), hiddenHandle),
      control2: offset(center, tangent, -hiddenHandle),
      end: center,
    };
    if (!pointInLabel(sourceEnd.end, label)) sourceGuide.push(clipAtLabel(connector, label, true));
  }
  if (targetStart) {
    const connector = {
      start: center,
      control1: offset(center, tangent, hiddenHandle),
      control2: offset(
        targetStart.start,
        unit(targetStart.start, targetStart.control1),
        -hiddenHandle,
      ),
      end: targetStart.start,
    };
    if (!pointInLabel(targetStart.start, label))
      targetGuide.unshift(clipAtLabel(connector, label, false));
  }
  const preserveGuide = (path: BezierGuide, curves: CubicBezier[]) =>
    safe(curves, barriers)
      ? toBezierGuide(path, curves)
      : {
          ...path,
          path: path.path ?? pathFromPoints(path.points),
        };
  return {
    source: preserveGuide(source, sourceGuide),
    target: preserveGuide(target, targetGuide),
  };
}

function endpointCandidates(endpoint: BezierEndpoint, toward: Point): Point[] {
  if (endpoint.kind === "port") return [endpoint.escape];
  const { bounds, sides } = endpoint;
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  const scale = Math.min(
    dx ? bounds.width / 2 / Math.abs(dx) : Infinity,
    dy ? bounds.height / 2 / Math.abs(dy) : Infinity,
  );
  const ray = Number.isFinite(scale) ? offset(center, { x: dx, y: dy }, scale) : center;
  const onSide = (point: Point, side: Direction) =>
    side === "left"
      ? Math.abs(point.x - bounds.x) < 1e-7
      : side === "right"
        ? Math.abs(point.x - bounds.x - bounds.width) < 1e-7
        : side === "top"
          ? Math.abs(point.y - bounds.y) < 1e-7
          : Math.abs(point.y - bounds.y - bounds.height) < 1e-7;
  const candidates = sides.some((side) => onSide(ray, side)) ? [ray] : [];
  for (const side of sides) {
    const horizontal = side === "top" || side === "bottom";
    candidates.push({
      x: horizontal
        ? Math.max(bounds.x + bounds.width * 0.1, Math.min(toward.x, bounds.x + bounds.width * 0.9))
        : side === "left"
          ? bounds.x
          : bounds.x + bounds.width,
      y: horizontal
        ? side === "top"
          ? bounds.y
          : bounds.y + bounds.height
        : Math.max(
            bounds.y + bounds.height * 0.1,
            Math.min(toward.y, bounds.y + bounds.height * 0.9),
          ),
    });
  }
  return candidates;
}

function fitRun(
  points: Point[],
  departure: Point,
  arrival: Point,
  obstacles: readonly Rect[],
): CubicBezier[] | undefined {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2) return undefined;
  for (const factor of [1, 0.5, 0.25, 0.125]) {
    const curve = simpleCurve(first, last, departure, arrival);
    curve.control1 = mix(first, curve.control1, factor);
    curve.control2 = mix(last, curve.control2, factor);
    if (safe([curve], obstacles)) return [curve];
  }
  for (const factor of [0.8, 0.4, 0.2, 0.05, 0.005]) {
    const result = points.slice(1).map((end, index) => {
      const start = points[index]!;
      const startTangent = index === 0 ? departure : unit(points[index - 1]!, end);
      const endTangent = index === points.length - 2 ? arrival : unit(start, points[index + 2]!);
      const handle = (distance(start, end) * factor) / 3;
      return {
        start,
        control1: offset(start, startTangent, handle),
        control2: offset(end, endTangent, -handle),
        end,
      };
    });
    if (safe(result, obstacles)) return result;
  }
  const straightRun = points.slice(1).map((end, index) => straight(points[index]!, end));
  const parallel = (a: Point, b: Point) =>
    Math.abs(a.x * b.y - a.y * b.x) < 1e-8 && a.x * b.x + a.y * b.y > 0;
  return parallel(unit(first, points[1]!), departure) &&
    parallel(unit(points.at(-2)!, last), arrival) &&
    safe(straightRun, obstacles)
    ? straightRun
    : undefined;
}

export function fitBezierTransition(input: BezierRoutingInput): {
  source: BezierGuide;
  target: BezierGuide;
} {
  const organic = tryFitOrganicTransition(input);
  if (organic) return organic;
  if (input.endpoints?.source.kind === "port")
    return { source: input.source, target: input.target };
  return fitSemanticTransition(input);
}

/** Floating attachments and shared label tangents use a visibility route. */
export function tryFitOrganicTransition(input: BezierRoutingInput):
  | {
      source: BezierGuide;
      target: BezierGuide;
    }
  | undefined {
  const { endpoints, source, target, label, avoidObstacles } = input;
  if (!endpoints || !source.points.length || !target.points.length) return undefined;
  const center = {
    x: label.x + label.width / 2,
    y: label.y + label.height / 2,
  };
  const terminalBounds = [
    endpoints.target.bounds,
    endpoints.source.kind === "floating" ? endpoints.source.bounds : endpoints.source.owner,
  ];
  const obstacles = avoidObstacles ? input.obstacles : terminalBounds;
  const sourceCandidates = endpointCandidates(endpoints.source, center);
  const targetCandidates = endpointCandidates(endpoints.target, center);
  const sourcePoints = shortestVisibilityPath(sourceCandidates, center, obstacles, terminalBounds);
  const targetPoints = shortestVisibilityPath(
    targetCandidates,
    center,
    obstacles,
    terminalBounds,
  )?.reverse();
  if (!sourcePoints || !targetPoints) return undefined;
  const boundary = targetPoints.at(-1)!;
  const targetArrival =
    input.attachmentMode === "orthogonal"
      ? offset(
          { x: 0, y: 0 },
          VECTORS[boundarySide(boundary, endpoints.target.bounds, endpoints.target.sides)],
          -1,
        )
      : unit(targetPoints.at(-2)!, boundary);
  const targetClearance = input.targetClearance ?? 10;
  if (distance(targetPoints.at(-2)!, boundary) <= targetClearance) return undefined;
  targetPoints[targetPoints.length - 1] = offset(boundary, targetArrival, -targetClearance);
  const tangent = input.labelTangent
    ? unit({ x: 0, y: 0 }, input.labelTangent)
    : unit(sourcePoints.at(-2)!, targetPoints[1]!);
  const departure =
    endpoints.source.kind === "port"
      ? VECTORS[endpoints.source.direction]
      : input.attachmentMode === "orthogonal"
        ? VECTORS[boundarySide(sourcePoints[0]!, endpoints.source.bounds, endpoints.source.sides)]
        : unit(sourcePoints[0]!, sourcePoints[1]!);
  const sourceCurves = fitRun(sourcePoints, departure, tangent, obstacles);
  const targetCurves = fitRun(targetPoints, tangent, targetArrival, obstacles);
  if (!sourceCurves || !targetCurves) return undefined;
  if (endpoints.source.kind === "port") {
    const port = endpoints.source;
    const prefix = straight(port.point, port.escape);
    const portEscapeAvoidsForeignObstacles = safe(
      [prefix],
      input.obstacles.filter(
        (rect) =>
          !(
            rect.x === port.owner.x &&
            rect.y === port.owner.y &&
            rect.width === port.owner.width &&
            rect.height === port.owner.height
          ),
      ),
    );
    if (avoidObstacles && !portEscapeAvoidsForeignObstacles) return undefined;
    sourceCurves.unshift(prefix);
  }
  sourceCurves[sourceCurves.length - 1] = clipAtLabel(sourceCurves.at(-1)!, label, true);
  targetCurves[0] = clipAtLabel(targetCurves[0]!, label, false);
  return {
    source: toBezierGuide(
      {
        ...source,
        sourceDirection:
          endpoints.source.kind === "port"
            ? endpoints.source.direction
            : boundarySide(sourceCurves[0]!.start, endpoints.source.bounds, endpoints.source.sides),
        targetDirection: boundarySide(sourceCurves.at(-1)!.end, label),
      },
      sourceCurves,
    ),
    target: toBezierGuide(
      {
        ...target,
        sourceDirection: boundarySide(targetCurves[0]!.start, label),
        targetDirection: boundarySide(boundary, endpoints.target.bounds, endpoints.target.sides),
      },
      targetCurves,
    ),
  };
}

function boundarySide(
  point: Point,
  rect: Rect,
  allowed: readonly Direction[] = ["left", "right", "top", "bottom"],
): Direction {
  const sides: [Direction, number][] = [
    ["left", Math.abs(point.x - rect.x)],
    ["right", Math.abs(point.x - rect.x - rect.width)],
    ["top", Math.abs(point.y - rect.y)],
    ["bottom", Math.abs(point.y - rect.y - rect.height)],
  ];
  return (
    sides.filter(([side]) => allowed.includes(side)).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "right"
  );
}
