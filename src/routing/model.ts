import { resolveCornerRadius } from "./corner-radius";
import type { GraphEdge } from "@statelyai/graph";
import { PersistentMap } from "./persistent";
import { SpatialIndex } from "./spatial";
import type { RouteReservationIndex } from "./coordination";
import type {
  Route,
  RouteBounds,
  RoutePoint,
  RoutingSettings,
  RouteSide,
  RoutingPolicy,
  RoutingTangent,
  RouteGeometry,
  RouteStyle,
  RoutingCoordination,
  RouteEndpointConstraint,
} from "./types";
export interface NodeGeometry {
  readonly id: string;
  readonly parentId?: string | null;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly ports?: readonly {
    readonly name: string;
    readonly x?: number;
    readonly y?: number;
    readonly width?: number;
    readonly height?: number;
  }[];
}
export interface EdgeGeometry {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly sourcePort?: string;
  readonly targetPort?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}
export interface Settings {
  readonly policy?: RoutingPolicy;
  readonly coordination: RoutingSettings["coordination"];
  readonly selfLoops: RoutingSettings["selfLoops"];
  readonly bezier: RoutingSettings["bezier"];
  readonly coordinateSpace: "parent" | "world";
  readonly clearance: number;
  readonly radius: number;
  readonly edgeSpacing: number;
  readonly bendPenalty: number;
  readonly crossingPenalty: number;
  readonly overlapPenalty: number;
  readonly maxSearchNodes: number;
  readonly organicIterations: number;
  readonly edges: NonNullable<RoutingSettings["edges"]>;
}
export function settings(input: RoutingSettings = {}): Settings {
  const result = {
    policy: normalizePolicy(input.policy),
    coordination: structuredClone(input.coordination),
    selfLoops: structuredClone(input.selfLoops),
    bezier: structuredClone(input.bezier),
    coordinateSpace: input.coordinateSpace ?? "parent",
    clearance: input.clearance ?? 8,
    radius: input.radius ?? 10,
    edgeSpacing: input.edgeSpacing ?? 12,
    bendPenalty: input.bendPenalty ?? 10,
    crossingPenalty: input.crossingPenalty ?? 80,
    overlapPenalty: input.overlapPenalty ?? 8,
    maxSearchNodes: input.maxSearchNodes ?? 4000,
    organicIterations: input.organicIterations ?? 12,
    edges: structuredClone(input.edges ?? {}),
  };
  for (const [key, value] of Object.entries(result))
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0))
      throw new RangeError(`${key} must be finite and non-negative`);
  if (
    !Number.isInteger(result.maxSearchNodes) ||
    result.maxSearchNodes < 1 ||
    !Number.isInteger(result.organicIterations)
  )
    throw new RangeError("Search and iteration budgets must be integers");
  if (
    result.coordination &&
    !["independent", "parallel", "fan", "bus", "bundle"].includes(result.coordination.kind)
  )
    throw new RangeError("Invalid edge coordination kind");
  if (
    result.selfLoops?.clearance !== undefined &&
    (!Number.isFinite(result.selfLoops.clearance) || result.selfLoops.clearance < 0)
  )
    throw new RangeError("Self-loop clearance must be finite and non-negative");
  for (const side of [result.selfLoops?.sourceSide, result.selfLoops?.targetSide])
    if (side !== undefined && !["left", "right", "top", "bottom"].includes(side))
      throw new RangeError("Invalid self-loop attachment side");
  for (const config of [result.bezier, ...Object.values(result.edges).map((edge) => edge.bezier)]) {
    if (
      config?.targetClearance !== undefined &&
      (!Number.isFinite(config.targetClearance) || config.targetClearance < 0)
    )
      throw new RangeError("Bézier targetClearance must be finite and non-negative");
  }
  for (const edge of Object.values(result.edges)) {
    if ("geometry" in edge) throw new RangeError("Use edge policy.path for routing geometry");
    if (edge.topology && !["connection", "label-only"].includes(edge.topology.kind))
      throw new RangeError("Invalid edge topology kind");
    for (const gap of [edge.sourceClearance, edge.targetClearance])
      if (gap !== undefined && (!Number.isFinite(gap) || gap < 0))
        throw new RangeError("Endpoint clearance must be finite and non-negative");
    const endpoint = (value: RouteEndpointConstraint | undefined) => {
      if (!value) return;
      if (value.kind === "floating") {
        if (
          !rect(value.bounds) ||
          value.sides.some((side) => !["left", "right", "top", "bottom"].includes(side))
        )
          throw new RangeError("Invalid floating endpoint geometry");
      } else if (value.kind === "port") {
        if (
          !rect(value.owner) ||
          !["left", "right", "top", "bottom"].includes(value.direction) ||
          ![value.point.x, value.point.y, value.escape.x, value.escape.y].every(Number.isFinite)
        )
          throw new RangeError("Invalid fixed endpoint geometry");
        const direction = vector(value.direction);
        const dx = value.escape.x - value.point.x,
          dy = value.escape.y - value.point.y;
        if (
          dx * direction.x + dy * direction.y < -1e-7 ||
          Math.abs(dx * direction.y - dy * direction.x) > 1e-7
        )
          throw new RangeError("Port escape must follow its outward direction");
      } else throw new RangeError("Invalid endpoint kind");
    };
    endpoint(edge.source);
    endpoint(edge.target);
    for (const bounds of [...(edge.obstacles ?? []), ...(edge.terminalBounds ?? [])])
      if (!rect(bounds)) throw new RangeError("Invalid routing obstacle geometry");
    for (const guide of [edge.guides?.source, edge.guides?.target])
      if (
        guide &&
        (!guide.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) ||
          ![guide.sourceDirection, guide.targetDirection].every((side) =>
            ["left", "right", "top", "bottom"].includes(side),
          ))
      )
        throw new RangeError("Invalid routing guide geometry");
    if (edge.policy) Object.assign(edge, { policy: normalizePolicy(edge.policy) });
    for (const point of edge.waypoints ?? [])
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
        throw new RangeError("Waypoints must be finite");
    const tangent = edge.bezier?.labelTangent;
    if (
      tangent &&
      (!Number.isFinite(tangent.x) ||
        !Number.isFinite(tangent.y) ||
        !Math.hypot(tangent.x, tangent.y))
    )
      throw new RangeError("Bézier labelTangent must be finite and nonzero");
  }
  return freeze(result);
}
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export function nodeGeometry(n: NodeGeometry): NodeGeometry {
  return freeze({
    id: n.id,
    parentId: n.parentId,
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
    ports: n.ports?.map((p) => ({
      name: p.name,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
    })),
  });
}
export function edgeGeometry(e: Partial<GraphEdge<unknown>> & { id: string }): EdgeGeometry {
  return freeze({
    id: e.id,
    sourceId: e.sourceId ?? "",
    targetId: e.targetId ?? "",
    sourcePort: e.sourcePort,
    targetPort: e.targetPort,
    x: e.x,
    y: e.y,
    width: e.width,
    height: e.height,
  });
}
export function rect(value: {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}): RouteBounds | undefined {
  const { x, y, width, height } = value;
  return [x, y, width, height].every((n) => typeof n === "number" && Number.isFinite(n)) &&
    width! >= 0 &&
    height! >= 0
    ? { x: x!, y: y!, width: width!, height: height! }
    : undefined;
}
export interface State {
  readonly graphId: string;
  readonly direction: string | undefined;
  readonly settings: Settings;
  readonly nodes: PersistentMap<NodeGeometry>;
  readonly edges: PersistentMap<EdgeGeometry>;
  readonly children: PersistentMap<PersistentMap<true>>;
  readonly incident: PersistentMap<PersistentMap<true>>;
  readonly groups: PersistentMap<PersistentMap<true>>;
  readonly obstacles: SpatialIndex;
  readonly routeIndex: SpatialIndex;
  readonly drawnIndex: SpatialIndex;
  readonly reservationIndex: RouteReservationIndex;
  readonly routes: PersistentMap<Route>;
}
export function members(
  index: PersistentMap<PersistentMap<true>>,
  key: string,
  id: string,
  add: boolean,
): PersistentMap<PersistentMap<true>> {
  const current = index.get(key) ?? new PersistentMap<true>(),
    next = add ? current.set(id, true) : current.delete(id);
  return next.size ? index.set(key, next) : index.delete(key);
}
export function ancestors(id: string, state: Pick<State, "nodes">): string[] {
  const result: string[] = [],
    seen = new Set([id]);
  let parent = state.nodes.get(id)?.parentId;
  while (parent != null) {
    if (seen.has(parent)) throw new Error(`Cyclic routing hierarchy at ${parent}`);
    result.push(parent);
    seen.add(parent);
    parent = state.nodes.get(parent)?.parentId;
  }
  return result;
}
export function worldRect(
  node: NodeGeometry,
  state: Pick<State, "nodes" | "settings">,
): RouteBounds | undefined {
  const bounds = rect(node);
  if (!bounds) return;
  if (state.settings.coordinateSpace === "world") return bounds;
  let x = bounds.x,
    y = bounds.y;
  for (const id of ancestors(node.id, state)) {
    const parent = state.nodes.get(id),
      p = parent && rect(parent);
    if (!p) return;
    x += p.x;
    y += p.y;
  }
  return { ...bounds, x, y };
}
export function labelRect(
  edge: EdgeGeometry,
  state: Pick<State, "nodes" | "settings">,
): RouteBounds | undefined {
  const bounds = rect(edge);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
  const source = state.nodes.get(edge.sourceId),
    target = state.nodes.get(edge.targetId);
  if (
    state.settings.coordinateSpace === "world" ||
    !source ||
    source.parentId == null ||
    source.parentId !== target?.parentId
  )
    return bounds;
  const parent = state.nodes.get(source.parentId),
    p = parent && worldRect(parent, state);
  return p ? { ...bounds, x: bounds.x + p.x, y: bounds.y + p.y } : undefined;
}
export const center = (r: RouteBounds): RoutePoint => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});
export function sideToward(a: RoutePoint, b: RoutePoint): RouteSide {
  return Math.abs(a.x - b.x) >= Math.abs(a.y - b.y)
    ? b.x >= a.x
      ? "right"
      : "left"
    : b.y >= a.y
      ? "bottom"
      : "top";
}
export const vector = (side: RouteSide): RoutePoint => ({
  x: side === "right" ? 1 : side === "left" ? -1 : 0,
  y: side === "bottom" ? 1 : side === "top" ? -1 : 0,
});
export function anchor(bounds: RouteBounds, side: RouteSide): RoutePoint {
  const c = center(bounds),
    v = vector(side);
  return { x: c.x + (v.x * bounds.width) / 2, y: c.y + (v.y * bounds.height) / 2 };
}
export function geometryFor(style: RouteStyle): RouteGeometry {
  if (style === "straight" || style === "polyline" || style === "octilinear") return style;
  return style === "organic" || style === "parallel" ? "polyline" : "orthogonal";
}
export function coordinationFor(style: string, config: Settings): RoutingCoordination["kind"] {
  return (
    config.coordination?.kind ??
    (style === "bus" || style === "bundle" || style === "fan" || style === "parallel"
      ? style
      : "independent")
  );
}
export function sharedCoordination(style: string, config: Settings): boolean {
  const kind = coordinationFor(style, config);
  return kind === "bus" || kind === "bundle" || kind === "fan";
}
export function groupKey(edge: EdgeGeometry, style: string, config: Settings): string | undefined {
  const group = config.edges[edge.id]?.group;
  if (sharedCoordination(style, config))
    return group !== undefined
      ? `group:${group}`
      : `source:${JSON.stringify([edge.sourceId, edge.sourcePort ?? null])}`;
  if (config.coordination?.kind === "independent") return;
  return `pair:${JSON.stringify([edge.sourceId, edge.targetId].sort())}`;
}

