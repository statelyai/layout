import { freeze } from "./model";
import type { Route, RouteSection } from "./types";

const untrimmed = new WeakMap<Route, Route>();

/** Keep endpoint geometry for preservation without exposing marker-gap internals. */
export function rememberUntrimmedRoute(route: Route, sections: readonly RouteSection[]): Route {
  untrimmed.set(route, freeze({ ...route, sections: [...sections] }));
  return route;
}

export function getUntrimmedRoute(route: Route | undefined): Route | undefined {
  return route && (untrimmed.get(route) ?? route);
}
