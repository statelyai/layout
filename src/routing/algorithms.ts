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
import { pathReservations } from "./coordination";
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
    maxSearchNodes: state.settings.maxSearchNodes,
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
  return pathReservations(path).reduce(
    (sum, segment) =>
      sum + distance(segment.a, segment.b) + (context.edgeCost?.(segment.a, segment.b) ?? 0),
    0,
  );
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
      bounds = source ? sourceBounds : targetBounds,
      other = source ? targetBounds : sourceBounds;
    const name = source ? edge.sourcePort : edge.targetPort;
    let side =
      (source ? perEdge.sourceSide : perEdge.targetSide) ??
      (loop ? (source ? "right" : "top") : sideToward(center(bounds), center(other)));
    let point = anchor(bounds, side);
    if (name === undefined && !["bus", "fan", "bundle"].includes(style) && !loop) {
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
          x: bounds.x + port.x! + (port.width ?? 0) / 2,
          y: bounds.y + port.y! + (port.height ?? 0) / 2,
        };
        if (!(source ? perEdge.sourceSide : perEdge.targetSide))
          side = sideToward(center(bounds), point);
      } else
        report("MISSING_PORT", `Port ${name} has no positioned geometry; used the node boundary`);
    }
    return {
      point,
      side,
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
        point: labelAnchor(target.point),
        side: sideToward(center(label), target.point),
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
      report("CONSTRAINT_VIOLATION", "Coincident terminals; rendered a visible loop fallback");
      const gap = config.clearance + config.edgeSpacing + 10;
      return pathFromPoints([
        a.point,
        { x: a.point.x + gap, y: a.point.y },
        { x: a.point.x + gap, y: a.point.y - gap },
        { x: a.point.x, y: a.point.y - gap },
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
      const start = stub(a),
        end = stub(b),
        waypoints = [...via];
      if (loop && !waypoints.length) {
        const r = inflate(sourceBounds, config.clearance + config.edgeSpacing + 1);
        waypoints.push({ x: r.x + r.width, y: r.y });
      }
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
  if (lastSource)
    sections.push({
      id: `${edge.id}:label-target`,
      from: lastSource.ref,
      to: target.ref,
      path: connection(lastSource, target),
    });
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
