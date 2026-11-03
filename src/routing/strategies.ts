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
