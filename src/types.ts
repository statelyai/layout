import type { Graph, GraphPatch, VisualGraph } from "@statelyai/graph";
import type { LayoutConstraint } from "./constraints";

export type AnyGraph = Graph<unknown, unknown, unknown, unknown>;

export type LayoutDirection = "up" | "down" | "left" | "right";

export type LayoutScope =
  | { mode: "full" }
  | {
      mode: "incremental";
      previous: VisualGraph;
    }
  | {
      mode: "partial";
      /** Missing current geometry falls back to these matching entity IDs. */
      previous?: VisualGraph;
      /** Position permission only. Omitted or empty selects no nodes. */
      nodeIds?: readonly string[];
      /** Edge selection never grants permission to move endpoints. */
      edgeIds?: readonly string[];
      /** Defaults to affected; automatic changes obey edgeGeometry. */
      routing?: "selected" | "affected";
      /** Defaults to both; dimensions remain fixed. */
      edgeGeometry?: "routes" | "labels" | "both";
    }
  | {
      mode: "route-only";
      previous: VisualGraph;
      edgeIds?: readonly string[];
    };

export interface LayoutDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  entityIds?: readonly string[];
  phase?: string;
  constraintIds?: readonly string[];
  geometry?: "node" | "routes" | "labels";
}

export interface LayoutPhaseMetrics {
  id: string;
  durationMs: number;
}

export interface LayoutMetrics {
  durationMs: number;
  nodeCount: number;
  edgeCount: number;
  phases: readonly LayoutPhaseMetrics[];
}

export interface LayoutCapabilities {
  /** Common geometry constraints; absent means unsupported. */
  constraints?: boolean;
  full: boolean;
  incremental: boolean;
  partial: boolean;
  routeOnly: boolean;
  hierarchy: boolean;
  ports: boolean;
}

export interface LayoutAlgorithm<Options = unknown> {
  readonly id: string;
  readonly capabilities: LayoutCapabilities;
  layout<N, E, G, P>(
    graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
    options: Options,
    context: LayoutExecutionContext,
  ): VisualGraph<N, E, G, P> | Promise<VisualGraph<N, E, G, P>>;
}

export interface LayoutExecutionContext {
  readonly scope: LayoutScope;
  readonly constraints?: readonly LayoutConstraint[];
  readonly signal?: AbortSignal;
  readonly diagnostics: LayoutDiagnostic[];
  measurePhase<T>(id: string, run: () => T): T;
  throwIfAborted(): void;
}

export interface LayoutRequest<N = unknown, E = unknown, G = unknown, P = unknown, O = unknown> {
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>;
  algorithm?: string | LayoutAlgorithm<O>;
  options?: O;
  scope?: LayoutScope;
  constraints?: readonly LayoutConstraint[];
  signal?: AbortSignal;
}

export interface LayoutResult<N = unknown, E = unknown, G = unknown, P = unknown> {
  graph: VisualGraph<N, E, G, P>;
  patches: readonly GraphPatch<N, E>[];
  diagnostics: readonly LayoutDiagnostic[];
  metrics: LayoutMetrics;
}
