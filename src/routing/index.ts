import { createRoutingStrategy } from "./engine";
export const straightRouting = createRoutingStrategy("straight");
export const bezierRouting = createRoutingStrategy("bezier");
export const orthogonalRouting = createRoutingStrategy("orthogonal");
export const polylineRouting = createRoutingStrategy("polyline");
export const octilinearRouting = createRoutingStrategy("octilinear");
export const curvedRouting = createRoutingStrategy("curved");
export const organicRouting = createRoutingStrategy("organic");
export const parallelRouting = createRoutingStrategy("parallel");
export const selfLoopRouting = createRoutingStrategy("self-loop");
export const fanRouting = createRoutingStrategy("fan");
export const busRouting = createRoutingStrategy("bus");
export const bundleRouting = createRoutingStrategy("bundle");
export const routingStrategies = Object.freeze({
  straight: straightRouting,
  bezier: bezierRouting,
  orthogonal: orthogonalRouting,
  polyline: polylineRouting,
  octilinear: octilinearRouting,
  curved: curvedRouting,
  organic: organicRouting,
  parallel: parallelRouting,
  "self-loop": selfLoopRouting,
  fan: fanRouting,
  bus: busRouting,
  bundle: bundleRouting,
});
export { applyRoutePatches } from "./engine";
export {
  flattenPath,
  getPathBounds,
  getPathLength,
  getPointAtLength,
  getTangentAtLength,
  pathFromPoints,
  roundCorners,
  toSvgPath,
} from "./path";
export type {
  RouteAttachment,
  EdgeRoutingSettings,
  NativeRoutingStrategy,
  Route,
  RouteBounds,
  RouteEndpoint,
  RoutePatch,
  RoutePath,
  RoutePoint,
  RouteSection,
  RouteSegment,
  RouteSide,
  RouteStyle,
  RoutingDiagnostic,
  RoutingDiagnosticCode,
  RoutingGraph,
  RoutingMetrics,
  RoutingSettings,
  RoutingSnapshot,
  RoutingStrategy,
  RoutingUpdate,
} from "./types";
export type { FlattenPathOptions } from "./path";
export {
  getLayoutRoutes,
  pathFromSplinePoints,
  routeToGraphPatch,
  routeToPolylines,
} from "./adapters";
