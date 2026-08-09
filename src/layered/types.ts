import type { EntityRect, Graph, GraphNode, Point } from "@statelyai/graph";
import type { LayoutConstraints } from "@statelyai/graph/layout";
import type { LayoutDirection } from "../types";

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
  graph: Graph<unknown, unknown, unknown, unknown>;
  sizes: ReadonlyMap<string, NodeSize>;
  direction: LayoutDirection;
  spacing: LayeredSpacing;
  padding: LayoutPadding;
  constrainedLayerByNodeId: ReadonlyMap<string, number>;
}

export interface AcyclicOrientation {
  reversedEdgeIds: ReadonlySet<string>;
}

export interface LayerAssignment {
  layerByNodeId: ReadonlyMap<string, number>;
}

export interface LayerOrder {
  layers: readonly (readonly string[])[];
}

export interface NodePlacement {
  rectByNodeId: ReadonlyMap<string, EntityRect>;
}

export interface EdgeRoutes {
  pointsByEdgeId: ReadonlyMap<string, readonly Point[]>;
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

export interface LayeredLayoutOptions {
  direction?: LayoutDirection;
  spacing?: Partial<LayeredSpacing>;
  padding?: number | Partial<LayoutPadding>;
  constraints?: LayoutConstraints;
  measure?: (node: GraphNode) => NodeSize;
  crossingSweeps?: number;
  strategies?: LayeredStrategies;
}
