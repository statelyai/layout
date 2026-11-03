import type { GraphDiff } from "@statelyai/graph";
import { expandLabelFamilies, labelFamilyIndex, routeBezierEdge } from "./bezier";
import {
  conflictCost,
  reservations,
  reservationBounds,
  outsideTerminal,
  RouteReservationIndex,
} from "./coordination";
import { segmentBounds } from "./search";
import { routeBounds, routeEdge, type Metrics, type Batch } from "./algorithms";
import {
  edgeGeometry,
  freeze,
  groupKey,
  sharedCoordination,
  obstacleLabelRect,
  effectivePolicy,
  members,
  nodeGeometry,
  settings,
  worldRect,
  type EdgeGeometry,
  type NodeGeometry,
  type State,
  type Settings,
} from "./model";
import { PersistentMap } from "./persistent";
import { toSvgPath } from "./path";
import { inflate, intersects, SpatialIndex, union } from "./spatial";
import type {
  NativeRoutingStrategy,
  Route,
  RouteBounds,
  RoutePatch,
  RouteStyle,
  RouteGeometry,
  RoutingGraph,
  RoutingSettings,
  RoutingSnapshot,
  RoutingUpdate,
} from "./types";

const STATE = Symbol("routingState");
const settingsKeys = new WeakMap<Settings, string>();
function settingsKey(config: Settings): string {
  const cached = settingsKeys.get(config);
  if (cached !== undefined) return cached;
  const key = JSON.stringify(config);
  settingsKeys.set(config, key);
  return key;
}
const globalSettingsKeys = new WeakMap<Settings, string>();
function globalSettingsKey(config: Settings): string {
  const cached = globalSettingsKeys.get(config);
  if (cached !== undefined) return cached;
  const { edges: _edges, ...global } = config;
  const key = JSON.stringify(global);
  globalSettingsKeys.set(config, key);
  return key;
}