function normalizePolicy(input: RoutingPolicy | undefined): RoutingPolicy | undefined {
  if (!input) return;
  if ("curve" in input) throw new RangeError("Use policy.path instead of policy.curve");
  const value = structuredClone(input);
  const oneOf = (value: unknown, allowed: readonly string[], name: string) => {
    if (typeof value !== "string" || !allowed.includes(value))
      throw new RangeError(`Invalid ${name}`);
  };
  if (value.path)
    oneOf(
      value.path.kind,
      ["polyline", "bezier", "catmull-rom", "rounded-orthogonal"],
      "path kind",
    );
  if (value.path?.kind === "polyline" && value.path.geometry !== undefined)
    oneOf(
      value.path.geometry,
      ["straight", "orthogonal", "polyline", "octilinear"],
      "path geometry",
    );
  if (value.path && value.path.kind !== "polyline" && value.path.geometry !== undefined)
    throw new RangeError("Geometry is only configurable for polyline paths");
  if (value.path) {
    const allowed =
      value.path.kind === "polyline"
        ? ["kind", "geometry"]
        : value.path.kind === "bezier"
          ? ["kind", "curvature"]
          : value.path.kind === "rounded-orthogonal"
            ? ["kind", "radius", "minRadius", "maxRadius"]
            : ["kind"];
    for (const [key, option] of Object.entries(value.path))
      if (option !== undefined && !allowed.includes(key))
        throw new RangeError(`Unsupported ${key} for ${value.path.kind} paths`);
  }
  if (value.label) oneOf(value.label.kind, ["follow", "fixed", "through", "gap"], "label kind");
  if (value.label?.kind === "gap" && value.label.attachment !== undefined)
    oneOf(value.label.attachment, ["border", "side-midpoint"], "label attachment");
  if (value.monotonic) {
    oneOf(value.monotonic.axis, ["x", "y", "both"], "monotonic axis");
    oneOf(value.monotonic.strength, ["prefer", "require"], "monotonic strength");
  }
  if (value.stability)
    oneOf(value.stability.kind, ["recompute", "preserve-valid"], "stability kind");
  for (const name of ["nodes", "labels"] as const)
    if (value.collisions?.[name] !== undefined)
      oneOf(value.collisions[name], ["avoid", "allow"], `${name} collision mode`);

  const nonnegative = (n: number | undefined, name: string) => {
    if (n !== undefined && (!Number.isFinite(n) || n < 0))
      throw new RangeError(`${name} must be finite and non-negative`);
  };
  function tangent(t: RoutingTangent | undefined): RoutingTangent | undefined {
    if (t) oneOf(t.kind, ["automatic", "border-normal", "vector"], "tangent kind");
    if (t?.kind !== "vector") return t;
    const { x, y } = t.direction,
      length = Math.hypot(x, y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(length) || !length)
      throw new RangeError("Tangent direction must be finite and nonzero");
    return { kind: "vector", direction: { x: x / length, y: y / length } };
  }
  if (value.path?.kind === "bezier") nonnegative(value.path.curvature, "curvature");
  if (value.path?.kind === "rounded-orthogonal") resolveCornerRadius(value.path);
  nonnegative(value.collisions?.crossingPenalty, "crossingPenalty");
  nonnegative(value.collisions?.overlapPenalty, "overlapPenalty");
  if (value.label?.kind === "follow") {
    const { fraction = 0.5, offset = 0 } = value.label;
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
      throw new RangeError("Label fraction must be in [0, 1]");
    if (!Number.isFinite(offset)) throw new RangeError("Label offset must be finite");
  }
  return freeze({
    ...value,
    ...(value.sourceTangent ? { sourceTangent: tangent(value.sourceTangent) } : {}),
    ...(value.targetTangent ? { targetTangent: tangent(value.targetTangent) } : {}),
    ...(value.label?.kind === "through" || value.label?.kind === "gap"
      ? {
          label: {
            ...value.label,
            ...(value.label.tangent ? { tangent: tangent(value.label.tangent) } : {}),
          },
        }
      : {}),
  });
}
export function effectivePolicy(config: Settings, edgeId: string): RoutingPolicy | undefined {
  const edge = config.edges[edgeId],
    local = edge?.policy,
    global = config.policy;
  if (!local && !global) {
    if (
      edge?.source ||
      edge?.target ||
      edge?.obstacles ||
      edge?.terminalBounds ||
      edge?.guides ||
      edge?.disabled !== undefined ||
      edge?.topology ||
      edge?.sourceClearance !== undefined ||
      edge?.targetClearance !== undefined
    )
      return {};
    return;
  }
  const legacyAttachment = edge?.bezier?.attachmentMode;
  const legacyTangent: RoutingTangent | undefined =
    legacyAttachment === "orthogonal"
      ? { kind: "border-normal" }
      : legacyAttachment === "floating"
        ? { kind: "automatic" }
        : undefined;
  let label = local?.label ?? global?.label;
  const legacyLabel = edge?.bezier?.labelTangent;
  if (!local?.label && legacyLabel && (label?.kind === "through" || label?.kind === "gap")) {
    const length = Math.hypot(legacyLabel.x, legacyLabel.y);
    label = {
      ...label,
      tangent: {
        kind: "vector",
        direction: { x: legacyLabel.x / length, y: legacyLabel.y / length },
      },
    };
  }
  return {
    path: local?.path ?? global?.path,
    sourceTangent: local?.sourceTangent ?? legacyTangent ?? global?.sourceTangent,
    targetTangent: local?.targetTangent ?? legacyTangent ?? global?.targetTangent,
    label,
    collisions: {
      nodes: local?.collisions?.nodes ?? global?.collisions?.nodes ?? "avoid",
      labels: local?.collisions?.labels ?? global?.collisions?.labels ?? "avoid",
      crossingPenalty:
        local?.collisions?.crossingPenalty ??
        global?.collisions?.crossingPenalty ??
        config.crossingPenalty,
      overlapPenalty:
        local?.collisions?.overlapPenalty ??
        global?.collisions?.overlapPenalty ??
        config.overlapPenalty,
    },
    monotonic: local?.monotonic ?? global?.monotonic,
    stability: local?.stability ?? global?.stability,
  };
}
export function obstacleLabelRect(
  edge: EdgeGeometry,
  state: Pick<State, "nodes" | "settings">,
): RouteBounds | undefined {
  return effectivePolicy(state.settings, edge.id)?.label?.kind === "follow"
    ? undefined
    : labelRect(edge, state);
}
const presetCollisions = {
  nodes: "avoid",
  labels: "avoid",
  crossingPenalty: 80,
  overlapPenalty: 8,
} as const;
export const routingPolicies: Readonly<{
  smooth: RoutingPolicy;
  diagram: RoutingPolicy;
  authored: RoutingPolicy;
}> = freeze({
  smooth: {
    path: { kind: "bezier", curvature: 0.5 },
    sourceTangent: { kind: "automatic" },
    targetTangent: { kind: "automatic" },
    label: { kind: "follow", fraction: 0.5 },
    collisions: presetCollisions,
    stability: { kind: "recompute" },
  },
  diagram: {
    path: { kind: "rounded-orthogonal", radius: 10 },
    sourceTangent: { kind: "border-normal" },
    targetTangent: { kind: "border-normal" },
    label: { kind: "follow", fraction: 0.5 },
    collisions: presetCollisions,
    stability: { kind: "recompute" },
  },
  authored: {
    path: { kind: "catmull-rom" },
    sourceTangent: { kind: "automatic" },
    targetTangent: { kind: "automatic" },
    label: { kind: "follow", fraction: 0.5 },
    collisions: presetCollisions,
    stability: { kind: "recompute" },
  },
});
