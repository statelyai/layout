import { getGraphIssues, type Graph, type GraphPatch, type VisualGraph } from "@statelyai/graph";
import { LayoutError, UnsupportedLayoutError } from "./errors";
import { fixedAlgorithm } from "./fixed";
import { layeredAlgorithm } from "./layered";
import { rectanglePackingAlgorithm } from "./packing";
import { sporeCompactionAlgorithm, sporeOverlapRemovalAlgorithm } from "./spore";
import type {
  LayoutAlgorithm,
  LayoutDiagnostic,
  LayoutExecutionContext,
  LayoutPhaseMetrics,
  LayoutRequest,
  LayoutResult,
  LayoutScope,
} from "./types";

const algorithms = new Map<string, LayoutAlgorithm<never>>([
  ["layered", layeredAlgorithm as LayoutAlgorithm<never>],
  ["fixed", fixedAlgorithm as LayoutAlgorithm<never>],
  ["rectpacking", rectanglePackingAlgorithm as LayoutAlgorithm<never>],
  ["sporeCompaction", sporeCompactionAlgorithm as LayoutAlgorithm<never>],
  ["sporeOverlap", sporeOverlapRemovalAlgorithm as LayoutAlgorithm<never>],
]);

function supportsScope(algorithm: LayoutAlgorithm<unknown>, scope: LayoutScope): boolean {
  switch (scope.mode) {
    case "full":
      return algorithm.capabilities.full;
    case "incremental":
      return algorithm.capabilities.incremental;
    case "partial":
      return algorithm.capabilities.partial;
    case "route-only":
      return algorithm.capabilities.routeOnly;
  }
}

function samePoints(
  a: readonly { x: number; y: number }[] | undefined,
  b: readonly { x: number; y: number }[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((point, index) => {
    const other = b[index];
    return other !== undefined && point.x === other.x && point.y === other.y;
  });
}

function getLayoutPatches<N, E, G, P>(
  input: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  output: VisualGraph<N, E, G, P>,
): GraphPatch<N, E>[] {
  const patches: GraphPatch<N, E>[] = [];
  const outputNodes = new Map(output.nodes.map((node) => [node.id, node]));
  const outputEdges = new Map(output.edges.map((edge) => [edge.id, edge]));

  for (const node of input.nodes) {
    const next = outputNodes.get(node.id);
    if (!next) continue;
    if (
      node.x !== next.x ||
      node.y !== next.y ||
      node.width !== next.width ||
      node.height !== next.height ||
      node.ports !== next.ports
    ) {
      patches.push({
        op: "updateNode",
        id: node.id,
        data: {
          x: next.x,
          y: next.y,
          width: next.width,
          height: next.height,
          ...(next.ports === undefined ? {} : { ports: next.ports }),
        },
        description: "Apply layout geometry",
      });
    }
  }
  for (const edge of input.edges) {
    const next = outputEdges.get(edge.id);
    if (!next) continue;
    if (
      edge.x !== next.x ||
      edge.y !== next.y ||
      edge.width !== next.width ||
      edge.height !== next.height ||
      edge.routing !== next.routing ||
      !samePoints(edge.points, next.points)
    ) {
      patches.push({
        op: "updateEdge",
        id: edge.id,
        data: {
          x: next.x,
          y: next.y,
          width: next.width,
          height: next.height,
          ...(next.routing === undefined ? {} : { routing: next.routing }),
          ...(next.points === undefined ? {} : { points: next.points }),
        },
        description: "Apply layout geometry",
      });
    }
  }
  return patches;
}

/** Register or replace a layout algorithm for subsequent `getLayout` calls. */
export function registerLayoutAlgorithm<O>(algorithm: LayoutAlgorithm<O>): () => void {
  const previous = algorithms.get(algorithm.id);
  algorithms.set(algorithm.id, algorithm as LayoutAlgorithm<never>);
  return () => {
    if (previous) algorithms.set(algorithm.id, previous);
    else algorithms.delete(algorithm.id);
  };
}

export function getLayoutAlgorithm(id: string): LayoutAlgorithm<unknown> | undefined {
  return algorithms.get(id) as LayoutAlgorithm<unknown> | undefined;
}

/**
 * Run a registered or inline algorithm against an `@statelyai/graph` graph.
 * The input is not mutated.
 */
export async function getLayout<N, E, G, P, O = unknown>(
  request: LayoutRequest<N, E, G, P, O>,
): Promise<LayoutResult<N, E, G, P>> {
  const startedAt = performance.now();
  const scope = request.scope ?? { mode: "full" };
  const diagnostics: LayoutDiagnostic[] = [];
  const phases: LayoutPhaseMetrics[] = [];
  const algorithm =
    typeof request.algorithm === "object"
      ? request.algorithm
      : getLayoutAlgorithm(request.algorithm ?? "layered");

  if (!algorithm) {
    throw new LayoutError(
      `Unknown layout algorithm: ${request.algorithm ?? "layered"}`,
      "UNKNOWN_ALGORITHM",
    );
  }
  if (!supportsScope(algorithm as LayoutAlgorithm<unknown>, scope)) {
    throw new UnsupportedLayoutError(`${algorithm.id} does not support ${scope.mode} layout yet`);
  }

  const issues = getGraphIssues(request.graph as Graph);
  if (issues.length > 0) {
    throw new LayoutError(issues.map((issue) => issue.message).join("; "), "INVALID_GRAPH");
  }

  const context: LayoutExecutionContext = {
    scope,
    diagnostics,
    ...(request.signal === undefined ? {} : { signal: request.signal }),
    measurePhase(id, run) {
      const phaseStartedAt = performance.now();
      const record = () => {
        phases.push({ id, durationMs: performance.now() - phaseStartedAt });
      };
      try {
        const result = run();
        if (result instanceof Promise) {
          return result.finally(record) as typeof result;
        }
        record();
        return result;
      } catch (error) {
        record();
        throw error;
      }
    },
    throwIfAborted() {
      if (request.signal?.aborted) {
        throw request.signal.reason ?? new Error("Layout aborted");
      }
    },
  };
  context.throwIfAborted();
  const graph = await algorithm.layout(request.graph, request.options as O, context);
  context.throwIfAborted();

  return {
    graph,
    patches: getLayoutPatches(request.graph, graph),
    diagnostics,
    metrics: {
      durationMs: performance.now() - startedAt,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      phases,
    },
  };
}
