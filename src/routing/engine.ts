import type { GraphDiff } from "@statelyai/graph";
import { conflictCost, reservations, reservationBounds, outsideTerminal } from "./coordination";
import { segmentBounds } from "./search";
import { routeBounds, routeEdge, type Metrics, type Batch } from "./algorithms";
import {
  edgeGeometry,
  freeze,
  groupKey,
  labelRect,
  members,
  nodeGeometry,
  settings,
  worldRect,
  type EdgeGeometry,
  type NodeGeometry,
  type State,
} from "./model";
import { PersistentMap } from "./persistent";
import { inflate, intersects, SpatialIndex, union } from "./spatial";
import type {
  NativeRoutingStrategy,
  Route,
  RoutePatch,
  RouteStyle,
  RoutingGraph,
  RoutingSettings,
  RoutingSnapshot,
  RoutingUpdate,
} from "./types";

const STATE = Symbol("routingState");
type Snapshot = RoutingSnapshot & { readonly [STATE]: State };
const metrics = (): Metrics => ({
  routedEdges: 0,
  reusedEdges: 0,
  affectedEdges: 0,
  searchNodes: 0,
  obstacleCandidates: 0,
});
function snapshot(state: State, style: RouteStyle, revision: number, counts: Metrics): Snapshot {
  return Object.freeze({
    strategy: style,
    revision,
    routes: state.routes,
    metrics: Object.freeze(counts),
    [STATE]: Object.freeze(state),
  });
}
function edgeMembership(state: State, edge: EdgeGeometry, style: RouteStyle, add: boolean): State {
  let incident = state.incident,
    groups = state.groups;
  for (const id of new Set([edge.sourceId, edge.targetId]))
    incident = members(incident, id, edge.id, add);
  const key = groupKey(edge, style, state.settings);
  if (key !== undefined) groups = members(groups, key, edge.id, add);
  return { ...state, incident, groups };
}
function initialState(graph: RoutingGraph, config: RoutingSettings, style: RouteStyle): State {
  let nodes = new PersistentMap<NodeGeometry>(),
    edges = new PersistentMap<EdgeGeometry>(),
    children = new PersistentMap<PersistentMap<true>>();
  for (const n of graph.nodes) {
    if (nodes.has(n.id)) throw new Error(`Duplicate routing node ${n.id}`);
    nodes = nodes.set(n.id, nodeGeometry(n));
    if (n.parentId != null) children = members(children, n.parentId, n.id, true);
  }
  for (const e of graph.edges) {
    if (edges.has(e.id)) throw new Error(`Duplicate routing edge ${e.id}`);
    edges = edges.set(e.id, edgeGeometry(e));
  }
  let state: State = {
    graphId: graph.id,
    direction: graph.direction,
    settings: settings(config),
    nodes,
    edges,
    children,
    incident: new PersistentMap(),
    groups: new PersistentMap(),
    obstacles: new SpatialIndex(),
    routeIndex: new SpatialIndex(),
    routes: new PersistentMap(),
  };
  for (const [id, n] of nodes)
    state = { ...state, obstacles: state.obstacles.set(`n:${id}`, worldRect(n, state)) };
  for (const [id, e] of edges) {
    state = edgeMembership(state, e, style, true);
    state = { ...state, obstacles: state.obstacles.set(`e:${id}`, labelRect(e, state)) };
  }
  return state;
}
function calculate(
  state: State,
  style: RouteStyle,
  affected: ReadonlySet<string>,
  counts: Metrics,
  previous?: State,
): { state: State; patches: RoutePatch[] } {
  let routes = state.routes,
    routeIndex = state.routeIndex;
  const input = {
    nodes: state.nodes,
    incident: state.incident,
    edges: state.edges,
    groups: state.groups,
    obstacles: state.obstacles,
    settings: state.settings,
  };
  const patches: RoutePatch[] = [],
    batch: Batch = {
      plans: new Map(),
    };
  const pending = new Set(affected);
  const processed = new Set<string>();
  const priorities = new Map<string, string>();
  const priority = (id: string) => {
    let result = priorities.get(id);
    if (result !== undefined) return result;
    const edge = state.edges.get(id) ?? previous?.edges.get(id);
    const key = edge && groupKey(edge, style, state.settings);
    result = key
      ? ((state.edges.has(id) ? state.groups : previous?.groups)?.get(key)?.keys().next().value ??
        id)
      : id;
    priorities.set(id, result);
    return result;
  };
  const later = (candidate: string, id: string) =>
    priority(candidate) > priority(id) || (priority(candidate) === priority(id) && candidate > id);
  const invalidate = (id: string, bounds: ReturnType<typeof routeBounds>) => {
    for (const candidate of routeIndex.query(inflate(bounds, state.settings.edgeSpacing))) {
      if (!later(candidate, id) || processed.has(candidate)) continue;
      pending.add(candidate);
      const edge = state.edges.get(candidate);
      const key = edge && groupKey(edge, style, state.settings);
      if (key)
        for (const peer of state.groups.get(key)?.keys() ?? [])
          if (!processed.has(peer)) pending.add(peer);
    }
  };
  // Changing a group's first ID changes its priority relative to nearby groups.
  // Seed these dependencies before processing, including readers now ordered earlier.
  if (previous)
    for (const id of affected) {
      const edge = previous.edges.get(id);
      if (!edge) continue;
      const key = groupKey(edge, style, previous.settings);
      const oldPriority = key ? (previous.groups.get(key)?.keys().next().value ?? id) : id;
      if (oldPriority === priority(id)) continue;
      const oldRoute = previous.routes.get(id);
      if (oldRoute)
        for (const candidate of previous.routeIndex.query(
          inflate(routeBounds(oldRoute), state.settings.edgeSpacing),
        )) {
          pending.add(candidate);
          const current = state.edges.get(candidate);
          const group = current && groupKey(current, style, state.settings);
          if (group) for (const peer of state.groups.get(group)?.keys() ?? []) pending.add(peer);
        }
    }
  const segmentCache = new Map<string, ReturnType<typeof reservations>>();
  while (pending.size) {
    const id = [...pending].sort(
      (a, b) =>
        (priority(a) < priority(b) ? -1 : priority(a) > priority(b) ? 1 : 0) ||
        (a < b ? -1 : a > b ? 1 : 0),
    )[0]!;
    pending.delete(id);
    processed.add(id);
    const edge = state.edges.get(id),
      oldRoute = previous?.routes.get(id);
    if (!edge) {
      if (routes.has(id)) {
        invalidate(id, routeBounds(routes.get(id)!));
        routes = routes.delete(id);
        routeIndex = routeIndex.set(id);
        patches.push({ op: "delete", edgeId: id });
      }
      continue;
    }
    batch.dependencyBounds = undefined;
    const query = (bounds: ReturnType<typeof routeBounds>) => {
      const area = inflate(bounds, state.settings.edgeSpacing);
      batch.dependencyBounds = batch.dependencyBounds ? union(batch.dependencyBounds, area) : area;
      const result: ReturnType<typeof reservations> = [];
      const shared = new Set<string>();
      for (const otherId of routeIndex.query(area)) {
        if (!later(id, otherId)) continue;
        const other = state.edges.get(otherId),
          route = routes.get(otherId);
        if (!other || !route) continue;
        if (
          ["bus", "fan", "bundle"].includes(style) &&
          groupKey(other, style, state.settings) === groupKey(edge, style, state.settings)
        )
          continue;
        const terminalRegions = [edge.sourceId, edge.targetId]
          .filter((node) => node === other.sourceId || node === other.targetId)
          .flatMap((id) => {
            const node = state.nodes.get(id),
              bounds = node && worldRect(node, state);
            return bounds
              ? [inflate(bounds, state.settings.clearance + state.settings.edgeSpacing * 2 + 1)]
              : [];
          });
        let segments = segmentCache.get(otherId);
        if (!segments) {
          segments = reservations(route);
          segmentCache.set(otherId, segments);
        }
        const outside = terminalRegions.reduce(
          (segments, rect) => segments.flatMap((segment) => outsideTerminal(segment, rect)),
          segments,
        );
        for (const segment of outside) {
          if (!intersects(segmentBounds(segment.a, segment.b), area)) continue;
          if (segment.sharedId !== undefined) {
            const key = JSON.stringify([segment.sharedId, segment.a, segment.b]);
            if (shared.has(key)) continue;
            shared.add(key);
          }
          result.push(segment);
        }
      }
      return result;
    };
    batch.edgeCost = (a, b) =>
      query(segmentBounds(a, b)).reduce(
        (cost, other) => cost + conflictCost(a, b, other, state.settings),
        0,
      );
    batch.conflicts = (a, b) =>
      query(segmentBounds(a, b)).some(
        (other) =>
          conflictCost(a, b, other, { ...state.settings, crossingPenalty: 1, overlapPenalty: 1 }) >
          1e-8,
      );
    batch.guides = (bounds) =>
      query(bounds).map((segment) => reservationBounds(segment, state.settings.edgeSpacing));
    let route = routeEdge(edge, input, style, counts, batch);
    if (oldRoute && JSON.stringify(oldRoute) === JSON.stringify(route)) route = oldRoute;
    const drawnBounds = routeBounds(route);
    if (route !== oldRoute) {
      if (oldRoute) invalidate(id, routeBounds(oldRoute));
      invalidate(id, drawnBounds);
    }
    routeIndex = routeIndex.set(
      id,
      batch.dependencyBounds ? union(batch.dependencyBounds, drawnBounds) : drawnBounds,
    );
    if (route === oldRoute) continue;
    route = freeze(route);
    routes = routes.set(id, route);
    segmentCache.delete(id);
    patches.push({ op: "set", edgeId: id, route });
  }
  counts.affectedEdges = processed.size;
  counts.reusedEdges = Math.max(
    0,
    state.routes.size - [...processed].filter((id) => state.routes.has(id)).length,
  );
  patches.sort((a, b) => (a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0));
  return { state: { ...state, routes, routeIndex }, patches };
}
function descendants(state: State, ids: Set<string>) {
  const queue = [...ids];
  for (let i = 0; i < queue.length; i++)
    for (const child of state.children.get(queue[i]!)?.keys() ?? [])
      if (!ids.has(child)) {
        ids.add(child);
        queue.push(child);
      }
}
function verifyOld(record: NodeGeometry | EdgeGeometry | undefined, old: object, id: string) {
  if (!record) throw new Error(`Routing diff updates missing entity ${id}`);
  for (const [key, value] of Object.entries(old))
    if (
      key in record &&
      JSON.stringify(record[key as keyof typeof record]) !==
        JSON.stringify(
          key === "ports"
            ? nodeGeometry({ id, ports: value as NodeGeometry["ports"] }).ports
            : value,
        )
    )
      throw new Error(`Stale routing diff for ${id}.${key}`);
}
function updateState(
  graph: RoutingGraph,
  prior: State,
  diff: GraphDiff<unknown, unknown>,
  style: RouteStyle,
  config?: RoutingSettings,
): { state: State; affected: Set<string> } {
  if (graph.id !== prior.graphId)
    throw new Error("A routing snapshot belongs to a different graph");
  const candidateSettings = config === undefined ? prior.settings : settings(config);
  const nextSettings =
    JSON.stringify(candidateSettings) === JSON.stringify(prior.settings)
      ? prior.settings
      : candidateSettings;
  const settingsChanged =
    JSON.stringify(nextSettings) !== JSON.stringify(prior.settings) ||
    prior.direction !== graph.direction;
  let state: State = { ...prior, settings: nextSettings, direction: graph.direction };
  const changedNodes = new Set<string>(),
    changedEdges = new Set<string>(),
    affected = new Set<string>();
  for (const n of diff.nodes.removed) {
    if (!state.nodes.has(n.id)) throw new Error(`Routing diff removes missing node ${n.id}`);
    const old = state.nodes.get(n.id)!;
    if (old.parentId != null)
      state = { ...state, children: members(state.children, old.parentId, n.id, false) };
    state = { ...state, nodes: state.nodes.delete(n.id) };
    changedNodes.add(n.id);
  }
  for (const n of diff.nodes.added) {
    if (state.nodes.has(n.id)) throw new Error(`Routing diff adds existing node ${n.id}`);
    state = { ...state, nodes: state.nodes.set(n.id, nodeGeometry(n)) };
    if (n.parentId != null)
      state = { ...state, children: members(state.children, n.parentId, n.id, true) };
    changedNodes.add(n.id);
  }
  for (const change of diff.nodes.updated) {
    const old = state.nodes.get(change.id);
    verifyOld(old, change.old, change.id);
    const next = nodeGeometry({ ...old, ...change.new, id: change.id } as Parameters<
      typeof nodeGeometry
    >[0]);
    if (JSON.stringify(old) === JSON.stringify(next)) continue;
    if (old!.parentId != null)
      state = { ...state, children: members(state.children, old!.parentId!, change.id, false) };
    if (next.parentId != null)
      state = { ...state, children: members(state.children, next.parentId, change.id, true) };
    state = { ...state, nodes: state.nodes.set(change.id, next) };
    changedNodes.add(change.id);
  }
  for (const e of diff.edges.removed) {
    const old = state.edges.get(e.id);
    if (!old) throw new Error(`Routing diff removes missing edge ${e.id}`);
    state = edgeMembership(state, old, style, false);
    state = { ...state, edges: state.edges.delete(e.id) };
    changedEdges.add(e.id);
  }
  for (const e of diff.edges.added) {
    if (state.edges.has(e.id)) throw new Error(`Routing diff adds existing edge ${e.id}`);
    const next = edgeGeometry(e);
    state = { ...state, edges: state.edges.set(e.id, next) };
    state = edgeMembership(state, next, style, true);
    changedEdges.add(e.id);
  }
  for (const change of diff.edges.updated) {
    const old = state.edges.get(change.id);
    verifyOld(old, change.old, change.id);
    const next = edgeGeometry({ ...old, ...change.new, id: change.id });
    if (JSON.stringify(old) === JSON.stringify(next)) continue;
    state = edgeMembership(state, old!, style, false);
    state = { ...state, edges: state.edges.set(change.id, next) };
    state = edgeMembership(state, next, style, true);
    changedEdges.add(change.id);
  }
  if (settingsChanged) {
    // Configuration changes can alter every dependency and clearance envelope.
    state = { ...state, groups: new PersistentMap() };
    for (const [id, e] of state.edges) {
      const key = groupKey(e, style, nextSettings);
      if (key !== undefined) state = { ...state, groups: members(state.groups, key, id, true) };
      changedEdges.add(id);
    }
    for (const id of state.nodes.keys()) changedNodes.add(id);
    for (const id of prior.routes.keys()) affected.add(id);
  }
  descendants(prior, changedNodes);
  descendants(state, changedNodes);
  function invalidateObstacle(id: string, bounds: ReturnType<typeof worldRect>) {
    const old = prior.obstacles.bounds.get(id);
    for (const rect of [old, bounds])
      if (rect)
        for (const edgeId of prior.routeIndex.query(
          inflate(rect, Math.max(prior.settings.clearance, nextSettings.clearance)),
        ))
          affected.add(edgeId);
    state = { ...state, obstacles: state.obstacles.set(id, bounds) };
  }
  for (const id of changedNodes) {
    const node = state.nodes.get(id);
    invalidateObstacle(`n:${id}`, node && worldRect(node, state));
    for (const index of [prior.incident, state.incident])
      for (const edgeId of index.get(id)?.keys() ?? []) changedEdges.add(edgeId);
  }
  for (const id of changedEdges) {
    const edge = state.edges.get(id);
    invalidateObstacle(`e:${id}`, edge && labelRect(edge, state));
    affected.add(id);
  }
  // Terminal placement depends on current incident edges, including neighbors
  // whose other endpoint changes side or whose connection is added/deleted.
  if (!["bus", "fan", "bundle"].includes(style))
    for (const id of changedEdges) {
      const before = prior.edges.get(id),
        after = state.edges.get(id);
      const changesAttachment =
        !before ||
        !after ||
        before.sourceId !== after.sourceId ||
        before.targetId !== after.targetId ||
        before.sourcePort !== after.sourcePort ||
        before.targetPort !== after.targetPort ||
        [before.sourceId, before.targetId, after.sourceId, after.targetId].some((nodeId) =>
          changedNodes.has(nodeId),
        );
      if (!changesAttachment) continue;
      for (const version of [prior, state]) {
        const edge = version.edges.get(id);
        if (!edge) continue;
        for (const nodeId of [edge.sourceId, edge.targetId])
          for (const peer of version.incident.get(nodeId)?.keys() ?? []) affected.add(peer);
      }
    }
  // A changed branch/trunk may affect every member, but never unrelated groups.
  for (const id of [...affected])
    for (const version of [prior, state]) {
      const edge = version.edges.get(id);
      if (!edge) continue;
      const key = groupKey(edge, style, version.settings);
      if (key !== undefined)
        for (const peer of version.groups.get(key)?.keys() ?? []) affected.add(peer);
    }
  return { state, affected };
}
export function createRoutingStrategy(id: RouteStyle): NativeRoutingStrategy {
  return Object.freeze({
    id,
    route(graph: RoutingGraph, config: RoutingSettings = {}): RoutingSnapshot {
      const initial = initialState(graph, config, id),
        counts = metrics();
      const result = calculate(initial, id, new Set(initial.edges.keys()), counts);
      return snapshot(result.state, id, 0, counts);
    },
    update(
      graph: RoutingGraph,
      previous: RoutingSnapshot,
      diff: GraphDiff<unknown, unknown>,
      config?: RoutingSettings,
    ): RoutingUpdate {
      const prior = (previous as Snapshot)[STATE];
      if (!prior || previous.strategy !== id)
        throw new Error(
          "Update requires a snapshot from the same routing strategy; route again after serialization or strategy changes",
        );
      const { state, affected } = updateState(graph, prior, diff, id, config),
        counts = metrics();
      const result = calculate(state, id, affected, counts, prior);
      return Object.freeze({
        base: previous,
        snapshot: snapshot(result.state, id, previous.revision + 1, counts),
        patches: Object.freeze(result.patches.map((patch) => Object.freeze(patch))),
      });
    },
  });
}
export function applyRoutePatches(
  routes: ReadonlyMap<string, Route>,
  patches: readonly RoutePatch[],
): ReadonlyMap<string, Route> {
  let result = routes instanceof PersistentMap ? routes : new PersistentMap<Route>();
  if (!(routes instanceof PersistentMap))
    for (const [id, route] of routes) result = result.set(id, route);
  for (const patch of patches)
    result =
      patch.op === "set" ? result.set(patch.edgeId, patch.route) : result.delete(patch.edgeId);
  return result;
}