class PendingRoutes extends Set<string> {
  readonly #heap: string[] = [];
  readonly #compare: (a: string, b: string) => number;
  constructor(compare: (a: string, b: string) => number) {
    super();
    this.#compare = compare;
  }
  override add(id: string): this {
    if (this.has(id)) return this;
    super.add(id);
    let index = this.#heap.length;
    this.#heap.push(id);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.#compare(this.#heap[parent]!, id) <= 0) break;
      this.#heap[index] = this.#heap[parent]!;
      index = parent;
    }
    this.#heap[index] = id;
    return this;
  }
  take(): string {
    while (this.#heap.length) {
      const first = this.#heap[0]!,
        last = this.#heap.pop()!;
      if (this.#heap.length) {
        let index = 0;
        while (index * 2 + 1 < this.#heap.length) {
          let child = index * 2 + 1;
          if (
            child + 1 < this.#heap.length &&
            this.#compare(this.#heap[child + 1]!, this.#heap[child]!) < 0
          )
            child++;
          if (this.#compare(last, this.#heap[child]!) <= 0) break;
          this.#heap[index] = this.#heap[child]!;
          index = child;
        }
        this.#heap[index] = last;
      }
      if (this.delete(first)) return first;
    }
    throw new Error("Routing queue is empty");
  }
}
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
function edgeMembership(
  state: State,
  edge: EdgeGeometry,
  style: RouteStyle,
  add: boolean,
  config = state.settings,
): State {
  let incident = state.incident,
    groups = state.groups;
  for (const id of new Set([edge.sourceId, edge.targetId]))
    incident = members(incident, id, edge.id, add);
  const key = groupKey(edge, style, config);
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
    drawnIndex: new SpatialIndex(),
    reservationIndex: new RouteReservationIndex(),
    routes: new PersistentMap(),
  };
  for (const [id, n] of nodes)
    state = { ...state, obstacles: state.obstacles.set(`n:${id}`, worldRect(n, state)) };
  for (const [id, e] of edges) {
    state = edgeMembership(state, e, style, true);
    state = { ...state, obstacles: state.obstacles.set(`e:${id}`, obstacleLabelRect(e, state)) };
  }
  return state;
}
function calculate(
  state: State,
  style: RouteStyle,
  affected: ReadonlySet<string>,
  counts: Metrics,
  previous?: State,
  preservePrevious = true,
): { state: State; patches: RoutePatch[] } {
  let routes = state.routes,
    routeIndex = state.routeIndex,
    drawnIndex = state.drawnIndex,
    reservationIndex = state.reservationIndex;
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
  const processed = new Set<string>();
  const { roots: familyRoots, depths: familyDepth } = labelFamilyIndex(input);
  const priorities = new Map<string, string>();
  const priority = (id: string) => {
    let result = priorities.get(id);
    if (result !== undefined) return result;
    const edge = state.edges.get(id) ?? previous?.edges.get(id);
    const familyRoot = familyRoots.get(id);
    if (familyRoot !== undefined) {
      priorities.set(id, familyRoot);
      return familyRoot;
    }
    const key = edge && groupKey(edge, style, state.settings);
    result = key
      ? ((state.edges.has(id) ? state.groups : previous?.groups)?.get(key)?.keys().next().value ??
        id)
      : id;
    priorities.set(id, result);
    return result;
  };
  const compare = (a: string, b: string) =>
    (priority(a) < priority(b) ? -1 : priority(a) > priority(b) ? 1 : 0) ||
    (familyDepth.get(a) ?? 1) - (familyDepth.get(b) ?? 1) ||
    (a < b ? -1 : a > b ? 1 : 0);
  const pending = new PendingRoutes(compare);
  for (const id of affected) pending.add(id);
  expandLabelFamilies(pending, input);
  if (previous) expandLabelFamilies(pending, previous);
  const later = (candidate: string, id: string) => compare(candidate, id) > 0;
  const invalidate = (id: string, bounds: ReturnType<typeof routeBounds>) => {
    for (const candidate of routeIndex.query(inflate(bounds, state.settings.edgeSpacing))) {
      if (!later(candidate, id) || processed.has(candidate)) continue;
      pending.add(candidate);
      expandLabelFamilies(pending, input);
      for (const done of processed) pending.delete(done);
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
  while (pending.size) {
    const id = pending.take();
    processed.add(id);
    const edge = state.edges.get(id),
      oldRoute = previous?.routes.get(id);
    if (!edge) {
      if (routes.has(id)) {
        invalidate(id, routeBounds(routes.get(id)!));
        routes = routes.delete(id);
        routeIndex = routeIndex.set(id);
        drawnIndex = drawnIndex.set(id);
        reservationIndex = reservationIndex.set(id);
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
      const terminalCache = new Map<string, RouteBounds[]>();
      for (const segment of reservationIndex.query(area)) {
        const otherId = segment.edgeId;
        if (!later(id, otherId)) continue;
        const other = state.edges.get(otherId),
          route = routes.get(otherId);
        if (!other || !route) continue;
        if (
          sharedCoordination(style, state.settings) &&
          groupKey(other, style, state.settings) === groupKey(edge, style, state.settings)
        )
          continue;
        let terminalRegions = terminalCache.get(otherId);
        if (!terminalRegions) {
          terminalRegions = [edge.sourceId, edge.targetId]
            .filter((node) => node === other.sourceId || node === other.targetId)
            .flatMap((id) => {
              const node = state.nodes.get(id),
                bounds = node && worldRect(node, state);
              return bounds
                ? [
                    inflate(
                      bounds,
                      state.settings.clearance +
                        (style === "organic" ? 0 : state.settings.edgeSpacing * 2) +
                        1,
                    ),
                  ]
                : [];
            });
          terminalCache.set(otherId, terminalRegions);
        }
        const outside = terminalRegions.reduce<ReturnType<typeof reservations>>(
          (segments, rect) => segments.flatMap((segment) => outsideTerminal(segment, rect)),
          [segment],
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
    batch.policy = effectivePolicy(state.settings, id);
    const costSettings = { ...state.settings, ...batch.policy?.collisions };
    batch.edgeCost = (a, b) =>
      costSettings.crossingPenalty === 0 && costSettings.overlapPenalty === 0
        ? 0
        : query(segmentBounds(a, b)).reduce(
            (cost, other) => cost + conflictCost(a, b, other, costSettings),
            0,
          );
    batch.conflicts = (a, b) =>
      query(segmentBounds(a, b)).some(
        (other) =>
          conflictCost(a, b, other, { ...state.settings, crossingPenalty: 1, overlapPenalty: 1 }) >
          1e-8,
      );
    batch.guides = (bounds) =>
      costSettings.crossingPenalty === 0 && costSettings.overlapPenalty === 0
        ? []
        : query(bounds).map((segment) => reservationBounds(segment, state.settings.edgeSpacing));
    batch.labelOverlaps = (bounds) => {
      batch.dependencyBounds = batch.dependencyBounds
        ? union(batch.dependencyBounds, bounds)
        : bounds;
      return drawnIndex
        .query(bounds)
        .filter((otherId) => {
          const label = routes.get(otherId)?.label;
          return later(id, otherId) && label && intersects(bounds, label.bounds);
        })
        .map((otherId) => `e:${otherId}`);
    };
    batch.routes = routes;
    batch.previous = preservePrevious ? oldRoute : undefined;
    batch.previousSettings = previous?.settings;
    let route =
      style === "bezier" &&
      !batch.policy &&
      !routes.get(state.settings.edges[id]?.sourceLabel ?? "")?.label
        ? routeBezierEdge(edge, input, routes, counts, batch)
        : routeEdge(edge, input, style, counts, batch);
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
    drawnIndex = drawnIndex.set(id, drawnBounds);
    if (route === oldRoute) continue;
    route = freeze(route);
    routes = routes.set(id, route);
    reservationIndex = reservationIndex.set(id, route);
    patches.push({ op: "set", edgeId: id, route });
  }
  counts.affectedEdges = processed.size;
  counts.reusedEdges = Math.max(
    0,
    state.routes.size - [...processed].filter((id) => state.routes.has(id)).length,
  );
  patches.sort((a, b) => (a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0));
  return { state: { ...state, routes, routeIndex, drawnIndex, reservationIndex }, patches };
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
    candidateSettings === prior.settings ||
    settingsKey(candidateSettings) === settingsKey(prior.settings)
      ? prior.settings
      : candidateSettings;
  const settingsChanged =
    prior.direction !== graph.direction ||
    (nextSettings !== prior.settings &&
      globalSettingsKey(nextSettings) !== globalSettingsKey(prior.settings));
  let state: State = { ...prior, settings: nextSettings, direction: graph.direction };
  const changedNodes = new Set<string>(),
    changedEdges = new Set<string>(),
    changedConfigs = new Set<string>(),
    affected = new Set<string>();
  if (!settingsChanged && nextSettings !== prior.settings) {
    for (const id of new Set([
      ...Object.keys(prior.settings.edges),
      ...Object.keys(nextSettings.edges),
    ])) {
      if (JSON.stringify(prior.settings.edges[id]) === JSON.stringify(nextSettings.edges[id]))
        continue;
      changedConfigs.add(id);
      changedEdges.add(id);
    }
  }
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
    state = edgeMembership(state, old, style, false, prior.settings);
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
    state = edgeMembership(state, old!, style, false, prior.settings);
    state = { ...state, edges: state.edges.set(change.id, next) };
    state = edgeMembership(state, next, style, true);
    changedEdges.add(change.id);
  }
  for (const id of changedConfigs) {
    const before = prior.edges.get(id),
      after = state.edges.get(id);
    if (before) state = edgeMembership(state, before, style, false, prior.settings);
    if (after) state = edgeMembership(state, after, style, true);
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
    invalidateObstacle(`e:${id}`, edge && obstacleLabelRect(edge, state));
    affected.add(id);
  }
  // Terminal placement depends on current incident edges, including neighbors
  // whose other endpoint changes side or whose connection is added/deleted.
  if (!sharedCoordination(style, state.settings))
    for (const id of changedEdges) {
      const before = prior.edges.get(id),
        after = state.edges.get(id);
      const changesAttachment =
        changedConfigs.has(id) ||
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
  expandLabelFamilies(affected, prior);
  expandLabelFamilies(affected, state);
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
      const preservePrevious =
        prior.direction === state.direction &&
        (prior.settings === state.settings ||
          globalSettingsKey(prior.settings) === globalSettingsKey(state.settings));
      const result = calculate(state, id, affected, counts, prior, preservePrevious);
      return Object.freeze({
        base: previous,
        snapshot: snapshot(result.state, id, previous.revision + 1, counts),
        patches: Object.freeze(result.patches.map((patch) => Object.freeze(patch))),
      });
    },
  });
}

/** Seed through the same hard-validity checks used for incremental preservation. */
export function adoptRoutingSnapshot(
  graph: RoutingGraph,
  geometry: RouteGeometry,
  config: RoutingSettings = {},
  initialRoutes: ReadonlyMap<string, Route>,
): RoutingSnapshot {
  const adoptedConfig: RoutingSettings = {
    ...config,
    policy: {
      curve: { kind: "polyline" },
      ...config.policy,
      stability: config.policy?.stability ?? { kind: "preserve-valid" },
    },
  };
  let initial = initialState(graph, adoptedConfig, geometry);
  for (const [id, route] of initialRoutes) {
    if (id !== route.edgeId || !initial.edges.has(id))
      throw new Error(`Initial route has no matching graph edge ${id}`);
    const authored = initial.settings.edges[id]?.waypoints ?? [];
    const knots = route.sections.flatMap((section) => [
      section.path.start,
      ...section.path.segments.map((segment) => segment.to),
    ]);
    if (
      !authored.every((point) =>
        knots.some((knot) => Math.hypot(knot.x - point.x, knot.y - point.y) < 1e-7),
      )
    )
      continue;
    // Validate finite coordinates before a hint enters immutable routing state.
    for (const section of route.sections) toSvgPath(section.path);
    const hint = freeze(structuredClone(route));
    initial = {
      ...initial,
      routes: initial.routes.set(id, hint),
      routeIndex: initial.routeIndex.set(id, routeBounds(hint)),
    };
  }
  const counts = metrics();
  const result = calculate(initial, geometry, new Set(initial.edges.keys()), counts, initial);
  return snapshot(result.state, geometry, 0, counts);
}

export function refineRoutingSnapshot(previous: RoutingSnapshot): RoutingUpdate {
  const prior = (previous as Snapshot)[STATE];
  if (!prior) throw new Error("Refinement requires an in-memory routing snapshot");
  const style = previous.strategy;
  const known = [
    "straight",
    "bezier",
    "orthogonal",
    "polyline",
    "octilinear",
    "curved",
    "organic",
    "parallel",
    "self-loop",
    "fan",
    "bus",
    "bundle",
  ] as const;
  const id = known.find((id) => id === style);
  if (!id) throw new Error(`Unknown routing strategy ${style}`);
  const counts = metrics();
  const result = calculate(prior, id, new Set(prior.edges.keys()), counts, prior, false);
  return Object.freeze({
    base: previous,
    snapshot: snapshot(result.state, id, previous.revision + 1, counts),
    patches: freeze(result.patches),
  });
}

/** Retain trusted native layout postprocessing while keeping dependency reads conservative. */
export function rebaseLayoutRoutingSnapshot(
  previous: RoutingSnapshot,
  paths: ReadonlyMap<string, Route>,
): RoutingSnapshot {
  const prior = (previous as Snapshot)[STATE];
  if (!prior || paths.size !== prior.routes.size)
    throw new Error("Layout route handoff requires the original native routing snapshot");
  let routes = prior.routes,
    routeIndex = prior.routeIndex;
  for (const [id, route] of paths) {
    if (id !== route.edgeId || !prior.edges.has(id)) throw new Error(`Unknown layout route ${id}`);
    routes = routes.set(id, freeze(route));
    const bounds = routeBounds(route),
      old = routeIndex.bounds.get(id);
    routeIndex = routeIndex.set(id, old ? union(old, bounds) : bounds);
  }
  const config = settings({
    ...prior.settings,
    policy: { ...prior.settings.policy, stability: { kind: "preserve-valid" } },
  });
  return Object.freeze({
    ...previous,
    routes,
    [STATE]: Object.freeze({ ...prior, settings: config, routes, routeIndex }),
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
