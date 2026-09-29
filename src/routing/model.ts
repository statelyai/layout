import type { GraphEdge } from "@statelyai/graph";
import { PersistentMap } from "./persistent";
import { SpatialIndex } from "./spatial";
import type { Route, RouteBounds, RoutePoint, RoutingSettings, RouteSide } from "./types";
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
  readonly coordinateSpace: "parent" | "world";
  readonly clearance: number;
  readonly radius: number;
  readonly edgeSpacing: number;
  readonly bendPenalty: number;
  readonly maxSearchNodes: number;
  readonly organicIterations: number;
  readonly preserveRoutes: boolean;
  readonly edges: NonNullable<RoutingSettings["edges"]>;
}
export function settings(input: RoutingSettings = {}): Settings {
  const result = {
    coordinateSpace: input.coordinateSpace ?? "parent",
    clearance: input.clearance ?? 8,
    radius: input.radius ?? 10,
    edgeSpacing: input.edgeSpacing ?? 12,
    bendPenalty: input.bendPenalty ?? 10,
    maxSearchNodes: input.maxSearchNodes ?? 4000,
    organicIterations: input.organicIterations ?? 12,
    preserveRoutes: input.preserveRoutes ?? false,
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
export function groupKey(edge: EdgeGeometry, style: string, config: Settings): string | undefined {
  const group = config.edges[edge.id]?.group;
  if (style === "bus" || style === "bundle" || style === "fan")
    return group !== undefined
      ? `group:${group}`
      : `source:${edge.sourceId}:${edge.sourcePort ?? ""}`;
  if (style === "parallel") return `pair:${JSON.stringify([edge.sourceId, edge.targetId].sort())}`;
  return undefined;
}
