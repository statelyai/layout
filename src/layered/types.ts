import type { NativeRoutingStrategy, RoutingSettings } from "../routing/types";
import type { EntityRect, Graph, GraphEdge, GraphNode, GraphPort, Point } from "@statelyai/graph";
import type { LayoutConstraints } from "@statelyai/graph/layout";
import type { LayoutHint } from "./hints";
import type { LayoutDirection } from "../types";
import type { ElkLayeredOptionValueByName, LayeredAdvancedOptions } from "./elk-options";

export interface NodeSize {
  width: number;
  height: number;
}

export interface LayeredSpacing {
  node: number;
  layer: number;
}

export interface LayoutPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayeredPhaseInput {
  /** Authored edge order retained through label and long-edge expansion. */
  modelOrderByEdgeId?: ReadonlyMap<string, number>;
  graph: Graph<unknown, unknown, unknown, unknown>;
  sizes: ReadonlyMap<string, NodeSize>;
  direction: LayoutDirection;
  spacing: LayeredSpacing;
  padding: LayoutPadding;
  constrainedLayerByNodeId: ReadonlyMap<string, number>;
  settings: LayeredAdvancedOptions;
  nodeSettings?: (node: GraphNode) => ElkLayeredOptionValueByName | undefined;
  edgeSettings?: (edge: GraphEdge) => ElkLayeredOptionValueByName | undefined;
  portSettings?: (port: GraphPort, node: GraphNode) => ElkLayeredOptionValueByName | undefined;
}

export interface AcyclicOrientation {
  reversedEdgeIds: ReadonlySet<string>;
}

export interface LayerAssignment {
  layerCount?: number;
  layerByNodeId: ReadonlyMap<string, number>;
  /** Layer-internal seed order produced by layerers whose insertion order is observable. */
  seedOrder?: readonly string[];
}

export interface LayerOrder {
  /** Canonical clockwise physical port identities, independent of edge reversal. */
  physicalPortOrderByNodeId?: ReadonlyMap<string, readonly string[]>;
  layers: readonly (readonly string[])[];
  /** Internal ELK sweep state retained for exact port-aware placement. */
  inputPortOrderByNodeId?: ReadonlyMap<string, readonly string[]>;
  /** Internal ELK sweep state retained for exact port-aware placement. */
  outputPortOrderByNodeId?: ReadonlyMap<string, readonly string[]>;
}

export interface NodePlacement {
  rectByNodeId: ReadonlyMap<string, EntityRect>;
}

export interface EdgeRoutes {
  pointsByEdgeId: ReadonlyMap<string, readonly Point[]>;
  /** Branch points generated on physical orthogonal hypersegments before restoration. */
  junctionPointsByEdgeId?: ReadonlyMap<string, readonly Point[]>;
  /** ELK spline segment NUB controls retained until long-edge joining. */
  splineNubControlsByEdgeId?: ReadonlyMap<string, readonly Point[]>;
  /** Reversed fixed-side routes that must stay outside the node envelope during compaction. */
  outsideFeedbackEdgeIds?: ReadonlySet<string>;
}

export type CycleBreaker = (input: LayeredPhaseInput) => AcyclicOrientation;

export type LayerAssigner = (
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
) => LayerAssignment;

export type CrossingMinimizer = (
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  assignment: LayerAssignment,
) => LayerOrder;

export type NodePlacer = (input: LayeredPhaseInput, order: LayerOrder) => NodePlacement;

export type EdgeRouter = (
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  placement: NodePlacement,
) => EdgeRoutes;

export interface LayeredStrategies {
  breakCycles?: CycleBreaker;
  assignLayers?: LayerAssigner;
  minimizeCrossings?: CrossingMinimizer;
  placeNodes?: NodePlacer;
  routeEdges?: EdgeRouter;
}

/** Geometry reserved while laying out a compound, before its ancestors. */
export interface CompoundLayoutOptions {
  padding?: number | Partial<LayoutPadding>;
  direction?: LayoutDirection;
  header?: NodeSize & { side?: "top" | "right" | "bottom" | "left" };
  minContentSize?: Partial<NodeSize>;
}
export interface CompoundLayoutGeometry {
  /** Parent-relative outer rectangle; header/content are relative to this rectangle. */
  bounds: EntityRect;
  header?: EntityRect;
  content: EntityRect;
}
export interface CompoundEdgeAttachment {
  /** Content attachments leave toward the interior; outer attachments leave outward. */
  source?: "content" | "outer";
  target?: "content" | "outer";
}

export interface LayeredLayoutOptions {
  /** Replace initial routes after initial placement and routing, without moving geometry. */
  routing?: { strategy: Pick<NativeRoutingStrategy, "route">; settings?: RoutingSettings };
  direction?: LayoutDirection;
  compound?: (node: GraphNode) => CompoundLayoutOptions | undefined;
  edgeAttachment?: (edge: GraphEdge) => CompoundEdgeAttachment | undefined;
  spacing?: Partial<LayeredSpacing>;
  padding?: number | Partial<LayoutPadding>;
  constraints?: LayoutConstraints;
  /** Reader-facing preferences applied during layering, ordering and placement. */
  hints?: readonly LayoutHint[];
  measure?: (node: GraphNode) => NodeSize;
  crossingSweeps?: number;
  strategies?: LayeredStrategies;
  /** ELK-equivalent settings keyed by simplified names without vendor prefixes. */
  settings?: LayeredAdvancedOptions;
  /** Per-node settings for ELK options whose target is a node. */
  nodeSettings?: (node: GraphNode) => ElkLayeredOptionValueByName | undefined;
  /** Per-edge settings for ELK options whose target is an edge. */
  edgeSettings?: (edge: GraphEdge) => ElkLayeredOptionValueByName | undefined;
  /** Per-port settings for ELK options whose target is a port. */
  portSettings?: (port: GraphPort, node: GraphNode) => ElkLayeredOptionValueByName | undefined;
}
