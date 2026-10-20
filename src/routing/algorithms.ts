import type {
  Route,
  RouteBounds,
  RouteEndpoint,
  RoutePath,
  RouteSegment,
  RoutePoint,
  RouteSection,
  RouteSide,
  RouteStyle,
  RoutingDiagnostic,
  RoutingMetrics,
  RoutingPolicy,
  RouteLabelPlacement,
} from "./types";
import {
  anchor,
  effectivePolicy,
  type Settings,
  ancestors,
  center,
  groupKey,
  labelRect,
  sideToward,
  vector,
  worldRect,
  type EdgeGeometry,
  type State,
} from "./model";
import {
  pathReservations,
  conflictCost,
  outsideTerminal,
  reservationBounds,
  type Reservation,
} from "./coordination";
import { crossesRect } from "../authoring/routing";
import {
  distance,
  flattenPath,
  getPathBounds,
  pathFromPoints,
  roundCorners,
  segmentCrossesRect,
} from "./path";
import {
  bezierThroughPoints,
  catmullRomPath,
  pathEndpointTangent,
  pathHasSelfIntersection,
  pathCurveOvershoot,
  limitBezierHandles,
  roundedBezierPath,
  pathReverseTravel,
  placeFollowingLabel,
} from "./policy-geometry";
import { inflate, intersects, union } from "./spatial";
import {
  clear,
  findPath,
  findPathBetweenLeads,
  pointsBounds,
  segmentBounds,
  simplify,
  type SearchContext,
} from "./search";

export type RoutingInput = Pick<
  State,
  "nodes" | "edges" | "groups" | "obstacles" | "settings" | "incident"
>;

