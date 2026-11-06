import type { GraphDiff } from "@statelyai/graph";
import { adoptRoutingSnapshot, refineRoutingSnapshot } from "./engine";
import { routingStrategies } from "./strategies";
import type {
  Route,
  RouteGeometry,
  RoutingGraph,
  RoutingSettings,
  RoutingSnapshot,
  RoutingUpdate,
  RoutingUpdateScope,
} from "./types";

export interface RouteEdgesOptions {
  readonly graph: RoutingGraph;
  readonly geometry?: RouteGeometry;
  readonly settings?: RoutingSettings;
  /** Valid paths are retained under preserve-valid stability; rejected hints are rerouted. */
  readonly initialRoutes?: ReadonlyMap<string, Route>;
}
export interface UpdateRoutesOptions {
  readonly graph: RoutingGraph;
  readonly previous: RoutingSnapshot;
  readonly changes: GraphDiff<unknown, unknown>;
  readonly scope?: RoutingUpdateScope;
  /** Omit to inherit; supplied settings replace the previous configuration. */
  readonly settings?: RoutingSettings;
}

export function routeEdges({
  graph,
  geometry = "orthogonal",
  settings,
  initialRoutes,
}: RouteEdgesOptions): RoutingSnapshot {
  const config: RoutingSettings = { coordination: { kind: "independent" }, ...settings };
  return initialRoutes
    ? adoptRoutingSnapshot(graph, geometry, config, initialRoutes)
    : routingStrategies[geometry].route(graph, config);
}

export function updateRoutes({
  graph,
  previous,
  changes,
  settings,
  scope,
}: UpdateRoutesOptions): RoutingUpdate {
  const strategy = Object.values(routingStrategies).find(
    (strategy) => strategy.id === previous.strategy,
  );
  if (!strategy) throw new Error(`Unknown routing strategy ${previous.strategy}`);
  return strategy.update(
    graph,
    previous,
    changes,
    settings === undefined ? undefined : { coordination: { kind: "independent" }, ...settings },
    scope,
  );
}

/** Reconsider every route from current geometry, including valid preserved corridors. */
export function refineRoutes({ previous }: { readonly previous: RoutingSnapshot }): RoutingUpdate {
  return refineRoutingSnapshot(previous);
}
