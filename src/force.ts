/*******************************************************************************
 * Copyright (c) 2011, 2018 Kiel University and others.
 * Derived from ELK v0.11.0 EadesModel, FruchtermanReingoldModel and StressMajorization.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { Graph, VisualGraph } from "@statelyai/graph";
import { LayoutError } from "./errors";
import {
  components,
  finishProvider,
  graphProviderCapabilities,
  nonnegative,
  providerGraph,
  type GraphProviderOptions,
} from "./internal/graph-provider";
import { JavaRandom } from "./java-random";
import type { LayoutAlgorithm, LayoutExecutionContext } from "./types";

export interface ForceLayoutOptions extends GraphProviderOptions {
  seed?: number;
  iterations?: number;
  model?: "EADES" | "FRUCHTERMAN_REINGOLD";
  temperature?: number;
  repulsion?: number;
  priority?: (node: VisualGraph["nodes"][number]) => number | undefined;
}
export interface StressLayoutOptions extends GraphProviderOptions {
  seed?: number;
  iterationLimit?: number;
  epsilon?: number;
  desiredEdgeLength?: number;
  edgeLength?: (edge: VisualGraph["edges"][number]) => number | undefined;
  fixed?: (node: VisualGraph["nodes"][number]) => boolean;
  dimension?: "XY" | "X" | "Y";
}
interface Particle {
  id: string;
  x: number;
  y: number;
  radius: number;
  width: number;
  height: number;
}

function iterationCount(value: number | undefined, fallback: number): number {
  const count = nonnegative(value, fallback, "iterations");
  if (!Number.isInteger(count) || count > 100000)
    throw new LayoutError("iterations must be an integer from 0 to 100000", "INVALID_OPTIONS");
  return count;
}
function particles(graph: VisualGraph, ids: readonly string[], seed: number): Particle[] {
  if (!Number.isSafeInteger(seed))
    throw new LayoutError("seed must be a safe integer", "INVALID_OPTIONS");
  const random = new JavaRandom(seed);
  const members = new Set(ids);
  const nodes = graph.nodes.filter((node) => members.has(node.id));
  const extent =
    Math.sqrt(nodes.length) *
    Math.max(50, ...nodes.map((node) => Math.hypot(node.width, node.height)));
  return nodes.map((node) => ({
    id: node.id,
    width: node.width,
    height: node.height,
    radius: Math.hypot(node.width, node.height) / 2,
    x: random.nextDouble() * extent,
    y: random.nextDouble() * extent,
  }));
}
function pack<N, E, G, P>(
  graph: VisualGraph<N, E, G, P>,
  groups: readonly Particle[][],
  options: GraphProviderOptions,
  preserveCoordinates = false,
): VisualGraph<N, E, G, P> {
  if (preserveCoordinates) {
    const positions = new Map(
      groups
        .flat()
        .map((node) => [node.id, { x: node.x - node.width / 2, y: node.y - node.height / 2 }]),
    );
    return finishProvider(
      { ...graph, nodes: graph.nodes.map((node) => ({ ...node, ...positions.get(node.id) })) },
      options,
      50,
      true,
    );
  }
  const positions = new Map<string, { x: number; y: number }>();
  let cursor = 0;
  for (const group of groups) {
    const minX = Math.min(...group.map((node) => node.x - node.width / 2));
    const minY = Math.min(...group.map((node) => node.y - node.height / 2));
    const maxX = Math.max(...group.map((node) => node.x + node.width / 2));
    for (const node of group)
      positions.set(node.id, {
        x: node.x - node.width / 2 - minX + cursor,
        y: node.y - node.height / 2 - minY,
      });
    cursor += maxX - minX + nonnegative(options.spacing, 50, "spacing");
  }
  return finishProvider(
    { ...graph, nodes: graph.nodes.map((node) => ({ ...node, ...positions.get(node.id) })) },
    options,
    50,
  );
}

/** Seeded Eades logarithmic springs or Fruchterman-Reingold attraction/repulsion. */
export function getForceLayout<N, E, G, P>(
  input: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: ForceLayoutOptions = {},
  context?: Pick<LayoutExecutionContext, "throwIfAborted">,
): VisualGraph<N, E, G, P> {
  const graph = providerGraph(input, options);
  const spacing = Math.max(1e-6, nonnegative(options.spacing, 50, "spacing"));
  const iterations = iterationCount(options.iterations, 300);
  const temperature = nonnegative(options.temperature, 0.001, "temperature");
  const repulsion = nonnegative(options.repulsion, 5, "repulsion");
  const model = options.model ?? "FRUCHTERMAN_REINGOLD";
  if (
    options.model !== undefined &&
    options.model !== "EADES" &&
    options.model !== "FRUCHTERMAN_REINGOLD"
  )
    throw new LayoutError("Unknown force model", "INVALID_OPTIONS");
  const priority = new Map(
    graph.nodes.map((node) => [node.id, nonnegative(options.priority?.(node), 1, "priority")]),
  );
  const orderedComponents = components(graph)
    .map((ids) => ({ ids, priority: ids.reduce((sum, id) => sum + (priority.get(id) ?? 1), 0) }))
    .sort((a, b) => b.priority - a.priority);
  const groups = orderedComponents.map(({ ids }) => {
    const points = particles(graph, ids, options.seed ?? 1);
    const index = new Map(points.map((point, i) => [point.id, i]));
    const connection = points.map(() => points.map(() => 0));
    for (const edge of graph.edges) {
      const i = index.get(edge.sourceId),
        j = index.get(edge.targetId);
      if (i !== undefined && j !== undefined && i !== j) {
        connection[i]![j]!++;
        connection[j]![i]!++;
      }
    }
    const area =
      points.reduce((sum, point) => sum + point.width, 0) *
      points.reduce((sum, point) => sum + point.height, 0);
    const k = Math.max(1e-6, Math.sqrt(area / Math.max(1, 2 * points.length)) * spacing * 0.01);
    for (let iteration = 0; iteration < iterations; iteration++) {
      context?.throwIfAborted();
      const cooling = 1 - iteration / Math.max(1, iterations);
      const displacements = points.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) {
          const a = points[i]!,
            b = points[j]!;
          let dx = b.x - a.x,
            dy = b.y - a.y;
          if (dx === 0 && dy === 0) {
            dx = 1e-3;
            dy = (i + j + 1) * 1e-3;
          }
          const length = Math.hypot(dx, dy);
          const gap = Math.max(0, length - a.radius - b.radius);
          const count = connection[i]?.[j] ?? 0;
          const repel =
            model === "FRUCHTERMAN_REINGOLD"
              ? gap > 0
                ? (k * k) / gap
                : k * k * 100
              : count
                ? 0
                : gap > 0
                  ? repulsion / (gap * gap)
                  : repulsion * 100;
          const attract =
            model === "FRUCHTERMAN_REINGOLD"
              ? (count * gap * gap) / k
              : count * (gap > 0 ? Math.log(gap / spacing) : -100);
          const scale = model === "FRUCHTERMAN_REINGOLD" ? temperature * cooling : 0.1;
          const forceA = (repel * (priority.get(b.id) ?? 1) - attract) * scale;
          const forceB = (repel * (priority.get(a.id) ?? 1) - attract) * scale;
          displacements[i]!.x -= (dx / length) * forceA;
          displacements[i]!.y -= (dy / length) * forceA;
          displacements[j]!.x += (dx / length) * forceB;
          displacements[j]!.y += (dy / length) * forceB;
        }
      for (let i = 0; i < points.length; i++) {
        const point = points[i]!,
          displacement = displacements[i]!;
        const length = Math.hypot(displacement.x, displacement.y);
        const limit = Math.max(1, spacing * cooling);
        const scale = length > limit ? limit / length : 1;
        point.x += displacement.x * scale;
        point.y += displacement.y * scale;
      }
    }
    return points;
  });
  return pack(graph, groups, options);
}

