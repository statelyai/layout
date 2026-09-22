import type { Graph, VisualGraph } from "@statelyai/graph";
import { boxAlgorithm, elkjs0111BoxAlgorithm, type BoxLayoutOptions } from "../box";
import { fixedAlgorithm, type FixedLayoutOptions } from "../fixed";
import { layeredAlgorithm, type LayeredLayoutOptions } from "../layered";
import {
  elkjs0111RectanglePackingAlgorithm,
  rectanglePackingAlgorithm,
  type RectanglePackingLayoutOptions,
} from "../packing";
import { elkjs0111RandomAlgorithm, randomAlgorithm, type RandomLayoutOptions } from "../random";
import {
  sporeCompactionAlgorithm,
  sporeOverlapRemovalAlgorithm,
  type SporeLayoutOptions,
} from "../spore";
import type { LayoutAlgorithm, LayoutExecutionContext } from "../types";

export interface BuiltInLayoutOptionsById {
  box: BoxLayoutOptions;
  fixed: FixedLayoutOptions;
  layered: LayeredLayoutOptions;
  random: RandomLayoutOptions;
  rectpacking: RectanglePackingLayoutOptions;
  sporeCompaction: SporeLayoutOptions;
  sporeOverlap: SporeLayoutOptions;
}

export type BuiltInLayoutAlgorithmId = keyof BuiltInLayoutOptionsById;

export const builtInLayoutAlgorithms = {
  box: boxAlgorithm,
  fixed: fixedAlgorithm,
  layered: layeredAlgorithm,
  random: randomAlgorithm,
  rectpacking: rectanglePackingAlgorithm,
  sporeCompaction: sporeCompactionAlgorithm,
  sporeOverlap: sporeOverlapRemovalAlgorithm,
} satisfies {
  [Id in BuiltInLayoutAlgorithmId]: LayoutAlgorithm<BuiltInLayoutOptionsById[Id]>;
};

const elkjs0111LayoutAlgorithms = {
  ...builtInLayoutAlgorithms,
  box: elkjs0111BoxAlgorithm,
  random: elkjs0111RandomAlgorithm,
  rectpacking: elkjs0111RectanglePackingAlgorithm,
} satisfies {
  [Id in BuiltInLayoutAlgorithmId]: LayoutAlgorithm<BuiltInLayoutOptionsById[Id]>;
};

export function getBuiltInLayoutAlgorithm(id: string): LayoutAlgorithm<unknown> | undefined {
  if (!Object.hasOwn(builtInLayoutAlgorithms, id)) return undefined;
  return builtInLayoutAlgorithms[id as BuiltInLayoutAlgorithmId] as
    | LayoutAlgorithm<unknown>
    | undefined;
}

interface ExecuteLayoutAlgorithmRequest<N, E, G, P, O> {
  algorithm: LayoutAlgorithm<O>;
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>;
  options: O;
  context: LayoutExecutionContext;
}

/** Execute one algorithm through the shared engine seam. */
export function executeLayoutAlgorithm<N, E, G, P, O>({
  algorithm,
  graph,
  options,
  context,
}: ExecuteLayoutAlgorithmRequest<N, E, G, P, O>):
  | VisualGraph<N, E, G, P>
  | Promise<VisualGraph<N, E, G, P>> {
  return algorithm.layout(graph, options, context);
}

function createDirectExecutionContext(): LayoutExecutionContext {
  return {
    scope: { mode: "full" },
    diagnostics: [],
    measurePhase(_id, run) {
      return run();
    },
    throwIfAborted() {},
  };
}

interface ExecuteBuiltInLayoutRequest<N, E, G, P, Id extends BuiltInLayoutAlgorithmId> {
  algorithm: Id;
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>;
  options: BuiltInLayoutOptionsById[Id];
}

/** Execute a built-in algorithm through the shared engine seam. */
export function executeBuiltInLayout<N, E, G, P, Id extends BuiltInLayoutAlgorithmId>({
  algorithm,
  graph,
  options,
}: ExecuteBuiltInLayoutRequest<N, E, G, P, Id>):
  | VisualGraph<N, E, G, P>
  | Promise<VisualGraph<N, E, G, P>> {
  return executeLayoutAlgorithm({
    algorithm: builtInLayoutAlgorithms[algorithm] as LayoutAlgorithm<BuiltInLayoutOptionsById[Id]>,
    graph,
    options,
    context: createDirectExecutionContext(),
  });
}

/** Execute through the pinned elkjs 0.11.1 compatibility policy. */
export function executeElkjs0111Layout<N, E, G, P, Id extends BuiltInLayoutAlgorithmId>({
  algorithm,
  graph,
  options,
}: ExecuteBuiltInLayoutRequest<N, E, G, P, Id>):
  | VisualGraph<N, E, G, P>
  | Promise<VisualGraph<N, E, G, P>> {
  return executeLayoutAlgorithm({
    algorithm: elkjs0111LayoutAlgorithms[algorithm] as LayoutAlgorithm<
      BuiltInLayoutOptionsById[Id]
    >,
    graph,
    options,
    context: createDirectExecutionContext(),
  });
}
