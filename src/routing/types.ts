import type { EntityRect, Graph, GraphDiff, Point } from "@statelyai/graph";

export type RoutePoint = Readonly<Point>;
export type RouteSegment =
  | { readonly kind: "line"; readonly to: RoutePoint }
  | { readonly kind: "quadratic"; readonly control: RoutePoint; readonly to: RoutePoint }
  | {
      readonly kind: "cubic";
      readonly control1: RoutePoint;
      readonly control2: RoutePoint;
      readonly to: RoutePoint;
    }
  | {
      readonly kind: "arc";
      readonly rx: number;
      readonly ry: number;
      readonly rotation: number;
      readonly largeArc: boolean;
      readonly sweep: boolean;
      readonly to: RoutePoint;
    };
export interface RoutePath {
  readonly start: RoutePoint;
  readonly segments: readonly RouteSegment[];
}
export type RouteEndpoint =
  | { readonly kind: "node"; readonly nodeId: string; readonly port?: string }
  | { readonly kind: "label"; readonly edgeId: string }
  | { readonly kind: "junction"; readonly id: string };
export interface RouteSection {
  readonly id: string;
  readonly from: RouteEndpoint;
  readonly to: RouteEndpoint;
  readonly path: RoutePath;
  /** Same ID denotes a shared trunk; render it once. */
  readonly sharedId?: string;
}
export type RoutingDiagnosticCode =
  | "MISSING_GEOMETRY"
  | "MISSING_PORT"
  | "ROUTE_BLOCKED"
  | "SEARCH_BUDGET"
  | "CONSTRAINT_VIOLATION";
export interface RoutingDiagnostic {
  readonly code: RoutingDiagnosticCode;
  readonly edgeId: string;
  readonly message: string;
}
export interface Route {
  readonly edgeId: string;
  readonly sections: readonly RouteSection[];
  readonly status: "routed" | "fallback";
  readonly diagnostics: readonly RoutingDiagnostic[];
}
export type RoutePatch =
  | { readonly op: "set"; readonly edgeId: string; readonly route: Route }
  | { readonly op: "delete"; readonly edgeId: string };
export type RouteStyle =
  | "straight"
  | "bezier"
  | "orthogonal"
  | "polyline"
  | "octilinear"
  | "curved"
  | "organic"
  | "parallel"
  | "self-loop"
  | "fan"
  | "bus"
  | "bundle";
export type RouteSide = "left" | "right" | "top" | "bottom";
export interface EdgeRoutingSettings {
  readonly sourceSide?: RouteSide;
  readonly targetSide?: RouteSide;
  readonly waypoints?: readonly RoutePoint[];
  /** Explicit shared routing group. Native binary edges describe branches of a net. */
  readonly group?: string;
}
export interface RoutingSettings {
  /** Native compound geometry is parent-relative; adapters may supply resolved world geometry. */
  readonly coordinateSpace?: "parent" | "world";
  readonly clearance?: number;
  readonly radius?: number;
  readonly edgeSpacing?: number;
  readonly bendPenalty?: number;
  readonly maxSearchNodes?: number;
  readonly organicIterations?: number;
  readonly edges?: Readonly<Record<string, EdgeRoutingSettings>>;
}
export interface RoutingMetrics {
  readonly routedEdges: number;
  readonly reusedEdges: number;
  readonly affectedEdges: number;
  readonly searchNodes: number;
  readonly obstacleCandidates: number;
}
/** Immutable value. Retain it per canvas; the private state uses structural sharing. */
export interface RoutingSnapshot {
  readonly strategy: string;
  readonly revision: number;
  readonly routes: ReadonlyMap<string, Route>;
  readonly metrics: RoutingMetrics;
}
export interface RoutingUpdate {
  readonly snapshot: RoutingSnapshot;
  readonly patches: readonly RoutePatch[];
  /** Compare identity before accepting an asynchronous result. */
  readonly base: RoutingSnapshot;
}
export type RoutingGraph = Graph<unknown, unknown, unknown, unknown>;
export interface RoutingStrategy {
  readonly id: string;
  route(
    graph: RoutingGraph,
    settings?: RoutingSettings,
  ): RoutingSnapshot | Promise<RoutingSnapshot>;
  update(
    graph: RoutingGraph,
    previous: RoutingSnapshot,
    diff: GraphDiff<unknown, unknown>,
    settings?: RoutingSettings,
  ): RoutingUpdate | Promise<RoutingUpdate>;
}
export interface NativeRoutingStrategy extends RoutingStrategy {
  readonly id: RouteStyle;
  route(graph: RoutingGraph, settings?: RoutingSettings): RoutingSnapshot;
  update(
    graph: RoutingGraph,
    previous: RoutingSnapshot,
    diff: GraphDiff<unknown, unknown>,
    settings?: RoutingSettings,
  ): RoutingUpdate;
}
export type RouteBounds = Readonly<EntityRect>;