/** Localized stress majorization over weighted all-pairs shortest-path distances. */
export function getStressLayout<N, E, G, P>(
  input: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: StressLayoutOptions = {},
  context?: Pick<LayoutExecutionContext, "throwIfAborted">,
): VisualGraph<N, E, G, P> {
  const graph = providerGraph(input, options);
  const iterations = iterationCount(options.iterationLimit, 200);
  const epsilon = nonnegative(options.epsilon, 0.001, "epsilon");
  const desired = Math.max(1e-6, nonnegative(options.desiredEdgeLength, 100, "desiredEdgeLength"));
  if (options.dimension !== undefined && !["XY", "X", "Y"].includes(options.dimension))
    throw new LayoutError("Unknown stress dimension", "INVALID_OPTIONS");
  const groups = components(graph).map((ids) => {
    const points = particles(graph, ids, options.seed ?? 1);
    const index = new Map(points.map((point, i) => [point.id, i]));
    const distances = points.map((_, i) => points.map((_, j) => (i === j ? 0 : Infinity)));
    const fixed = new Set(
      graph.nodes.filter((node) => options.fixed?.(node)).map((node) => node.id),
    );
    for (const point of points) {
      const authored = input.nodes.find((node) => node.id === point.id);
      if (authored) {
        if (fixed.has(point.id) || options.dimension === "Y")
          point.x = (authored.x ?? 0) + point.width / 2;
        if (fixed.has(point.id) || options.dimension === "X")
          point.y = (authored.y ?? 0) + point.height / 2;
      }
    }
    for (const edge of graph.edges) {
      const i = index.get(edge.sourceId),
        j = index.get(edge.targetId);
      if (i === undefined || j === undefined || i === j) continue;
      const length = Math.max(1e-6, nonnegative(options.edgeLength?.(edge), desired, "edgeLength"));
      distances[i]![j] = Math.min(distances[i]![j]!, length);
      distances[j]![i] = distances[i]![j]!;
    }
    for (let k = 0; k < points.length; k++)
      for (let i = 0; i < points.length; i++)
        for (let j = 0; j < points.length; j++) {
          distances[i]![j] = Math.min(distances[i]![j]!, distances[i]![k]! + distances[k]![j]!);
        }
    let previousStress = Infinity;
    for (let iteration = 0; iteration < iterations; iteration++) {
      context?.throwIfAborted();
      for (let i = 0; i < points.length; i++) {
        const point = points[i]!;
        if (fixed.has(point.id)) continue;
        let sumX = 0,
          sumY = 0,
          weightSum = 0;
        for (let j = 0; j < points.length; j++) {
          if (i === j) continue;
          const other = points[j]!,
            target = distances[i]![j]!;
          if (!Number.isFinite(target)) continue;
          const weight = 1 / (target * target);
          const distance = Math.max(1e-9, Math.hypot(point.x - other.x, point.y - other.y));
          sumX += weight * (other.x + (target * (point.x - other.x)) / distance);
          sumY += weight * (other.y + (target * (point.y - other.y)) / distance);
          weightSum += weight;
        }
        if (weightSum > 0) {
          if (options.dimension !== "Y") point.x = sumX / weightSum;
          if (options.dimension !== "X") point.y = sumY / weightSum;
        }
      }
      let stress = 0;
      for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) {
          const target = distances[i]![j]!,
            a = points[i]!,
            b = points[j]!;
          stress += Math.pow((Math.hypot(a.x - b.x, a.y - b.y) - target) / target, 2);
        }
      if (
        stress === 0 ||
        (Number.isFinite(previousStress) && (previousStress - stress) / previousStress < epsilon)
      )
        break;
      previousStress = stress;
    }
    return points;
  });
  const preserveCoordinates =
    options.dimension === "X" ||
    options.dimension === "Y" ||
    graph.nodes.some((node) => options.fixed?.(node));
  return pack(graph, groups, options, preserveCoordinates);
}

export const forceAlgorithm: LayoutAlgorithm<ForceLayoutOptions> = {
  id: "force",
  capabilities: graphProviderCapabilities,
  layout: (graph, options, context) => getForceLayout(graph, options, context),
};
export const stressAlgorithm: LayoutAlgorithm<StressLayoutOptions> = {
  id: "stress",
  capabilities: graphProviderCapabilities,
  layout: (graph, options, context) => getStressLayout(graph, options, context),
};
