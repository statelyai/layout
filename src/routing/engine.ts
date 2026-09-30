import type { GraphDiff } from "@statelyai/graph";
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
import { inflate, SpatialIndex, union } from "./spatial";
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
  counts.affectedEdges = affected.size;
  counts.reusedEdges = Math.max(
    0,
    routes.size - [...affected].filter((id) => routes.has(id)).length,
  );
  for (const id of [...affected].sort()) {
    const edge = state.edges.get(id),
      oldRoute = previous?.routes.get(id);
    if (!edge) {
      if (routes.has(id)) {
        routes = routes.delete(id);
        routeIndex = routeIndex.set(id);
        patches.push({ op: "delete", edgeId: id });
      }
      continue;
    }
    batch.dependencyBounds = undefined;
    let route = routeEdge(edge, input, style, counts, batch);
    if (oldRoute && JSON.stringify(oldRoute) === JSON.stringify(route)) route = oldRoute;
    // Invalidate all spatial reads, including corridors rejected during search.
    // An obstacle leaving those regions can change the canonical route too.
    const drawnBounds = routeBounds(route);
    routeIndex = routeIndex.set(
      id,
      batch.dependencyBounds ? union(batch.dependencyBounds, drawnBounds) : drawnBounds,
    );
    if (route === oldRoute) continue;
    route = freeze(route);
    routes = routes.set(id, route);
    patches.push({ op: "set", edgeId: id, route });
  }
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
