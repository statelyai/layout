import type {
  Route,
  RouteBounds,
  RouteEndpoint,
  RoutePath,
  RoutePoint,
  RouteSection,
  RouteSide,
  RouteStyle,
  RoutingDiagnostic,
  RoutingMetrics,
} from "./types";
import {
  anchor,
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
import { distance, getPathBounds, pathFromPoints, roundCorners, segmentCrossesRect } from "./path";
import { inflate, union } from "./spatial";
import {
  clear,
  findPath,
  pointsBounds,
  segmentBounds,
  simplify,
  type SearchContext,
} from "./search";

type RoutingInput = Pick<
  State,
  "nodes" | "edges" | "groups" | "obstacles" | "settings" | "incident"
>;

export type Metrics = { -readonly [K in keyof RoutingMetrics]: RoutingMetrics[K] };
interface Terminal {
  point: RoutePoint;
  side: RouteSide;
  ref: RouteEndpoint;
}
interface Plan {
  path: RoutePath;
  id: string;
}
export interface Batch {
  readonly plans: Map<string, Plan | null>;
  dependencyBounds?: RouteBounds;
  edgeCost?(a: RoutePoint, b: RoutePoint): number;
  conflicts?(a: RoutePoint, b: RoutePoint): boolean;
  guides?(bounds: RouteBounds): readonly RouteBounds[];
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
        .filter((id) => !excluded.has(id))
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
  const targets = edges.map(
    (e) => labelRect(e, state) ?? worldRect(state.nodes.get(e.targetId)!, state)!,
  );
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
    result = {
      id: `trunk:${key}`,
      path: style === "bundle" ? curve(points, state, context) : pathFromPoints(points),
    };
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
  const config = state.settings,
    perEdge = config.edges[edge.id] ?? {},
    diagnostics: RoutingDiagnostic[] = [];
  const report = (code: RoutingDiagnostic["code"], message: string) => {
    if (!diagnostics.some((d) => d.code === code))
      diagnostics.push({ code, message, edgeId: edge.id });
  };
  const sourceNode = state.nodes.get(edge.sourceId),
    targetNode = state.nodes.get(edge.targetId);
  const sourceRect = sourceNode && worldRect(sourceNode, state),
    targetRect = targetNode && worldRect(targetNode, state);
  if (!sourceRect || !targetRect)
    report("MISSING_GEOMETRY", "Missing endpoint geometry; rendered a fallback connection");
  const sourceBounds = sourceRect ?? { x: 0, y: 0, width: 0, height: 0 },
    targetBounds = targetRect ?? {
      x: sourceBounds.x + 40,
      y: sourceBounds.y + 40,
      width: 0,
      height: 0,
    };
  const loop = edge.sourceId === edge.targetId;
  const group = groupKey(edge, style, config),
    peers = group ? [...(state.groups.get(group)?.keys() ?? [])] : [];
  const grouped = peers.length > 1 && ["bus", "bundle", "fan"].includes(style);
  const lane = !grouped && peers.length > 1 ? peers.length - 1 - peers.indexOf(edge.id) : 0;
  function terminal(source: boolean): Terminal {
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
    const name = source ? edge.sourcePort : edge.targetPort;
    let side =
      (source ? perEdge.sourceSide : perEdge.targetSide) ??
      (loop ? (source ? "right" : "top") : sideToward(center(bounds), center(other)));
    let point = anchor(bounds, side);
    if (attachment) {
      const toward = labelRect(edge, state) ?? other;
      side =
        (source ? perEdge.sourceSide : perEdge.targetSide) ??
        sideToward(center(bounds), center(toward));
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
    if (!attachment && name === undefined && !["bus", "fan", "bundle"].includes(style) && !loop) {
      const nodeId = source ? edge.sourceId : edge.targetId;
      const adjacent = [...(state.incident.get(nodeId)?.keys() ?? [])].filter((id) => {
        const e = state.edges.get(id)!;
        if (e.sourceId === e.targetId) return false;
        const from = e.sourceId === nodeId;
        if ((from ? e.sourcePort : e.targetPort) !== undefined) return false;
        const otherNode = state.nodes.get(from ? e.targetId : e.sourceId);
        const rect = otherNode && worldRect(otherNode, state);
        if (!rect) return false;
        const explicit = from ? config.edges[id]?.sourceSide : config.edges[id]?.targetSide;
        return (explicit ?? sideToward(center(bounds), center(rect))) === side;
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
        const toward = center(labelRect(edge, state) ?? other);
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
    return {
      point,
      side:
        attachment?.facing === "inward"
          ? ({ left: "right", right: "left", top: "bottom", bottom: "top" } as const)[side]
          : side,
      ref: {
        kind: "node",
        nodeId: source ? edge.sourceId : edge.targetId,
        ...(name === undefined ? {} : { port: name }),
      },
    };
  }
  const source = terminal(true),
    target = terminal(false),
    label = labelRect(edge, state);
  const excluded = new Set(
    [...ancestors(edge.sourceId, state), ...ancestors(edge.targetId, state)]
      .filter((id) => id !== edge.sourceId && id !== edge.targetId)
      .map((id) => `n:${id}`),
  );
  if (perEdge.sourceAttachment !== undefined) excluded.add(`n:${edge.sourceId}`);
  if (perEdge.targetAttachment !== undefined) excluded.add(`n:${edge.targetId}`);
  const context = contextFor(
    state,
    excluded,
    new Set([`n:${edge.sourceId}`, `n:${edge.targetId}`, `e:${edge.id}`]),
    metrics,
    batch,
    lane * config.edgeSpacing,
  );
  const searchContext = ["curved", "organic", "bundle", "bezier"].includes(style)
    ? contextFor(
        state,
        excluded,
        new Set([`n:${edge.sourceId}`, `n:${edge.targetId}`, `e:${edge.id}`]),
        metrics,
        batch,
        config.radius * 2 + lane * config.edgeSpacing,
      )
    : context;
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
  const labelAnchor = (toward: RoutePoint) => {
    const side = sideToward(center(label!), toward),
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
        side: sideToward(center(label), source.point),
        ref: { kind: "label", edgeId: edge.id },
      }
    : target;
  const lastSource: Terminal | undefined = label
    ? {
        point:
          firstTarget.side === sideToward(center(label), target.point)
            ? anchor(
                label,
                ({ left: "right", right: "left", top: "bottom", bottom: "top" } as const)[
                  firstTarget.side
                ],
              )
            : labelAnchor(target.point),
        side:
          firstTarget.side === sideToward(center(label), target.point)
            ? ({ left: "right", right: "left", top: "bottom", bottom: "top" } as const)[
                firstTarget.side
              ]
            : sideToward(center(label), target.point),
        ref: { kind: "label", edgeId: edge.id },
      }
    : undefined;
  metrics.routedEdges++;
  const sections: RouteSection[] = [];
  const stub = (t: Terminal) => {
    if (t.ref.kind === "junction") return t.point;
    const v = vector(t.side),
      length =
        config.clearance +
        1 +
        (!grouped && peers.length > 1 ? peers.indexOf(edge.id) : 0) * config.edgeSpacing;
    return { x: t.point.x + v.x * length, y: t.point.y + v.y * length };
  };
  function connection(a: Terminal, b: Terminal, via: readonly RoutePoint[] = []): RoutePath {
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
          new Set([`n:${edge.sourceId}`, `n:${edge.targetId}`, `e:${edge.id}`]),
          metrics,
          batch,
          -config.clearance,
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
    if (style === "straight" && !via.length && !loop) path = pathFromPoints([a.point, b.point]);
    else if (style === "bezier" && !via.length && !loop) {
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
      const boundedStub = (t: Terminal) => {
        const p = stub(t),
          gap = distance(a.point, b.point) / 3;
        if (!alignedFacing || distance(t.point, p) <= gap) return p;
        const v = vector(t.side);
        return { x: t.point.x + v.x * gap, y: t.point.y + v.y * gap };
      };
      const start = boundedStub(a),
        end = boundedStub(b),
        waypoints = [...via];
      if (style === "parallel" && peers.length > 1) {
        // Find a feasible corridor before choosing lanes; an arbitrary midpoint
        // may be inside an obstacle even when good parallel routes exist.
        const base = findPath(start, end, "polyline", context);
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
        style === "polyline" || style === "organic" || style === "parallel"
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
        let found = findPath(anchors[i - 1]!, anchors[i]!, searchStyle, searchContext, directions);
        if (!found && searchContext !== context && !searchContext.budgetExceeded) {
          // Extra curve room is optional: tight channels may use safe line segments.
          const narrow = { ...searchContext, obstacles: context.obstacles };
          found = findPath(anchors[i - 1]!, anchors[i]!, searchStyle, narrow, directions);
          searchContext.visited = narrow.visited;
          searchContext.budgetExceeded = narrow.budgetExceeded;
        }
        if (found) points.push(...found.slice(i === 1 ? 0 : 1));
        else ok = false;
      }
      points.push(b.point);
      if (ok) {
        const simple = simplify(points);
        path =
          style === "curved" || style === "bundle" || style === "bezier"
            ? curve(simple, state, context)
            : style === "organic"
              ? organic(simple, state, context)
              : pathFromPoints(simple);
      }
    }
    if (
      preferred &&
      (!path || !safe(path, context) || pathCost(preferred, context) <= pathCost(path, context))
    )
      return preferred;
    if (path && safe(path, context)) return path;
    // Clearance and soft edge reservations must not turn a feasible connection
    // into an obstacle-crossing fallback. Retry against the hard geometry with
    // short terminal leads and a fresh, bounded search budget.
    if (!["straight", "bezier", "polyline", "organic", "parallel"].includes(style)) {
      const hard = {
        ...contextFor(
          state,
          excluded,
          new Set([`n:${edge.sourceId}`, `n:${edge.targetId}`, `e:${edge.id}`]),
          metrics,
          batch,
          -config.clearance,
        ),
        maxSearchNodes: Math.max(
          0,
          config.maxSearchNodes -
            searchContext.visited -
            (searchContext === context ? 0 : context.visited),
        ),
      };
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
        const found = findPath(
          anchors[i - 1]!,
          anchors[i]!,
          style === "octilinear" ? "octilinear" : "orthogonal",
          hard,
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
      if (ok && safe(retry, hard)) {
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
          const found = findPath(
            start,
            end,
            style === "octilinear" ? "octilinear" : "orthogonal",
            optimized,
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
  const via = perEdge.waypoints ?? [];
  if (via.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    throw new RangeError(`Non-finite waypoint on ${edge.id}`);
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
      { id: `${edge.id}:source`, from: source.ref, to: j0.ref, path: connection(source, j0, via) },
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
    });
  if (lastSource) {
    let segments = sections.flatMap((s) => pathReservations(s.path));
    // The two legs meet at a label and, for a self-loop, at their node. Sharing
    // those attachment regions is legitimate; retracing a distant trunk is not.
    const shared = [label!, ...(loop ? [sourceBounds] : [])];
    for (const rect of shared)
      segments = segments.flatMap((s) => outsideTerminal(s, inflate(rect, config.clearance + 1)));
    drawn.push(...segments);
    sections.push({
      id: `${edge.id}:label-target`,
      from: lastSource.ref,
      to: target.ref,
      path: connection(lastSource, target),
    });
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
  metrics.searchNodes += searchContext.visited + (searchContext === context ? 0 : context.visited);
  return {
    edgeId: edge.id,
    sections,
    status: diagnostics.length ? "fallback" : "routed",
    diagnostics,
  };
}
export function routeBounds(route: Route): RouteBounds {
  return route.sections.map((s) => getPathBounds(s.path)).reduce(union);
}
export { pointsBounds };
