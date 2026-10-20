import type { EntityRect, Graph, GraphDiff, Point } from "@statelyai/graph";
import type { BezierEndpoint, BezierGuide } from "./bezier-fit";
export type { BezierEndpoint, BezierGuide } from "./bezier-fit";

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
  readonly fromSide?: RouteSide;
  readonly toSide?: RouteSide;
  /** Same ID denotes a shared trunk; render it once. */
  readonly sharedId?: string;
}
export type RoutingDiagnosticCode =
  | "MISSING_GEOMETRY"
  | "MISSING_PORT"
  | "ROUTE_CONFLICT"
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
export interface RouteAttachment {
  /** Node-local attachment rectangle, independent of its outer obstacle bounds. */
  readonly bounds: RouteBounds;
  readonly facing?: "inward" | "outward";
}
export interface BezierRoutingOptions {
  readonly avoidObstacles?: boolean;
  readonly attachmentMode?: "floating" | "orthogonal";
  readonly targetClearance?: number;
}
export interface BezierEdgeSettings extends BezierRoutingOptions {
  readonly source?: BezierEndpoint;
  readonly target?: Extract<BezierEndpoint, { kind: "floating" }>;
  readonly guides?: { readonly source: BezierGuide; readonly target: BezierGuide };
  readonly obstacles?: readonly RouteBounds[];
  readonly terminalBounds?: readonly RouteBounds[];
  readonly labelTangent?: RoutePoint;
  readonly disabled?: boolean;
}
export interface EdgeRoutingSettings {
  /** Resolve the source from this edge label in the current graph geometry. */
  readonly sourceLabel?: string;
  readonly sourceSides?: readonly RouteSide[];
  readonly targetSides?: readonly RouteSide[];
  readonly labelSides?: readonly RouteSide[];
  readonly bezier?: BezierEdgeSettings;
  readonly sourceAttachment?: RouteAttachment;
  readonly targetAttachment?: RouteAttachment;
  readonly sourceSide?: RouteSide;
  readonly targetSide?: RouteSide;
  readonly waypoints?: readonly RoutePoint[];
  /** Explicit shared routing group. Native binary edges describe branches of a net. */
  readonly group?: string;
}
export interface RoutingSettings {
  /** Opt into center-tangent Bézier routing and floating attachments. */
  readonly bezier?: BezierRoutingOptions;
  /** Native compound geometry is parent-relative; adapters may supply resolved world geometry. */
  readonly coordinateSpace?: "parent" | "world";
  readonly clearance?: number;
  readonly radius?: number;
  readonly edgeSpacing?: number;
  readonly bendPenalty?: number;
  /** Soft cost per crossing; finite costs keep detours proportionate. Default 80. */
  readonly crossingPenalty?: number;
  /** Cost per unit of parallel overlap within edgeSpacing. Default 8. */
  readonly overlapPenalty?: number;
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
