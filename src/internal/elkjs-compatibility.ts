import type { VisualGraph, Point } from "@statelyai/graph";

export interface Elkjs0111ResultPolicy {
  junctionPointsByEdgeId?: ReadonlyMap<string, readonly Point[]>;
  normalizationBounds?: { left: number; top: number; right: number; bottom: number };
  providerBounds?: { width: number; height: number };
  preserveEdgeSections?: boolean;
  skipBoundsNormalization?: boolean;
}

export const elkjs0111ResultPolicy = Symbol("elkjs0111ResultPolicy");

export function setElkjs0111ResultPolicy<N, E, G, P>(
  graph: VisualGraph<N, E, G, P>,
  policy: Elkjs0111ResultPolicy,
): VisualGraph<N, E, G, P> {
  Object.defineProperty(graph, elkjs0111ResultPolicy, { value: policy });
  return graph;
}
