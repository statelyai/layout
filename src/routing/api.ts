import type { GraphDiff } from "@statelyai/graph";
import { adoptRoutingSnapshot, changeRoutingGeometry, refineRoutingSnapshot } from "./engine";
import { routingStrategies } from "./strategies";
import type {
  Route,
  RoutingGraph,
  RoutingSettings,
  RoutingSnapshot,
  RoutingUpdate,
  RoutingUpdateScope,
} from "./types";

export interface RouteEdgesOptions {
  readonly graph: RoutingGraph;
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

export function routeEdges(options: RouteEdgesOptions): RoutingSnapshot {
  if ("geometry" in options) throw new RangeError("Use settings.policy.path for routing geometry");
  const { graph, settings, initialRoutes } = options;
  const path = settings?.policy?.path;
  const geometry = path?.kind === "polyline" ? (path.geometry ?? "orthogonal") : "orthogonal";
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
  const config =
    settings === undefined
      ? undefined
      : { coordination: { kind: "independent" as const }, ...settings };
  const path = settings?.policy?.path;
  if (
    path &&
    config &&
    ["straight", "orthogonal", "polyline", "octilinear"].includes(previous.strategy)
  ) {
    const geometry = path.kind === "polyline" ? (path.geometry ?? "orthogonal") : "orthogonal";
    if (geometry !== previous.strategy)
      return changeRoutingGeometry(graph, previous, changes, geometry, config);
  }

  return strategy.update(graph, previous, changes, config, scope);
}

/** Reconsider every route from current geometry, including valid preserved corridors. */
export function refineRoutes({ previous }: { readonly previous: RoutingSnapshot }): RoutingUpdate {
  return refineRoutingSnapshot(previous);
}