export type Metrics = { -readonly [K in keyof RoutingMetrics]: RoutingMetrics[K] };
interface Terminal {
  point: RoutePoint;
  side: RouteSide;
  ref: RouteEndpoint;
  tangent?: RoutePoint;
}
interface Plan {
  path: RoutePath;
  id: string;
}
export interface Batch {
  policy?: RoutingPolicy;
  routes?: ReadonlyMap<string, Route>;
  previous?: Route;
  previousSettings?: Settings;
  readonly plans: Map<string, Plan | null>;
  dependencyBounds?: RouteBounds;
  edgeCost?(a: RoutePoint, b: RoutePoint): number;
  conflicts?(a: RoutePoint, b: RoutePoint): boolean;
  guides?(bounds: RouteBounds): readonly RouteBounds[];
  labelOverlaps?(bounds: RouteBounds): readonly string[];
}
function contextFor(
  state: RoutingInput,
  excluded: ReadonlySet<string>,
  endpoints: ReadonlySet<string>,
  metrics: Metrics,
  batch: Batch,
  padding = 0,
): SearchContext {
  return {
    edgeCost: (a, b) => batch.edgeCost?.(a, b) ?? 0,
    guides: (bounds) => batch.guides?.(bounds) ?? [],
    // Reserve part of the edge budget for a hard-obstacle retry, rather than
    // spending it all optimizing soft route reservations.
    maxSearchNodes: Math.max(1, Math.floor(state.settings.maxSearchNodes / 2)),
    maxGridNodes: state.settings.maxSearchNodes,
    bendPenalty: state.settings.bendPenalty,
    visited: 0,
    budgetExceeded: false,
    obstacles(bounds) {
      const queried = inflate(bounds, state.settings.clearance + padding);
      batch.dependencyBounds = batch.dependencyBounds
        ? union(batch.dependencyBounds, queried)
        : queried;
      const ids = state.obstacles.query(queried);
      metrics.obstacleCandidates += ids.length;
      return ids
        .filter(
          (id) =>
            !excluded.has(id) &&
            !(id.startsWith("n:") && batch.policy?.collisions?.nodes === "allow") &&
            !(id.startsWith("e:") && batch.policy?.collisions?.labels === "allow"),
        )
        .map((id) =>
          inflate(
            state.obstacles.bounds.get(id)!,
            endpoints.has(id) ? 0 : state.settings.clearance + padding,
          ),
        );
    },
  };
}
function pathLength(path: RoutePath): number {
  return pathReservations(path).reduce((sum, segment) => sum + distance(segment.a, segment.b), 0);
}
function pathCost(path: RoutePath, context: SearchContext): number {
  const segments = pathReservations(path);
  const lengthAndConflicts = segments.reduce(
    (sum, segment) =>
      sum + distance(segment.a, segment.b) + (context.edgeCost?.(segment.a, segment.b) ?? 0),
    0,
  );
  // Use the same turn cost as A* when choosing a preferred path or shifting
  // tracks. Otherwise a tiny length saving can discard a route with fewer bends.
  if (path.segments.some((segment) => segment.kind !== "line")) return lengthAndConflicts;
  let turns = 0;
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1]!,
      b = segments[i]!;
    const ax = a.b.x - a.a.x,
      ay = a.b.y - a.a.y;
    const bx = b.b.x - b.a.x,
      by = b.b.y - b.a.y;
    turns += ax * bx + ay * by < -1e-8 ? 4 : Math.abs(ax * by - ay * bx) > 1e-8 ? 1 : 0;
  }
  return lengthAndConflicts + context.bendPenalty * turns;
}
function safe(path: RoutePath, context: SearchContext): boolean {
  let start = path.start;
  for (const segment of path.segments) {
    const bounds = getPathBounds({ start, segments: [segment] });
    if (context.obstacles(bounds).some((rect) => segmentCrossesRect(start, segment, rect)))
      return false;
    start = segment.to;
  }
  return true;
}
function cubic(start: Terminal, end: Terminal): RoutePath {
  const amount = Math.max(20, distance(start.point, end.point) / 2),
    a = vector(start.side),
    b = vector(end.side);
  return {
    start: start.point,
    segments: [
      {
        kind: "cubic",
        control1: { x: start.point.x + a.x * amount, y: start.point.y + a.y * amount },
        control2: { x: end.point.x + b.x * amount, y: end.point.y + b.y * amount },
        to: end.point,
      },
    ],
  };
}
function curve(
  points: readonly RoutePoint[],
  state: RoutingInput,
  context: SearchContext,
): RoutePath {
  const path = pathFromPoints(points);
  for (let radius = state.settings.radius; radius > 0.01; radius /= 2) {
    const rounded = roundCorners(path, { radius });
    if (safe(rounded, context)) return rounded;
  }
  return path;
}
/** Elastic string relaxation, constrained by collision checks on each proposed move. */
function organic(
  points: readonly RoutePoint[],
  state: RoutingInput,
  context: SearchContext,
): RoutePath {
  let samples: RoutePoint[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!,
      count = Math.min(16, Math.max(2, Math.ceil(distance(a, b) / 32)));
    for (let j = 0; j < count; j++)
      samples.push({ x: a.x + ((b.x - a.x) * j) / count, y: a.y + ((b.y - a.y) * j) / count });
  }
  samples.push(points.at(-1)!);
  for (let iteration = 0; iteration < state.settings.organicIterations; iteration++) {
    const next = [...samples];
    for (let i = 1; i < samples.length - 1; i++) {
      const p = samples[i]!,
        a = samples[i - 1]!,
        b = samples[i + 1]!;
      let x = (a.x + b.x - 2 * p.x) * 0.2,
        y = (a.y + b.y - 2 * p.y) * 0.2;
      for (const r of context.obstacles(inflate({ ...p, width: 0, height: 0 }, 24))) {
        const q = {
            x: Math.max(r.x, Math.min(r.x + r.width, p.x)),
            y: Math.max(r.y, Math.min(r.y + r.height, p.y)),
          },
          d = distance(p, q);
        if (d > 0 && d < 24) {
          x += ((p.x - q.x) / d) * (24 - d) * 0.2;
          y += ((p.y - q.y) / d) * (24 - d) * 0.2;
        }
      }
      const candidate = { x: p.x + x, y: p.y + y };
      if (clear(next[i - 1]!, candidate, context) && clear(candidate, b, context))
        next[i] = candidate;
    }
    samples = next;
  }
  return curve(simplify(samples), state, context);
}
function groupPlan(
  key: string,
  state: RoutingInput,
  metrics: Metrics,
  batch: Batch,
  style: RouteStyle,
): Plan | null {
  if (batch.plans.has(key)) return batch.plans.get(key)!;
  const edges = [...(state.groups.get(key)?.keys() ?? [])].map((id) => state.edges.get(id)!);
  const nodes = [...new Set(edges.flatMap((e) => [e.sourceId, e.targetId]))];
  const rectangles = nodes
    .map((id) => state.nodes.get(id))
    .map((n) => n && worldRect(n, state))
    .filter((r): r is RouteBounds => r !== undefined);
  if (rectangles.length !== nodes.length || !rectangles.length) {
    batch.plans.set(key, null);
    return null;
  }
  const common = new Set(ancestors(nodes[0]!, state));
  for (const id of nodes.slice(1)) {
    const set = new Set(ancestors(id, state));
    for (const parent of common) if (!set.has(parent)) common.delete(parent);
  }
  const context = contextFor(
    state,
    new Set([...common].map((id) => `n:${id}`)),
    new Set(),
    metrics,
    batch,
  );
  const bounds = rectangles.reduce(union),
    spacing = state.settings.clearance + state.settings.edgeSpacing + 1;
  let result: Plan | null = null;
  const targets = edges.map((e) => {
    const role = effectivePolicy(state.settings, e.id)?.label?.kind;
    return (
      (role === "follow" || role === "fixed" ? undefined : labelRect(e, state)) ??
      worldRect(state.nodes.get(e.targetId)!, state)!
    );
  });
  const sources = edges.map((e) => worldRect(state.nodes.get(e.sourceId)!, state)!);
  const candidates: { start: RoutePoint; end: RoutePoint }[] = [];
  if (new Set(edges.map((e) => e.sourceId)).size === 1) {
    const source = sources[0]!,
      target = targets.reduce(union);
    const side = sideToward(center(source), center(target)),
      v = vector(side);
    const port = edges[0]!.sourcePort;
    const named =
      port === undefined
        ? undefined
        : state.nodes.get(edges[0]!.sourceId)!.ports?.find((p) => p.name === port);
    const attachment =
      named && Number.isFinite(named.x) && Number.isFinite(named.y)
        ? {
            x: source.x + named.x! + (named.width ?? 0) / 2,
            y: source.y + named.y! + (named.height ?? 0) / 2,
          }
        : anchor(source, side);
    const start = { x: attachment.x + v.x * spacing, y: attachment.y + v.y * spacing };
    const end =
      side === "right"
        ? { x: target.x - spacing, y: start.y }
        : side === "left"
          ? { x: target.x + target.width + spacing, y: start.y }
          : side === "bottom"
            ? { x: start.x, y: target.y - spacing }
            : { x: start.x, y: target.y + target.height + spacing };
    if ((end.x - start.x) * v.x + (end.y - start.y) * v.y > 1e-8) candidates.push({ start, end });
  }
  // Try the source-facing interior corridor before exterior alternatives.
  const xs = [bounds.x - spacing, bounds.x + bounds.width + spacing];
  const ys = [bounds.y - spacing, bounds.y + bounds.height + spacing];
  const exterior = [
    ...xs.map((x) => ({ start: { x, y: ys[0]! }, end: { x, y: ys[1]! } })),
    ...ys.map((y) => ({ start: { x: xs[0]!, y }, end: { x: xs[1]!, y } })),
  ].flatMap((p) => [p, { start: p.end, end: p.start }]);
  const score = (p: { start: RoutePoint; end: RoutePoint }) =>
    distance(p.start, p.end) +
    sources.reduce((sum, r) => sum + distance(center(r), p.start), 0) +
    targets.reduce((sum, r) => sum + distance(p.end, center(r)), 0);
  exterior.sort((a, b) => score(a) - score(b));
  candidates.push(...exterior);
  for (const candidate of candidates) {
    const points = findPath(candidate.start, candidate.end, "orthogonal", context);
    if (!points) continue;
    const policy = batch.policy?.curve;
    const path =
      policy?.kind === "catmull-rom"
        ? catmullRomPath(points)
        : policy?.kind === "bezier"
          ? bezierThroughPoints(points, new Map(), policy.curvature ?? 0.5)
          : policy?.kind === "rounded-orthogonal"
            ? roundCorners(pathFromPoints(points), {
                radius: policy.radius ?? state.settings.radius,
              })
            : policy?.kind === "polyline"
              ? pathFromPoints(points)
              : style === "bundle"
                ? curve(points, state, context)
                : pathFromPoints(points);
    if (batch.policy && !safe(path, context)) continue;
    result = { id: `trunk:${key}`, path };
    break;
  }
  metrics.searchNodes += context.visited;
  batch.plans.set(key, result);
  return result;
}
export function routeEdge(
  edge: EdgeGeometry,
  state: RoutingInput,
  style: RouteStyle,
  metrics: Metrics,
  batch: Batch,
): Route {
  const policy = effectivePolicy(state.settings, edge.id);
  const strategyStyle = style;
  if (policy?.curve?.kind === "rounded-orthogonal" && !["bundle", "bus", "fan"].includes(style))
    style = "orthogonal";
  const config = policy ? { ...state.settings, ...policy.collisions } : state.settings,
    perEdge = config.edges[edge.id] ?? {},
    diagnostics: RoutingDiagnostic[] = [];
  const report = (
    code: RoutingDiagnostic["code"],
    message: string,
    constraint?: RoutingDiagnostic["constraint"],
  ) => {
    if (!diagnostics.some((d) => d.code === code && d.constraint === constraint))
      diagnostics.push({ code, message, edgeId: edge.id, ...(constraint ? { constraint } : {}) });
  };
  if (policy) {
    if (perEdge.bezier?.disabled) {
      report("CONSTRAINT_VIOLATION", "Bézier routing disabled by the edge constraints");
      return { edgeId: edge.id, sections: [], status: "fallback", diagnostics };
    }
    let obstacles = state.obstacles;
    const extraObstacles =
      (perEdge.bezier?.avoidObstacles ?? config.bezier?.avoidObstacles) === false
        ? []
        : (perEdge.bezier?.obstacles ?? []);
    for (const [index, bounds] of [
      ...extraObstacles,
      ...(perEdge.bezier?.terminalBounds ?? []),
    ].entries())
      obstacles = obstacles.set(`policy-barrier:${edge.id}:${index}`, bounds);
    if (obstacles !== state.obstacles) state = { ...state, obstacles };
    const seen = new Set([edge.id]);
    let parent = perEdge.sourceLabel;
    while (parent !== undefined) {
      if (seen.has(parent))
        return {
          edgeId: edge.id,
          sections: [],
          status: "fallback",
          diagnostics: [
            {
              edgeId: edge.id,
              code: "CONSTRAINT_VIOLATION",
              message: "Cyclic source label reference",
            },
          ],
        };
      seen.add(parent);
      parent = config.edges[parent]?.sourceLabel;
    }
  }
  const parentLabel =
    perEdge.sourceLabel === undefined ? undefined : state.edges.get(perEdge.sourceLabel);
  const sourceNode = perEdge.sourceLabel === undefined ? state.nodes.get(edge.sourceId) : undefined,
    targetNode = state.nodes.get(edge.targetId);
  const sourceRect = parentLabel
      ? (batch.routes?.get(parentLabel.id)?.label?.bounds ?? labelRect(parentLabel, state))
      : perEdge.bezier?.source?.kind === "floating"
        ? perEdge.bezier.source.bounds
        : perEdge.bezier?.source?.kind === "port"
          ? perEdge.bezier.source.owner
          : sourceNode && worldRect(sourceNode, state),
    targetRect = perEdge.bezier?.target?.bounds ?? (targetNode && worldRect(targetNode, state));
  if (
    perEdge.sourceLabel !== undefined &&
    batch.routes?.get(perEdge.sourceLabel)?.sections.length === 0
  )
    return {
      edgeId: edge.id,
      sections: [],
      status: "fallback",
      diagnostics: [
        {
          code: "CONSTRAINT_VIOLATION",
          edgeId: edge.id,
          message: "Source label route was rejected",
        },
      ],
    };
  if (!sourceRect || !targetRect)
    report("MISSING_GEOMETRY", "Missing endpoint geometry; rendered a fallback connection");
  const sourceBounds = sourceRect ?? { x: 0, y: 0, width: 0, height: 0 },
    targetBounds = targetRect ?? {
      x: sourceBounds.x + 40,
      y: sourceBounds.y + 40,
      width: 0,
      height: 0,
    };
  const loop = perEdge.sourceLabel === undefined && edge.sourceId === edge.targetId;
  const group = groupKey(edge, strategyStyle, config),
    peers = group ? [...(state.groups.get(group)?.keys() ?? [])] : [];
  const compatibleGroup =
    !policy ||
    peers.every(
      (id) => JSON.stringify(effectivePolicy(state.settings, id)) === JSON.stringify(policy),
    );
  const grouped = peers.length > 1 && ["bus", "bundle", "fan"].includes(style) && compatibleGroup;
  if (!compatibleGroup)
    report(
      "CONSTRAINT_VIOLATION",
      "Incompatible bundle policies use independent branches",
      "bundle",
    );
  const lane = !grouped && peers.length > 1 ? peers.length - 1 - peers.indexOf(edge.id) : 0;
  const attractingLabel =
    policy?.label?.kind === "follow" || policy?.label?.kind === "fixed"
      ? undefined
      : labelRect(edge, state);
  const automaticFaces =
    !!policy &&
    !loop &&
    !grouped &&
    !parentLabel &&
    !perEdge.sourceAttachment &&
    !perEdge.targetAttachment &&
    !perEdge.bezier &&
    !perEdge.sourceSide &&
    !perEdge.targetSide &&
    edge.sourcePort === undefined &&
    edge.targetPort === undefined &&
    !perEdge.waypoints?.length &&
    policy.sourceTangent?.kind !== "vector" &&
    policy.targetTangent?.kind !== "vector" &&
    (!labelRect(edge, state) || policy.label?.kind === "follow" || policy.label?.kind === "fixed");
  function terminal(source: boolean, selectedSide?: RouteSide): Terminal {
    const node = source ? sourceNode : targetNode,
      outer = source ? sourceBounds : targetBounds,
      attachment = source ? perEdge.sourceAttachment : perEdge.targetAttachment,
      bounds = attachment
        ? {
            ...attachment.bounds,
            x: outer.x + attachment.bounds.x,
            y: outer.y + attachment.bounds.y,
          }
        : outer,
      other = source ? targetBounds : sourceBounds;
    const name = source
      ? perEdge.sourceLabel === undefined
        ? edge.sourcePort
        : undefined
      : edge.targetPort;
    let side =
      selectedSide ??
      (source ? perEdge.sourceSide : perEdge.targetSide) ??
      (loop ? (source ? "right" : "top") : sideToward(center(bounds), center(other)));
    const requestedTangent = source ? policy?.sourceTangent : policy?.targetTangent;
    if (
      requestedTangent?.kind === "vector" &&
      name === undefined &&
      !(source ? perEdge.sourceSide : perEdge.targetSide)
    ) {
      const outward = source
        ? requestedTangent.direction
        : { x: -requestedTangent.direction.x, y: -requestedTangent.direction.y };
      const allowed = source ? perEdge.sourceSides : perEdge.targetSides;
      const preferred = sideToward({ x: 0, y: 0 }, outward);
      side =
        !allowed || allowed.includes(preferred)
          ? preferred
          : (allowed.find((s) => vector(s).x * outward.x + vector(s).y * outward.y > 1e-8) ?? side);
    }
    const allowedSides = source ? perEdge.sourceSides : perEdge.targetSides;
    if (
      policy &&
      !attachment &&
      name === undefined &&
      !(source ? perEdge.sourceSide : perEdge.targetSide) &&
      allowedSides?.length &&
      !allowedSides.includes(side)
    )
      side = allowedSides[0]!;
    let point = anchor(bounds, side);
    if (attachment) {
      const toward = attractingLabel ?? other;
      side =
        (source ? perEdge.sourceSide : perEdge.targetSide) ??
        (requestedTangent?.kind === "vector" ? side : sideToward(center(bounds), center(toward)));
      point = anchor(bounds, side);
      const margin = Math.min(config.clearance, Math.min(bounds.width, bounds.height) / 2);
      if (side === "left" || side === "right")
        point = {
          ...point,
          y: Math.max(
            bounds.y + margin,
            Math.min(bounds.y + bounds.height - margin, center(toward).y),
          ),
        };
      else
        point = {
          ...point,
          x: Math.max(
            bounds.x + margin,
            Math.min(bounds.x + bounds.width - margin, center(toward).x),
          ),
        };
    }
    const duplicateTargets =
      !source && grouped
        ? peers.filter((id) => {
            const peer = state.edges.get(id)!;
            const options = config.edges[id];
            return (
              peer.targetId === edge.targetId &&
              peer.targetPort === undefined &&
              options?.targetSide === undefined &&
              options?.targetAttachment === undefined
            );
          })
        : [];
    if (
      !attachment &&
      name === undefined &&
      !(source && parentLabel) &&
      (!["bus", "fan", "bundle"].includes(style) ||
        (duplicateTargets.length > 1 && duplicateTargets.includes(edge.id))) &&
      !loop
    ) {
      const nodeId = source ? edge.sourceId : edge.targetId;
      const adjacent = (
        duplicateTargets.length > 1
          ? duplicateTargets
          : [...(state.incident.get(nodeId)?.keys() ?? [])]
      ).filter((id) => {
        const e = state.edges.get(id)!;
        if (e.sourceId === e.targetId) return false;
        const from = e.sourceId === nodeId;
        if ((from ? e.sourcePort : e.targetPort) !== undefined) return false;
        const otherNode = state.nodes.get(from ? e.targetId : e.sourceId);
        const rect = otherNode && worldRect(otherNode, state);
        if (!rect) return false;
        const explicit = from ? config.edges[id]?.sourceSide : config.edges[id]?.targetSide;
        const natural = sideToward(center(bounds), center(rect));
        const allowed = from ? config.edges[id]?.sourceSides : config.edges[id]?.targetSides;
        const selected =
          explicit ??
          (policy && allowed?.length && !allowed.includes(natural) ? allowed[0]! : natural);
        return id === edge.id || selected === side;
      });
      const horizontal = side === "left" || side === "right";
      const projected = (id: string) => {
        const e = state.edges.get(id)!;
        const n = state.nodes.get(e.sourceId === nodeId ? e.targetId : e.sourceId)!;
        const p = center(worldRect(n, state)!);
        return horizontal ? p.y : p.x;
      };
      adjacent.sort((a, b) => projected(a) - projected(b) || (a < b ? -1 : a > b ? 1 : 0));
      const span = horizontal ? bounds.height : bounds.width;
      const spacing = Math.min(config.edgeSpacing, (span * 0.7) / Math.max(1, adjacent.length - 1));
      const shift = (adjacent.indexOf(edge.id) - (adjacent.length - 1) / 2) * spacing;
      point = horizontal ? { x: point.x, y: point.y + shift } : { x: point.x + shift, y: point.y };
    }
    if (name !== undefined) {
      const port = node?.ports?.find((p) => p.name === name);
      if (
        port &&
        Number.isFinite(port.x) &&
        Number.isFinite(port.y) &&
        Number.isFinite(port.width ?? 0) &&
        Number.isFinite(port.height ?? 0)
      ) {
        point = {
          x: outer.x + port.x! + (port.width ?? 0) / 2,
          y: outer.y + port.y! + (port.height ?? 0) / 2,
        };
        if (!(source ? perEdge.sourceSide : perEdge.targetSide))
          side = sideToward(center(outer), point);
      } else
        report("MISSING_PORT", `Port ${name} has no positioned geometry; used the node boundary`);
    }
    if (attachment && name === undefined && !(source ? perEdge.sourceSide : perEdge.targetSide)) {
      const excludedParents = new Set(
        [...ancestors(edge.sourceId, state), ...ancestors(edge.targetId, state)].filter(
          (id) => id !== edge.sourceId && id !== edge.targetId,
        ),
      );
      const blocked = (p: RoutePoint, s: RouteSide) => {
        const sign = attachment.facing === "inward" ? -1 : 1,
          v = vector(s);
        const lead = { x: p.x + v.x * sign, y: p.y + v.y * sign };
        return state.obstacles.query(segmentBounds(p, lead)).some((id) => {
          if (
            id === `n:${source ? edge.sourceId : edge.targetId}` ||
            (id.startsWith("n:") && excludedParents.has(id.slice(2)))
          )
            return false;
          return crossesRect(p, lead, state.obstacles.bounds.get(id)!);
        });
      };
      if (blocked(point, side)) {
        const toward = center(attractingLabel ?? other);
        for (const alternative of ["left", "right", "top", "bottom"] as const) {
          const p = { ...anchor(bounds, alternative) };
          if (alternative === "left" || alternative === "right")
            p.y = Math.max(bounds.y, Math.min(bounds.y + bounds.height, toward.y));
          else p.x = Math.max(bounds.x, Math.min(bounds.x + bounds.width, toward.x));
          if (!blocked(p, alternative)) {
            side = alternative;
            point = p;
            break;
          }
        }
      }
    }
    if (source && !parentLabel && perEdge.bezier?.source?.kind === "port") {
      point = perEdge.bezier.source.escape;
      side = perEdge.bezier.source.direction;
    }
    if (policy) {
      const allowed = source ? perEdge.sourceSides : perEdge.targetSides;
      if (allowed && !allowed.includes(side)) {
        if (
          name !== undefined ||
          (source ? perEdge.sourceSide : perEdge.targetSide) ||
          !allowed.length
        )
          report(
            "CONSTRAINT_VIOLATION",
            "Endpoint port conflicts with allowed sides",
            source ? "source-tangent" : "target-tangent",
          );
        else {
          side = allowed[0]!;
          point = anchor(bounds, side);
        }
      }
    }
    return {
      point,
      side:
        attachment?.facing === "inward"
          ? ({ left: "right", right: "left", top: "bottom", bottom: "top" } as const)[side]
          : side,
      ref:
        source && parentLabel
          ? { kind: "label", edgeId: parentLabel.id }
          : {
              kind: "node",
              nodeId: source ? edge.sourceId : edge.targetId,
              ...(name === undefined ? {} : { port: name }),
            },
    };
  }
  const previousSide = (source: boolean) => {
    if (!automaticFaces || policy?.stability?.kind !== "preserve-valid") return undefined;
    const side = source
      ? batch.previous?.sections[0]?.fromSide
      : batch.previous?.sections.at(-1)?.toSide;
    const allowed = source ? perEdge.sourceSides : perEdge.targetSides;
    return side && (!allowed || allowed.includes(side)) ? side : undefined;
  };
  const source = terminal(true, previousSide(true)),
    target = terminal(false, previousSide(false)),
    positionedLabel = labelRect(edge, state),
    label =
      policy?.label?.kind === "follow" || policy?.label?.kind === "fixed"
        ? undefined
        : positionedLabel;
  const excluded = new Set(
    [...ancestors(edge.sourceId, state), ...ancestors(edge.targetId, state)]
      .filter((id) => id !== edge.sourceId && id !== edge.targetId)
      .map((id) => `n:${id}`),
  );
  if (policy?.label?.kind === "through") excluded.add(`e:${edge.id}`);
  if (perEdge.sourceAttachment !== undefined) excluded.add(`n:${edge.sourceId}`);
  if (perEdge.targetAttachment !== undefined) excluded.add(`n:${edge.targetId}`);
  const context = contextFor(
    state,
    excluded,
    new Set([
      `n:${edge.sourceId}`,
      `n:${edge.targetId}`,
      `e:${edge.id}`,
      ...(parentLabel ? [`e:${parentLabel.id}`] : []),
    ]),
    metrics,
    batch,
    lane * config.edgeSpacing,
  );
  const searchContext =
    policy?.curve?.kind === "bezier" ||
    policy?.curve?.kind === "catmull-rom" ||
    (!policy?.curve && ["curved", "organic", "bundle", "bezier"].includes(style))
      ? contextFor(
          state,
          excluded,
          new Set([
            `n:${edge.sourceId}`,
            `n:${edge.targetId}`,
            `e:${edge.id}`,
            ...(parentLabel ? [`e:${parentLabel.id}`] : []),
          ]),
          metrics,
          batch,
          config.radius * 2 + lane * config.edgeSpacing,
        )
      : context;
  let futureTargetCorridor: RouteBounds | undefined;
  const protectFutureTarget = (ctx: SearchContext) => {
    const obstacles = ctx.obstacles;
    ctx.obstacles = (bounds) => {
      const result = obstacles(bounds);
      return futureTargetCorridor && intersects(bounds, futureTargetCorridor)
        ? [...result, futureTargetCorridor]
        : result;
    };
    return ctx;
  };
  for (const ctx of new Set([context, searchContext])) protectFutureTarget(ctx);
  const drawn: Reservation[] = [];
  // Sharing terminal attachment regions is clipped below. A later leg must
  // never retrace a collinear segment of this same edge outside those regions.
  const selfCost = (a: RoutePoint, b: RoutePoint) =>
    drawn.reduce((cost, segment) => {
      const overlap = conflictCost(a, b, segment, {
        ...config,
        edgeSpacing: 0,
        crossingPenalty: 0,
        overlapPenalty: 1,
      });
      return cost + (overlap > 1e-8 ? Infinity : conflictCost(a, b, segment, config));
    }, 0);
  for (const ctx of new Set([context, searchContext])) {
    const cost = ctx.edgeCost,
      guides = ctx.guides;
    ctx.edgeCost = (a, b) => (cost?.(a, b) ?? 0) + selfCost(a, b);
    ctx.guides = (bounds) => [
      ...(guides?.(bounds) ?? []),
      ...drawn.map((s) => reservationBounds(s, config.edgeSpacing)),
    ];
  }
  const labelSide = (toward: RoutePoint) => {
    const preferred = sideToward(center(label!), toward);
    return perEdge.labelSides?.includes(preferred) === false ? perEdge.labelSides[0]! : preferred;
  };
  const labelAnchor = (toward: RoutePoint) => {
    const side = labelSide(toward),
      point = anchor(label!, side);
    // Border attachments may slide within the label; avoid tiny center-offset jogs.
    if (
      (side === "left" || side === "right") &&
      toward.y > label!.y &&
      toward.y < label!.y + label!.height
    )
      return { x: point.x, y: toward.y };
    if (
      (side === "top" || side === "bottom") &&
      toward.x > label!.x &&
      toward.x < label!.x + label!.width
    )
      return { x: toward.x, y: point.y };
    return point;
  };
  const firstTarget: Terminal = label
    ? {
        point: labelAnchor(source.point),
        side: labelSide(source.point),
        ref: { kind: "label", edgeId: edge.id },
      }
    : target;
  const outgoingSide = label && labelSide(target.point);
  const exitSide =
    label &&
    (outgoingSide === firstTarget.side
      ? perEdge.labelSides
        ? (perEdge.labelSides.find((side) => side !== firstTarget.side) ?? firstTarget.side)
        : ({ left: "right", right: "left", top: "bottom", bottom: "top" } as const)[
            firstTarget.side
          ]
      : outgoingSide);
  if (label && exitSide === firstTarget.side) {
    const horizontal = exitSide === "top" || exitSide === "bottom";
    const fraction = (
      horizontal ? source.point.x > target.point.x : source.point.y > target.point.y
    )
      ? 2 / 3
      : 1 / 3;
    firstTarget.point = {
      ...anchor(label, exitSide),
      ...(horizontal
        ? { x: label.x + label.width * fraction }
        : { y: label.y + label.height * fraction }),
    };
  }
  const lastSource: Terminal | undefined =
    label && exitSide
      ? {
          point:
            exitSide === firstTarget.side
              ? {
                  ...anchor(label, exitSide),
                  ...(exitSide === "top" || exitSide === "bottom"
                    ? { x: label.x + label.width - (firstTarget.point.x - label.x) }
                    : { y: label.y + label.height - (firstTarget.point.y - label.y) }),
                }
              : exitSide === outgoingSide
                ? labelAnchor(target.point)
                : anchor(label, exitSide),
          side: exitSide,
          ref: { kind: "label", edgeId: edge.id },
        }
      : undefined;
  const curvePolicy =
    policy?.curve ??
    (style === "bezier" || style === "curved" || style === "organic" || style === "bundle"
      ? { kind: "bezier" as const }
      : { kind: "polyline" as const });
  const reverse = (p: RoutePoint): RoutePoint => ({ x: -p.x, y: -p.y });
  const normalized = (p: RoutePoint): RoutePoint => {
    const length = Math.hypot(p.x, p.y);
    return length ? { x: p.x / length, y: p.y / length } : { x: 1, y: 0 };
  };
  const directionMatches = (actual: RoutePoint, requested: RoutePoint) =>
    actual.x * requested.x + actual.y * requested.y > 1 - 1e-6;
  let labelDirection: RoutePoint | undefined;
  const portEscapes = new Map<Terminal, { point: RoutePoint; context: SearchContext }>();
  if (policy) {
    for (const [terminal, requested, sourceEnd] of [
      [source, policy.sourceTangent, true],
      [target, policy.targetTangent, false],
    ] as const) {
      const normal = sourceEnd ? vector(terminal.side) : reverse(vector(terminal.side));
      terminal.tangent =
        requested?.kind === "vector"
          ? requested.direction
          : requested?.kind === "border-normal" ||
              (terminal.ref.kind === "node" && terminal.ref.port !== undefined)
            ? normal
            : undefined;
      if (terminal.tangent && terminal.tangent.x * normal.x + terminal.tangent.y * normal.y <= 1e-8)
        report(
          "CONSTRAINT_VIOLATION",
          "Requested tangent conflicts with the selected attachment face",
          sourceEnd ? "source-tangent" : "target-tangent",
        );
      if (
        curvePolicy.kind === "rounded-orthogonal" &&
        terminal.tangent &&
        Math.abs(terminal.tangent.x * terminal.tangent.y) > 1e-8
      )
        report(
          "CONSTRAINT_VIOLATION",
          "Orthogonal paths require axis-aligned terminal tangents",
          sourceEnd ? "source-tangent" : "target-tangent",
        );
    }
    for (const terminal of [source, target]) {
      if (terminal.ref.kind !== "node" || terminal.ref.port === undefined) continue;
      const owner = terminal === source ? sourceBounds : targetBounds;
      const point = terminal.point;
      if (
        point.x <= owner.x ||
        point.x >= owner.x + owner.width ||
        point.y <= owner.y ||
        point.y >= owner.y + owner.height
      )
        continue;
      const outward = terminal === source ? terminal.tangent! : reverse(terminal.tangent!);
      const length = Math.min(
        outward.x > 0
          ? (owner.x + owner.width - point.x) / outward.x
          : outward.x < 0
            ? (owner.x - point.x) / outward.x
            : Infinity,
        outward.y > 0
          ? (owner.y + owner.height - point.y) / outward.y
          : outward.y < 0
            ? (owner.y - point.y) / outward.y
            : Infinity,
      );
      portEscapes.set(terminal, {
        point,
        context: protectFutureTarget(
          contextFor(
            state,
            new Set([...excluded, `n:${terminal.ref.nodeId}`]),
            new Set([
              `n:${edge.sourceId}`,
              `n:${edge.targetId}`,
              `e:${edge.id}`,
              ...(parentLabel ? [`e:${parentLabel.id}`] : []),
            ]),
            metrics,
            batch,
            lane * config.edgeSpacing,
          ),
        ),
      });
      terminal.point = { x: point.x + outward.x * length, y: point.y + outward.y * length };
    }
    if (policy.label && policy.label.kind !== "follow" && !positionedLabel)
      report("MISSING_GEOMETRY", "This label policy requires positioned label geometry");
    if (label && lastSource && (policy.label?.kind === "through" || policy.label?.kind === "gap")) {
      const tangent = policy.label.tangent;
      labelDirection =
        tangent?.kind === "vector"
          ? tangent.direction
          : tangent?.kind === "border-normal"
            ? reverse(vector(firstTarget.side))
            : normalized({
                x: target.point.x - source.point.x,
                y: target.point.y - source.point.y,
              });
      if (curvePolicy.kind === "rounded-orthogonal" && tangent?.kind !== "vector")
        labelDirection = reverse(vector(firstTarget.side));
      const direction = labelDirection;
      if (policy.label.kind === "gap" && tangent?.kind === "border-normal") {
        firstTarget.tangent = reverse(vector(firstTarget.side));
        lastSource.tangent = vector(lastSource.side);
      } else {
        const middle = center(label);
        const extent = Math.min(
          direction.x ? label.width / (2 * Math.abs(direction.x)) : Infinity,
          direction.y ? label.height / (2 * Math.abs(direction.y)) : Infinity,
        );
        const enter = { x: middle.x - direction.x * extent, y: middle.y - direction.y * extent };
        const leave = { x: middle.x + direction.x * extent, y: middle.y + direction.y * extent };
        const horizontalFace =
          Math.abs(direction.x) / label.width >= Math.abs(direction.y) / label.height;
        firstTarget.side = horizontalFace
          ? direction.x > 0
            ? "left"
            : "right"
          : direction.y > 0
            ? "top"
            : "bottom";
        lastSource.side = horizontalFace
          ? direction.x > 0
            ? "right"
            : "left"
          : direction.y > 0
            ? "bottom"
            : "top";
        firstTarget.point = policy.label.kind === "through" ? middle : enter;
        lastSource.point = policy.label.kind === "through" ? middle : leave;
        firstTarget.tangent = lastSource.tangent = direction;
      }
      if (
        perEdge.labelSides &&
        (!perEdge.labelSides.includes(firstTarget.side) ||
          !perEdge.labelSides.includes(lastSource.side))
      )
        report(
          "CONSTRAINT_VIOLATION",
          "Label tangent conflicts with allowed entry and exit faces",
          "label-tangent",
        );
      if (curvePolicy.kind === "rounded-orthogonal" && Math.abs(direction.x * direction.y) > 1e-8)
        report(
          "CONSTRAINT_VIOLATION",
          "Orthogonal paths require axis-aligned label tangents",
          "label-tangent",
        );
    }
  }
  const portSegment = (from: RoutePoint, to: RoutePoint): RouteSegment =>
    curvePolicy.kind === "bezier" || curvePolicy.kind === "catmull-rom"
      ? {
          kind: "cubic",
          control1: { x: from.x + (to.x - from.x) / 3, y: from.y + (to.y - from.y) / 3 },
          control2: {
            x: from.x + ((to.x - from.x) * 2) / 3,
            y: from.y + ((to.y - from.y) * 2) / 3,
          },
          to,
        }
      : { kind: "line", to };
  function withPortEscapes(path: RoutePath, a: Terminal, b: Terminal): RoutePath {
    const first = portEscapes.get(a),
      last = portEscapes.get(b);
    return first || last
      ? {
          start: first?.point ?? path.start,
          segments: [
            ...(first ? [portSegment(first.point, a.point)] : []),
            ...path.segments,
            ...(last ? [portSegment(b.point, last.point)] : []),
          ],
        }
      : path;
  }
  function policyPathSafe(path: RoutePath): boolean {
    if (!portEscapes.size) return safe(path, context);
    let from = path.start;
    return path.segments.every((segment, index) => {
      let checkedContext = context;
      for (const [terminal, escape] of portEscapes) {
        const sourceEnd = terminal === source;
        const expected = sourceEnd
          ? portSegment(escape.point, terminal.point)
          : portSegment(terminal.point, escape.point);
        if (
          (sourceEnd
            ? index === 0 && distance(from, escape.point) < 1e-7
            : index === path.segments.length - 1 && distance(from, terminal.point) < 1e-7) &&
          JSON.stringify(segment) === JSON.stringify(expected)
        )
          checkedContext = escape.context;
      }
      const checked = { start: from, segments: [segment] };
      from = segment.to;
      return safe(checked, checkedContext);
    });
  }
  const authoredCrossing =
    loop ||
    pathHasSelfIntersection(
      pathFromPoints([source.point, ...(perEdge.waypoints ?? []), target.point]),
    );
  function assessPath(
    path: RoutePath,
    a?: Terminal,
    b?: Terminal,
  ): { valid: boolean; cost: number } {
    const reverseTravel = policy?.monotonic
      ? pathReverseTravel(
          path,
          policy.monotonic.axis,
          portEscapes.get(source)?.point ?? source.point,
          portEscapes.get(target)?.point ?? target.point,
        )
      : 0;
    const valid =
      policyPathSafe(path) &&
      (authoredCrossing || !pathHasSelfIntersection(path)) &&
      (!a?.tangent || directionMatches(pathEndpointTangent(path, "start"), a.tangent)) &&
      (!b?.tangent || directionMatches(pathEndpointTangent(path, "end"), b.tangent)) &&
      !(policy?.monotonic?.strength === "require" && reverseTravel > 1e-7);
    return {
      valid,
      cost:
        pathCost(path, context) +
        (curvePolicy.kind === "bezier" && path.segments.length > 1
          ? path.segments.filter((segment, index) => {
              if (segment.kind !== "cubic") return false;
              const start = index ? path.segments[index - 1]!.to : path.start;
              const dx = segment.to.x - start.x,
                dy = segment.to.y - start.y;
              return [segment.control1, segment.control2].every(
                (point) => Math.abs(dx * (point.y - start.y) - dy * (point.x - start.x)) < 1e-7,
              );
            }).length * context.bendPenalty
          : 0) +
        (curvePolicy.kind === "catmull-rom"
          ? Math.max(0, path.segments.length - (perEdge.waypoints?.length ?? 0) - 1) *
            context.bendPenalty
          : 0) +
        (policy?.monotonic?.strength === "prefer" ? reverseTravel * 80 : 0),
    };
  }
  let shapeFallback = false;
  function compactBezierGuide(a: Terminal, b: Terminal, via: readonly RoutePoint[], padding = 0) {
    const remaining =
      config.maxSearchNodes -
      searchContext.visited -
      (searchContext === context ? 0 : context.visited);
    if (remaining <= 0) return undefined;
    const compact = {
      ...context,
      obstacles: (bounds: RouteBounds) =>
        context.obstacles(inflate(bounds, padding)).map((rect) => {
          const contains = (point: RoutePoint) =>
            point.x >= rect.x &&
            point.x <= rect.x + rect.width &&
            point.y >= rect.y &&
            point.y <= rect.y + rect.height;
          return contains(a.point) || contains(b.point) ? rect : inflate(rect, padding);
        }),
      visited: 0,
      budgetExceeded: false,
      maxSearchNodes: remaining,
    };
    const anchors = [a.point, ...via, b.point];
    const points = [a.point];
    let complete = true;
    for (let i = 1; i < anchors.length; i++) {
      const found = findPath(anchors[i - 1]!, anchors[i]!, "polyline", compact);
      if (!found) {
        complete = false;
        break;
      }
      points.push(...found.slice(1));
    }
    searchContext.visited += compact.visited;
    return complete ? points : undefined;
  }
  function selectPolicyPath(
    a: Terminal,
    b: Terminal,
    via: readonly RoutePoint[],
    guide: RoutePath,
  ): RoutePath {
    if (loop && !via.length && curvePolicy.kind === "bezier" && distance(a.point, b.point) < 1e-8) {
      const normal = vector(a.side),
        lateral = { x: -normal.y, y: normal.x };
      const extent = config.clearance + config.edgeSpacing + 10;
      const loops: { path: RoutePath; cramped: boolean }[] = [];
      for (const reach of [extent, extent * 2, extent * 3, config.clearance + 1])
        for (const width of [extent, extent * 2]) {
          const at = (outward: number, across: number) => ({
            x: a.point.x + normal.x * outward + lateral.x * across,
            y: a.point.y + normal.y * outward + lateral.y * across,
          });
          loops.push({
            cramped: reach < extent,
            path: {
              start: a.point,
              segments: [
                {
                  kind: "cubic",
                  control1: at(reach / 2, 0),
                  control2: at(reach, -width),
                  to: at(reach, 0),
                },
                {
                  kind: "cubic",
                  control1: at(reach, width),
                  control2: at(reach / 2, 0),
                  to: b.point,
                },
              ],
            },
          });
        }
      const viable = loops
        .map(({ path, cramped }) => ({ path, cramped, ...assessPath(path, a, b) }))
        .filter((candidate) => candidate.valid);
      viable.sort((a, b) => Number(a.cramped) - Number(b.cramped) || a.cost - b.cost);
      if (viable.length) return viable[0]!.path;
    }
    const guidePoints = [guide.start, ...guide.segments.map((part) => part.to)];
    const candidates: RoutePath[] = [];
    const unshapedCandidates = new Set<RoutePath>();
    const compact =
      curvePolicy.kind === "bezier" || curvePolicy.kind === "catmull-rom"
        ? compactBezierGuide(a, b, via)
        : undefined;
    const smoothCompact =
      curvePolicy.kind === "bezier" && !via.length
        ? compactBezierGuide(a, b, via, config.radius / 2)
        : undefined;
    const pointCandidates = [
      [a.point, ...via, b.point],
      guidePoints,
      ...(compact ? [compact] : []),
      ...(smoothCompact ? [smoothCompact] : []),
    ].filter((points) => {
      if (!points.some((point) => distance(point, points[0]!) > 1e-8)) return false;
      let index = 0;
      return via.every((point) => {
        while (index < points.length && distance(points[index]!, point) > 1e-7) index++;
        return index < points.length;
      });
    });
    for (const points of pointCandidates) {
      const tangents = new Map<number, RoutePoint>();
      if (a.tangent) tangents.set(0, a.tangent);
      if (b.tangent) tangents.set(points.length - 1, b.tangent);
      if (curvePolicy.kind === "polyline") candidates.push(pathFromPoints(points));
      else if (curvePolicy.kind === "catmull-rom")
        candidates.push(catmullRomPath(points, tangents));
      else if (curvePolicy.kind === "bezier") {
        const curvature = curvePolicy.curvature ?? 0.5;
        const requested = bezierThroughPoints(points, tangents, curvature);
        candidates.push(requested);
        if (
          !assessPath(requested, a, b).valid ||
          (!via.length && points.length > 2 && pathCurveOvershoot(requested) > 0.1)
        ) {
          const alternatives: RoutePath[] = [];
          if (!via.length && points.length > 2) {
            for (const ends of [
              [true, false],
              [false, true],
              [true, true],
            ]) {
              const directions = new Map(tangents);
              if (ends[0] && !a.tangent) directions.set(0, vector(a.side));
              if (ends[1] && !b.tangent) directions.set(points.length - 1, reverse(vector(b.side)));
              const limited = limitBezierHandles(
                bezierThroughPoints(points, directions, curvature),
              );
              if (limited) alternatives.push(limited);
            }
          }
          if (
            !assessPath(requested, a, b).valid &&
            !alternatives.some(
              (path) => assessPath(path, a, b).valid && pathCurveOvershoot(path) < 0.1,
            )
          ) {
            for (const scale of [0.5, 0.25, 0.125, 0.0625]) {
              const alternative = bezierThroughPoints(points, tangents, curvature * scale);
              alternatives.push(alternative);
              if (assessPath(alternative, a, b).valid && pathCurveOvershoot(alternative) < 0.1)
                break;
            }
          }
          if (!via.length && points.length > 2)
            for (const scale of [1, 0.5, 0.25])
              alternatives.push(roundedBezierPath(points, config.radius * scale));
          candidates.push(...alternatives);
          if (
            !assessPath(requested, a, b).valid &&
            !alternatives.some((path) => assessPath(path, a, b).valid)
          ) {
            const unshaped = pathFromPoints(points);
            candidates.push(unshaped);
            unshapedCandidates.add(unshaped);
          }
        }
      } else if (
        points
          .slice(1)
          .every((point, index) => point.x === points[index]!.x || point.y === points[index]!.y)
      ) {
        for (const scale of [1, 0.5, 0.25]) {
          const segments: RoutePath["segments"][number][] = [];
          let start = 0;
          for (let end = 1; end < points.length; end++) {
            if (
              end !== points.length - 1 &&
              !via.some((point) => distance(point, points[end]!) < 1e-7)
            )
              continue;
            segments.push(
              ...roundCorners(pathFromPoints(points.slice(start, end + 1)), {
                radius: (curvePolicy.radius ?? config.radius) * scale,
              }).segments,
            );
            start = end;
          }
          candidates.push({ start: points[0]!, segments });
        }
      }
    }
    const viable = candidates
      .map((path, index) => ({ path, index, ...assessPath(path, a, b) }))
      .filter((candidate) => candidate.valid && Number.isFinite(candidate.cost))
      .sort(
        (a, b) =>
          Number(unshapedCandidates.has(a.path)) - Number(unshapedCandidates.has(b.path)) ||
          a.cost - b.cost ||
          a.index - b.index,
      );
    if (viable.length) {
      if (unshapedCandidates.has(viable[0]!.path)) shapeFallback = true;
      return viable[0]!.path;
    }
    shapeFallback = true;
    return guide;
  }
  metrics.routedEdges++;
  const sections: RouteSection[] = [];
  const stub = (t: Terminal, end: boolean) => {
    if (t.ref.kind === "junction") return t.point;
    const v = t.tangent ? (end ? reverse(t.tangent) : t.tangent) : vector(t.side),
      length = Math.max(
        config.clearance +
          1 +
          (!grouped && peers.length > 1 ? peers.indexOf(edge.id) : 0) * config.edgeSpacing,
        policy && curvePolicy.kind === "rounded-orthogonal"
          ? (curvePolicy.radius ?? config.radius) * 2
          : 0,
      );
    return { x: t.point.x + v.x * length, y: t.point.y + v.y * length };
  };
  function guideConnection(a: Terminal, b: Terminal, via: readonly RoutePoint[] = []): RoutePath {
    let path: RoutePath | undefined, preferred: RoutePath | undefined;
    if (distance(a.point, b.point) < 1e-8 && !via.length) {
      const v = vector(a.side),
        tangent = { x: -v.y, y: v.x };
      const gap = config.clearance + config.edgeSpacing + 10;
      const candidates: RoutePath[] = [];
      // A loop at one port must extend out along that port's normal. The
      // common initial/return lead stays inside the shared attachment region.
      for (const extent of [
        config.clearance + 1,
        (config.clearance + 1) * 2,
        gap,
        gap * 2,
        gap * 3,
      ])
        for (const sign of [1, -1]) {
          const lead = Math.min(config.clearance + 1, extent / 3);
          const at = (normal: number, lateral: number) => ({
            x: a.point.x + v.x * normal + tangent.x * lateral,
            y: a.point.y + v.y * normal + tangent.y * lateral,
          });
          const candidate = pathFromPoints([
            a.point,
            at(lead, 0),
            at(lead, sign * extent),
            at(extent, sign * extent),
            at(extent, 0),
            b.point,
          ]);
          if (safe(candidate, context)) candidates.push(candidate);
        }
      if (!candidates.length) {
        // Optional clearance may hide a real corridor beside a label or node.
        const hard = contextFor(
          state,
          excluded,
          new Set([
            `n:${edge.sourceId}`,
            `n:${edge.targetId}`,
            `e:${edge.id}`,
            ...(parentLabel ? [`e:${parentLabel.id}`] : []),
          ]),
          metrics,
          batch,
          policy ? 0 : -config.clearance,
        );
        for (const extent of [config.clearance + 1, gap, gap * 2])
          for (const sign of [1, -1]) {
            const at = (normal: number, lateral: number) => ({
              x: a.point.x + v.x * normal + tangent.x * lateral,
              y: a.point.y + v.y * normal + tangent.y * lateral,
            });
            const candidate = pathFromPoints([
              a.point,
              at(1, 0),
              at(1, sign * extent),
              at(extent, sign * extent),
              at(extent, 0),
              b.point,
            ]);
            if (safe(candidate, hard)) candidates.push(candidate);
          }
      }
      candidates.sort((x, y) => pathCost(x, context) - pathCost(y, context));
      if (candidates.length) return candidates[0]!;
      report("CONSTRAINT_VIOLATION", "Coincident terminals; no clear outward loop corridor");
      return pathFromPoints([
        a.point,
        { x: a.point.x + v.x * gap, y: a.point.y + v.y * gap },
        b.point,
      ]);
    }
    if (
      loop &&
      !via.length &&
      a.ref.kind === "node" &&
      b.ref.kind === "node" &&
      a.side === "right" &&
      b.side === "top"
    ) {
      const r = inflate(sourceBounds, config.clearance + config.edgeSpacing + 1);
      const points = [
        a.point,
        { x: r.x + r.width, y: a.point.y },
        { x: r.x + r.width, y: r.y },
        { x: b.point.x, y: r.y },
        b.point,
      ];
      const loopPath = pathFromPoints(points);
      if (safe(loopPath, context))
        return ["curved", "bezier", "bundle"].includes(style)
          ? curve(points, state, context)
          : style === "organic"
            ? organic(points, state, context)
            : loopPath;
    }
    if (!policy && style === "straight" && !via.length && !loop)
      path = pathFromPoints([a.point, b.point]);
    else if (!policy && style === "bezier" && !via.length && !loop) {
      const direct = cubic(a, b);
      if (safe(direct, context)) {
        if (pathCost(direct, context) === pathLength(direct)) return direct;
        preferred = direct;
      }
    }
    if (!path) {
      const alignedFacing =
        (a.point.x === b.point.x || a.point.y === b.point.y) &&
        (b.point.x - a.point.x) * vector(a.side).x + (b.point.y - a.point.y) * vector(a.side).y >
          0 &&
        (a.point.x - b.point.x) * vector(b.side).x + (a.point.y - b.point.y) * vector(b.side).y > 0;
      const boundedStub = (t: Terminal, end: boolean) => {
        const p = stub(t, end),
          gap = distance(a.point, b.point) / 3;
        if (!alignedFacing || distance(t.point, p) <= gap) return p;
        const v = vector(t.side);
        return { x: t.point.x + v.x * gap, y: t.point.y + v.y * gap };
      };
      const start = boundedStub(a, false),
        end = boundedStub(b, true),
        waypoints = [...via];
      if (style === "parallel" && peers.length > 1) {
        // Find a feasible corridor before choosing lanes; an arbitrary midpoint
        // may be inside an obstacle even when good parallel routes exist.
        const base = findPathBetweenLeads(start, end, "polyline", context, [
          [a.point, start],
          [end, b.point],
        ]);
        const mid =
          base && base.length > 2
            ? base[Math.floor(base.length / 2)]!
            : center(segmentBounds(start, end));
        const d = Math.max(1, distance(start, end)),
          rank = peers.indexOf(edge.id) + 1;
        const orientation = edge.sourceId < edge.targetId ? 1 : -1;
        if (base && base.length > 2) waypoints.push(mid);
        for (const sign of base && base.length > 2 ? [] : [orientation, -orientation]) {
          const lane = {
            x: mid.x - ((end.y - start.y) / d) * config.edgeSpacing * rank * sign,
            y: mid.y + ((end.x - start.x) / d) * config.edgeSpacing * rank * sign,
          };
          if (clear(lane, lane, context)) {
            waypoints.push(lane);
            break;
          }
        }
        if (waypoints.length === via.length)
          report("CONSTRAINT_VIOLATION", "No clear parallel lane; rendered an individual route");
      }
      const points: RoutePoint[] = [a.point],
        anchors = [start, ...waypoints, end];
      const searchStyle =
        policy?.curve?.kind === "rounded-orthogonal"
          ? "orthogonal"
          : style === "polyline" || style === "organic" || style === "parallel"
            ? "polyline"
            : style === "octilinear"
              ? "octilinear"
              : "orthogonal";
      let ok = clear(a.point, start, context) && clear(end, b.point, context);
      for (let i = 1; ok && i < anchors.length; i++) {
        const directions = {
          incoming: i === 1 && a.ref.kind !== "junction" ? vector(a.side) : undefined,
          outgoing:
            i === anchors.length - 1 ? { x: -vector(b.side).x, y: -vector(b.side).y } : undefined,
        };
        let found = findPathBetweenLeads(
          anchors[i - 1]!,
          anchors[i]!,
          searchStyle,
          searchContext,
          [
            [a.point, start],
            [end, b.point],
          ],
          directions,
        );
        if (!found && searchContext !== context && !searchContext.budgetExceeded) {
          // Extra curve room is optional: tight channels may use safe line segments.
          const narrow = { ...searchContext, obstacles: context.obstacles };
          found = findPathBetweenLeads(
            anchors[i - 1]!,
            anchors[i]!,
            searchStyle,
            narrow,
            [
              [a.point, start],
              [end, b.point],
            ],
            directions,
          );
          searchContext.visited = narrow.visited;
          searchContext.budgetExceeded = narrow.budgetExceeded;
        }
        if (found) points.push(...found.slice(i === 1 ? 0 : 1));
        else ok = false;
      }
      points.push(b.point);
      if (ok) {
        const simple = policy && via.length ? points : simplify(points);
        path =
          !policy && (style === "curved" || style === "bundle" || style === "bezier")
            ? curve(simple, state, context)
            : style === "organic"
              ? organic(simple, state, context)
              : pathFromPoints(simple);
      }
    }
    if (
      preferred &&
      Number.isFinite(pathCost(preferred, context)) &&
      (!path || !safe(path, context) || pathCost(preferred, context) <= pathCost(path, context))
    )
      return preferred;
    if (path && safe(path, context) && Number.isFinite(pathCost(path, context))) return path;
    // Clearance and soft edge reservations must not turn a feasible connection
    // into an obstacle-crossing fallback. Retry against the hard geometry with
    // short terminal leads and a fresh, bounded search budget.
    if (policy || !["straight", "bezier", "polyline", "organic", "parallel"].includes(style)) {
      const hard = {
        ...contextFor(
          state,
          excluded,
          new Set([
            `n:${edge.sourceId}`,
            `n:${edge.targetId}`,
            `e:${edge.id}`,
            ...(parentLabel ? [`e:${parentLabel.id}`] : []),
          ]),
          metrics,
          batch,
          policy ? 0 : -config.clearance,
        ),
        maxSearchNodes: Math.max(
          0,
          config.maxSearchNodes -
            searchContext.visited -
            (searchContext === context ? 0 : context.visited),
        ),
      };
      protectFutureTarget(hard);
      hard.guides = undefined;
      hard.edgeCost = selfCost;
      const lead = (t: Terminal) => {
        const v = vector(t.side);
        // A positive subpixel gap is still a feasible corridor. A fixed 1px
        // retry lead can enter an adjacent label before search even begins.
        for (let length = 1; length >= 1e-6; length /= 2) {
          const point = { x: t.point.x + v.x * length, y: t.point.y + v.y * length };
          if (clear(t.point, point, hard)) return point;
        }
        return t.point;
      };
      const start = lead(a),
        end = lead(b),
        anchors = [start, ...via, end];
      const points = [a.point];
      let ok = clear(a.point, start, hard) && clear(end, b.point, hard);
      for (let i = 1; ok && i < anchors.length; i++) {
        const found = findPathBetweenLeads(
          anchors[i - 1]!,
          anchors[i]!,
          style === "octilinear" ? "octilinear" : "orthogonal",
          hard,
          [
            [a.point, start],
            [end, b.point],
          ],
          {
            incoming: i === 1 ? vector(a.side) : undefined,
            outgoing:
              i === anchors.length - 1 ? { x: -vector(b.side).x, y: -vector(b.side).y } : undefined,
          },
        );
        if (found) points.push(...found.slice(i === 1 ? 0 : 1));
        else ok = false;
      }
      points.push(b.point);
      const retry = pathFromPoints(simplify(points));
      searchContext.visited += hard.visited;
      if (ok && safe(retry, hard) && Number.isFinite(pathCost(retry, hard))) {
        let separated = retry;
        // Shift whole interior tracks, retaining their orthogonal neighboring
        // legs. This provides parallel lanes even when a crowded visibility
        // grid cannot afford another global optimization search.
        for (let pass = 0; pass < 6; pass++) {
          const track = [separated.start, ...separated.segments.map((s) => s.to)];
          let best = separated,
            bestCost = pathCost(separated, context);
          for (let i = 1; i < track.length - 2; i++) {
            const p = track[i]!,
              q = track[i + 1]!;
            if ((context.edgeCost?.(p, q) ?? 0) === 0) continue;
            const horizontal = p.y === q.y;
            if (!horizontal && p.x !== q.x) continue;
            for (const offset of [
              -config.edgeSpacing,
              config.edgeSpacing,
              -config.edgeSpacing * 2,
              config.edgeSpacing * 2,
              -config.edgeSpacing / 2,
              config.edgeSpacing / 2,
              -config.edgeSpacing / 3,
              config.edgeSpacing / 3,
              -config.edgeSpacing * 4,
              config.edgeSpacing * 4,
            ]) {
              const candidatePoints = track.map((r, j) =>
                j === i || j === i + 1
                  ? horizontal
                    ? { x: r.x, y: r.y + offset }
                    : { x: r.x + offset, y: r.y }
                  : r,
              );
              if (
                candidatePoints
                  .slice(1)
                  .some((r, j) => r.x !== candidatePoints[j]!.x && r.y !== candidatePoints[j]!.y)
              )
                continue;
              const candidate = pathFromPoints(simplify(candidatePoints));
              const segments = pathReservations(candidate);
              const retraces = segments.some((s, j) =>
                segments.slice(j + 1).some((t) => {
                  if (s.a.x === s.b.x && t.a.x === t.b.x && s.a.x === t.a.x)
                    return (
                      Math.min(Math.max(s.a.y, s.b.y), Math.max(t.a.y, t.b.y)) -
                        Math.max(Math.min(s.a.y, s.b.y), Math.min(t.a.y, t.b.y)) >
                      1e-8
                    );
                  if (s.a.y === s.b.y && t.a.y === t.b.y && s.a.y === t.a.y)
                    return (
                      Math.min(Math.max(s.a.x, s.b.x), Math.max(t.a.x, t.b.x)) -
                        Math.max(Math.min(s.a.x, s.b.x), Math.min(t.a.x, t.b.x)) >
                      1e-8
                    );
                  return false;
                }),
              );
              if (retraces || !safe(candidate, hard)) continue;
              const cost = pathCost(candidate, context);
              if (cost < bestCost) {
                best = candidate;
                bestCost = cost;
              }
            }
          }
          if (best === separated) break;
          separated = best;
        }
        // Keep the feasible path even if soft optimization runs out of budget.
        // A few nearby reservation guides allow separated tracks without
        // rebuilding a grid from every earlier route in the scene.
        if (!via.length && pathCost(retry, context) > pathLength(retry)) {
          const remaining = Math.max(
            0,
            config.maxSearchNodes -
              searchContext.visited -
              (searchContext === context ? 0 : context.visited),
          );
          const optimized = {
            ...hard,
            visited: 0,
            budgetExceeded: false,
            maxSearchNodes: Math.min(2000, remaining),
            edgeCost: (a: RoutePoint, b: RoutePoint) =>
              (batch.edgeCost?.(a, b) ?? 0) + selfCost(a, b),
            guides: (bounds: RouteBounds) => (batch.guides?.(bounds) ?? []).slice(0, 8),
          };
          const found = findPathBetweenLeads(
            start,
            end,
            style === "octilinear" ? "octilinear" : "orthogonal",
            optimized,
            [
              [a.point, start],
              [end, b.point],
            ],
            {
              incoming: vector(a.side),
              outgoing: { x: -vector(b.side).x, y: -vector(b.side).y },
            },
          );
          searchContext.visited += optimized.visited;
          if (found) {
            const candidate = pathFromPoints(simplify([a.point, ...found, b.point]));
            if (
              safe(candidate, hard) &&
              pathCost(candidate, context) < pathCost(separated, context)
            )
              return candidate;
          }
        }
        return separated;
      }
    }
    report(
      searchContext.budgetExceeded ? "SEARCH_BUDGET" : "ROUTE_BLOCKED",
      "Preferred route unavailable; fallback may cross obstacles or violate routing constraints",
    );
    // Always keep every endpoint and authored waypoint visible, even if no feasible path exists.
    if (loop && !via.length) {
      const r = inflate(sourceBounds, config.clearance + config.edgeSpacing + 1);
      return pathFromPoints([
        a.point,
        { x: r.x + r.width, y: a.point.y },
        { x: r.x + r.width, y: r.y },
        { x: b.point.x, y: r.y },
        b.point,
      ]);
    }
    return pathFromPoints([a.point, ...via, b.point]);
  }
  function connection(a: Terminal, b: Terminal, via: readonly RoutePoint[] = []): RoutePath {
    if (!policy) return guideConnection(a, b, via);
    const diagnosticStart = diagnostics.length;
    const fallbackBefore = shapeFallback;
    const evaluate = (from: Terminal, to: Terminal) => {
      diagnostics.splice(diagnosticStart);
      shapeFallback = fallbackBefore;
      const guide = guideConnection(from, to, via);
      const path = selectPolicyPath(from, to, via, guide);
      if (path !== guide)
        for (let i = diagnostics.length - 1; i >= diagnosticStart; i--)
          if (diagnostics[i]!.code === "ROUTE_BLOCKED" || diagnostics[i]!.code === "SEARCH_BUDGET")
            diagnostics.splice(i, 1);
      return {
        path: withPortEscapes(path, from, to),
        from,
        to,
        ...assessPath(path, from, to),
        diagnostics: diagnostics.slice(diagnosticStart),
        fallback: shapeFallback,
      };
    };
    let best = evaluate(a, b);
    if (
      automaticFaces &&
      a === source &&
      b === target &&
      (!best.valid || pathReverseTravel(best.path, "both", a.point, b.point) > 1)
    ) {
      for (const sourceEnd of [true, false]) {
        const current = sourceEnd ? a : b;
        const allowed = (sourceEnd ? perEdge.sourceSides : perEdge.targetSides) ?? [
          "left",
          "right",
          "top",
          "bottom",
        ];
        for (const side of allowed) {
          if (side === current.side) continue;
          if (
            searchContext.visited + (searchContext === context ? 0 : context.visited) >=
            config.maxSearchNodes
          )
            break;
          const alternative = terminal(sourceEnd, side);
          const requested = sourceEnd ? policy.sourceTangent : policy.targetTangent;
          if (requested?.kind === "border-normal")
            alternative.tangent = sourceEnd ? vector(side) : reverse(vector(side));
          const candidate = evaluate(sourceEnd ? alternative : a, sourceEnd ? b : alternative);
          if (candidate.valid && (!best.valid || candidate.cost < best.cost - 1e-7))
            best = candidate;
        }
      }
    }
    diagnostics.splice(diagnosticStart, diagnostics.length - diagnosticStart, ...best.diagnostics);
    shapeFallback = best.fallback;
    if (a === source && b === target) {
      Object.assign(source, best.from);
      Object.assign(target, best.to);
    }
    return best.path;
  }
  const via = perEdge.waypoints ?? [];
  if (via.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    throw new RangeError(`Non-finite waypoint on ${edge.id}`);
  // Plan the label's first leg without consuming the final terminal approach.
  // Otherwise the first leg can run through the target; its self-reservation
  // then makes the second leg impossible even in an open corridor.
  if (lastSource && !loop) {
    const hard = contextFor(
      state,
      excluded,
      new Set([
        `n:${edge.sourceId}`,
        `n:${edge.targetId}`,
        `e:${edge.id}`,
        ...(parentLabel ? [`e:${parentLabel.id}`] : []),
      ]),
      metrics,
      batch,
      -config.clearance,
    );
    const v = vector(target.side);
    for (let length = config.clearance + 1; length >= 1e-6; length /= 2) {
      const lead = {
        x: target.point.x + v.x * length,
        y: target.point.y + v.y * length,
      };
      const corridor = inflate(segmentBounds(target.point, lead), Math.min(0.5, length / 4));
      if (
        clear(target.point, lead, hard) &&
        !intersects(segmentBounds(source.point, source.point), corridor) &&
        !intersects(segmentBounds(firstTarget.point, firstTarget.point), corridor)
      ) {
        futureTargetCorridor = corridor;
        break;
      }
    }
  }
  const oldPolicy = batch.previousSettings && effectivePolicy(batch.previousSettings, edge.id);
  const shapePolicy = (p: RoutingPolicy | undefined) =>
    p && {
      curve: p.curve,
      sourceTangent: p.sourceTangent,
      targetTangent: p.targetTangent,
      label: p.label,
      monotonic: p.monotonic,
    };
  const oldConfig = batch.previousSettings?.edges[edge.id];
  const sameConstraints =
    JSON.stringify({ ...oldConfig, policy: undefined }) ===
      JSON.stringify({ ...perEdge, policy: undefined }) &&
    JSON.stringify(shapePolicy(oldPolicy)) === JSON.stringify(shapePolicy(policy));
  const oldSections = batch.previous?.sections;
  const oldFirst = oldSections?.[0]?.path,
    oldLast = oldSections?.at(-1)?.path;
  const corridor = futureTargetCorridor;
  futureTargetCorridor = undefined;
  const reusable =
    policy?.stability?.kind === "preserve-valid" &&
    sameConstraints &&
    batch.previous?.status === "routed" &&
    oldFirst &&
    oldLast &&
    oldSections!.every((section) => section.sharedId === undefined) &&
    distance(oldFirst.start, portEscapes.get(source)?.point ?? source.point) < 1e-7 &&
    distance(
      oldLast.segments.at(-1)?.to ?? oldLast.start,
      portEscapes.get(target)?.point ?? target.point,
    ) < 1e-7 &&
    oldSections!.every((section) => assessPath(section.path).valid) &&
    (!source.tangent || directionMatches(pathEndpointTangent(oldFirst, "start"), source.tangent)) &&
    (!target.tangent || directionMatches(pathEndpointTangent(oldLast, "end"), target.tangent)) &&
    (!lastSource ||
      (distance(
        oldSections!.at(-2)?.path.segments.at(-1)?.to ?? oldFirst.start,
        firstTarget.point,
      ) < 1e-7 &&
        distance(oldLast.start, lastSource.point) < 1e-7 &&
        (!firstTarget.tangent ||
          directionMatches(
            pathEndpointTangent(oldSections!.at(-2)!.path, "end"),
            firstTarget.tangent,
          )) &&
        (!lastSource.tangent ||
          directionMatches(pathEndpointTangent(oldLast, "start"), lastSource.tangent))));
  futureTargetCorridor = corridor;
  if (reusable) {
    sections.push(...oldSections!);
    futureTargetCorridor = undefined;
  } else {
    const plan = grouped ? groupPlan(group!, state, metrics, batch, style) : undefined;
    if (grouped && !plan)
      report("ROUTE_BLOCKED", "Shared trunk unavailable; used individual fallback routing");
    if (plan) {
      const start = plan.path.start,
        end = plan.path.segments.at(-1)?.to ?? start;
      const j0: Terminal = {
        point: start,
        side: sideToward(start, source.point),
        ref: { kind: "junction", id: `${plan.id}:start` },
      };
      const j1: Terminal = {
        point: end,
        side: sideToward(end, firstTarget.point),
        ref: { kind: "junction", id: `${plan.id}:end` },
      };
      sections.push(
        {
          id: `${edge.id}:source`,
          from: source.ref,
          to: j0.ref,
          path: connection(source, j0, via),
        },
        { id: `${edge.id}:trunk`, sharedId: plan.id, from: j0.ref, to: j1.ref, path: plan.path },
        {
          id: `${edge.id}:target`,
          from: j1.ref,
          to: firstTarget.ref,
          path: connection(j1, firstTarget),
        },
      );
    } else
      sections.push({
        id: `${edge.id}:0`,
        from: source.ref,
        to: firstTarget.ref,
        path: connection(source, firstTarget, via),
        ...(policy ? { fromSide: source.side, toSide: firstTarget.side } : {}),
      });
    if (lastSource) {
      futureTargetCorridor = undefined;
      let segments = sections.flatMap((s) => pathReservations(s.path));
      // The two legs meet at a label and, for a self-loop, at their node. Sharing
      // those attachment regions is legitimate; retracing a distant trunk is not.
      // Label interiors are gaps, but strokes along their borders remain visible
      // and must stay reserved. Node attachment regions include their borders.
      segments = segments.flatMap((s) => outsideTerminal(s, label!, false));
      if (loop)
        segments = segments.flatMap((s) =>
          outsideTerminal(s, inflate(sourceBounds, config.clearance + 1)),
        );
      drawn.push(...segments);
      sections.push({
        id: `${edge.id}:label-target`,
        from: lastSource.ref,
        to: target.ref,
        path: connection(lastSource, target),
        ...(policy ? { fromSide: lastSource.side, toSide: target.side } : {}),
      });
    }
  }
  metrics.searchNodes += searchContext.visited + (searchContext === context ? 0 : context.visited);
  if (policy) {
    const labelKind = policy.label?.kind;
    const logicalPaths = sections.map((section) => section.path);
    if (labelKind === "gap" && lastSource)
      logicalPaths.splice(
        logicalPaths.length - 1,
        0,
        pathFromPoints([firstTarget.point, center(label!), lastSource.point]),
      );
    const first = sections[0]?.path,
      last = sections.at(-1)?.path;
    if (
      first &&
      source.tangent &&
      !directionMatches(pathEndpointTangent(first, "start"), source.tangent)
    )
      report(
        "CONSTRAINT_VIOLATION",
        "Final source tangent differs from the requested direction",
        "source-tangent",
      );
    if (
      last &&
      target.tangent &&
      !directionMatches(pathEndpointTangent(last, "end"), target.tangent)
    )
      report(
        "CONSTRAINT_VIOLATION",
        "Final target tangent differs from the requested direction",
        "target-tangent",
      );
    if (lastSource && labelDirection && (labelKind === "through" || labelKind === "gap")) {
      const incoming = sections.at(-2)?.path,
        outgoing = last;
      if (
        !incoming ||
        !outgoing ||
        !directionMatches(pathEndpointTangent(incoming, "end"), firstTarget.tangent!) ||
        !directionMatches(pathEndpointTangent(outgoing, "start"), lastSource.tangent!)
      )
        report(
          "CONSTRAINT_VIOLATION",
          "Final label tangents differ from the requested direction",
          "label-tangent",
        );
    }
    if (
      logicalPaths.some(
        (path) =>
          policy.monotonic?.strength === "require" &&
          pathReverseTravel(
            path,
            policy.monotonic.axis,
            portEscapes.get(source)?.point ?? source.point,
            portEscapes.get(target)?.point ?? target.point,
          ) > 1e-7,
      )
    )
      report(
        "CONSTRAINT_VIOLATION",
        "No final curve satisfies required monotonicity",
        "monotonicity",
      );
    if (sections.some((section) => !policyPathSafe(section.path))) {
      const labelsBlocked =
        policy.collisions?.labels !== "allow" &&
        sections.some((section) => {
          let from = section.path.start;
          return section.path.segments.some((segment) => {
            const blocked = state.obstacles
              .query(getPathBounds({ start: from, segments: [segment] }))
              .some(
                (id) =>
                  id.startsWith("e:") &&
                  !excluded.has(id) &&
                  segmentCrossesRect(
                    from,
                    segment,
                    inflate(
                      state.obstacles.bounds.get(id)!,
                      id === `e:${edge.id}` || id === `e:${parentLabel?.id}` ? 0 : config.clearance,
                    ),
                  ),
              );
            from = segment.to;
            return blocked;
          });
        });
      report(
        "CONSTRAINT_VIOLATION",
        "No final curve satisfies obstacle clearance",
        labelsBlocked ? "label-clearance" : "node-clearance",
      );
    }
    const hardFailure = diagnostics.some(
      (d) =>
        d.code === "MISSING_GEOMETRY" ||
        d.code === "MISSING_PORT" ||
        (d.code === "CONSTRAINT_VIOLATION" && d.constraint !== "bundle"),
    );
    if ((hardFailure || shapeFallback) && grouped) {
      const independent = routeEdge(
        edge,
        {
          ...state,
          settings: {
            ...state.settings,
            edges: {
              ...state.settings.edges,
              [edge.id]: { ...perEdge, group: `independent:${edge.id}` },
            },
          },
        },
        strategyStyle,
        metrics,
        batch,
      );
      return {
        ...independent,
        diagnostics: [
          ...independent.diagnostics,
          {
            code: "CONSTRAINT_VIOLATION",
            edgeId: edge.id,
            constraint: "bundle",
            message: "Shared geometry violates this branch policy; routed independently",
          },
        ],
      };
    }
    if (hardFailure) return { edgeId: edge.id, sections: [], status: "fallback", diagnostics };
    if (shapeFallback)
      report("CONSTRAINT_VIOLATION", "Requested curve unavailable; retained a hard-safe guide");
    if (
      policy.monotonic?.strength === "prefer" &&
      logicalPaths.some(
        (path) =>
          pathReverseTravel(
            path,
            policy.monotonic!.axis,
            portEscapes.get(source)?.point ?? source.point,
            portEscapes.get(target)?.point ?? target.point,
          ) > 1e-7,
      )
    )
      report(
        "CONSTRAINT_VIOLATION",
        "Obstacle-clear route requires reverse travel",
        "monotonicity",
      );
    let placement: RouteLabelPlacement | undefined;
    if (
      labelKind === "follow" &&
      policy.label?.kind === "follow" &&
      Number.isFinite(edge.width) &&
      Number.isFinite(edge.height) &&
      edge.width! > 0 &&
      edge.height! > 0
    )
      placement = placeFollowingLabel(
        logicalPaths,
        { width: edge.width!, height: edge.height! },
        policy.label,
      );
    else if (policy.label && positionedLabel) {
      const anchor = center(positionedLabel);
      let tangent = labelDirection ?? { x: 0, y: 0 },
        nearest = Infinity;
      if (!labelDirection)
        for (const path of logicalPaths) {
          const points = flattenPath(path, { tolerance: 0.1 });
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1]!,
              b = points[i]!,
              dx = b.x - a.x,
              dy = b.y - a.y,
              squared = dx * dx + dy * dy;
            const t = squared
              ? Math.max(0, Math.min(1, ((anchor.x - a.x) * dx + (anchor.y - a.y) * dy) / squared))
              : 0;
            const gap = distance(anchor, { x: a.x + dx * t, y: a.y + dy * t });
            if (gap < nearest) {
              nearest = gap;
              tangent = normalized({ x: dx, y: dy });
            }
          }
        }
      placement = { bounds: positionedLabel, anchor, tangent };
    }
    if (placement && labelKind === "follow") {
      batch.dependencyBounds = batch.dependencyBounds
        ? union(batch.dependencyBounds, placement.bounds)
        : placement.bounds;
      const overlaps = state.obstacles
        .query(placement.bounds)
        .filter((id) => intersects(placement!.bounds, state.obstacles.bounds.get(id)!));
      overlaps.push(...(batch.labelOverlaps?.(placement.bounds) ?? []));
      if (overlaps.length)
        diagnostics.push({
          code: "LABEL_OVERLAP",
          edgeId: edge.id,
          message: "Following label overlaps fixed geometry or another label",
          relatedIds: [...new Set(overlaps)].sort(),
        });
    }
    if (
      sections.some((section) =>
        pathReservations(section.path).some((segment) => batch.conflicts?.(segment.a, segment.b)),
      )
    )
      report("ROUTE_CONFLICT", "Final curve crosses or overlaps another edge");
    const failed =
      shapeFallback ||
      diagnostics.some(
        (d) =>
          d.code !== "ROUTE_CONFLICT" &&
          d.code !== "LABEL_OVERLAP" &&
          d.constraint !== "monotonicity" &&
          d.constraint !== "bundle",
      );
    return {
      edgeId: edge.id,
      sections,
      status: failed ? "fallback" : "routed",
      diagnostics,
      ...(placement ? { label: placement } : {}),
    };
  }
  if (
    sections.some((section) =>
      pathReservations(section.path).some((segment) => batch.conflicts?.(segment.a, segment.b)),
    )
  )
    report(
      "ROUTE_CONFLICT",
      "Route crosses or overlaps another edge; retained a compact visible path",
    );
  return {
    edgeId: edge.id,
    sections,
    status: diagnostics.length ? "fallback" : "routed",
    diagnostics,
  };
}
export function routeBounds(route: Route): RouteBounds {
  let bounds: RouteBounds | undefined = route.label?.bounds;
  for (const section of route.sections) {
    const next = getPathBounds(section.path);
    bounds = bounds ? union(bounds, next) : next;
  }
  return bounds ?? { x: 0, y: 0, width: 0, height: 0 };
}
export { pointsBounds };
