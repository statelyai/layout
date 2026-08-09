/*******************************************************************************
 * Copyright (c) 2010, 2015 Kiel University and others.
 *
 * Translated from ELK v0.11.0 RandomLayoutProvider.java.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { Graph, Point, VisualGraph, VisualNode } from "@statelyai/graph";
import { getNodeSize, type LayoutOptions } from "@statelyai/graph/layout";
import { getFixedLayout } from "./fixed";
import type { LayoutPadding } from "./layered";
import type { LayoutAlgorithm } from "./types";

export interface RandomLayoutOptions extends Pick<LayoutOptions, "direction" | "measure"> {
  spacing?: number;
  padding?: number | Partial<LayoutPadding>;
  aspectRatio?: number;
  seed?: number;
}

class JavaRandom {
  static readonly #multiplier = 0x5deece66dn;
  static readonly #addend = 0xbn;
  static readonly #mask = (1n << 48n) - 1n;
  #seed: bigint;

  constructor(seed: number) {
    this.#seed = (BigInt(seed) ^ JavaRandom.#multiplier) & JavaRandom.#mask;
  }

  #next(bits: number): number {
    this.#seed = (this.#seed * JavaRandom.#multiplier + JavaRandom.#addend) & JavaRandom.#mask;
    return Number(this.#seed >> BigInt(48 - bits));
  }

  nextDouble(): number {
    return (this.#next(26) * 2 ** 27 + this.#next(27)) / 2 ** 53;
  }

  nextFloat(): number {
    return this.#next(24) / 2 ** 24;
  }

  nextInt(bound: number): number {
    if (bound <= 0) throw new RangeError("bound must be positive");
    if ((bound & -bound) === bound) return Math.floor((bound * this.#next(31)) / 2 ** 31);
    let bits: number;
    let value: number;
    do {
      bits = this.#next(31);
      value = bits % bound;
    } while (bits - value + (bound - 1) >= 2 ** 31);
    return value;
  }
}

function getPadding(value: RandomLayoutOptions["padding"]): LayoutPadding {
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value };
  }
  return {
    top: value?.top ?? 15,
    right: value?.right ?? 15,
    bottom: value?.bottom ?? 15,
    left: value?.left ?? 15,
  };
}

function borderPoint(source: VisualNode, target: VisualNode): Point {
  const sourceCenter = {
    x: source.x + source.width / 2,
    y: source.y + source.height / 2,
  };
  const targetCenter = {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  if (dx === 0 && dy === 0) return { x: source.x + source.width, y: sourceCenter.y };
  const scale = Math.min(
    dx === 0 ? Infinity : source.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : source.height / 2 / Math.abs(dy),
  );
  return { x: sourceCenter.x + dx * scale, y: sourceCenter.y + dy * scale };
}

/** Seeded random distribution using Java's 48-bit `Random` sequence. */
export function getRandomLayout<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: RandomLayoutOptions = {},
): VisualGraph<N, E, G, P> {
  if (graph.nodes.length === 0) return getFixedLayout(graph, options);
  const random = new JavaRandom(options.seed && options.seed !== 0 ? options.seed : Date.now());
  const aspectRatio = Math.fround(options.aspectRatio ?? 1.6);
  const spacing = Math.fround(options.spacing ?? 15);
  const padding = getPadding(options.padding);
  const sizes = new Map(graph.nodes.map((node) => [node.id, getNodeSize(node, options)]));
  const nodeArea = [...sizes.values()].reduce((sum, size) => sum + size.width * size.height, 0);
  const maximumWidth = Math.max(...[...sizes.values()].map((size) => size.width));
  const maximumHeight = Math.max(...[...sizes.values()].map((size) => size.height));
  const edgeFactor = 1 + graph.edges.length;
  const drawArea = nodeArea + 2 * spacing * spacing * edgeFactor * graph.nodes.length;
  const areaRoot = Math.sqrt(drawArea);
  const drawWidth = Math.max(areaRoot * aspectRatio, maximumWidth);
  const drawHeight = Math.max(areaRoot / aspectRatio, maximumHeight);
  const nodes = graph.nodes.map((node): VisualNode<N, P> => {
    const size = sizes.get(node.id) ?? { width: 0, height: 0 };
    return {
      ...node,
      x: padding.left + random.nextDouble() * (drawWidth - size.width),
      // ELK v0.11.0 intentionally uses left padding for both axes here.
      y: padding.left + random.nextDouble() * (drawHeight - size.height),
      ...size,
    } as VisualNode<N, P>;
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const totalWidth = drawWidth + padding.left + padding.right;
  const totalHeight = drawHeight + padding.top + padding.bottom;
  const edges = graph.edges.map((edge) => {
    const source = nodeById.get(edge.sourceId);
    const target = nodeById.get(edge.targetId);
    if (!source || !target) return edge;
    const start = borderPoint(source, target);
    const end = borderPoint(target, source);
    const bendCount = random.nextInt(5) + (source === target ? 1 : 0);
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const maximumDeviation = distance * 0.2;
    const points: Point[] = [start];
    for (let index = 1; index <= bendCount; index++) {
      const progress = index / (bendCount + 1);
      points.push({
        x: Math.min(
          totalWidth - 1,
          Math.max(
            1,
            start.x +
              (end.x - start.x) * progress +
              random.nextFloat() * maximumDeviation -
              maximumDeviation / 2,
          ),
        ),
        y: Math.min(
          totalHeight - 1,
          Math.max(
            1,
            start.y +
              (end.y - start.y) * progress +
              random.nextFloat() * maximumDeviation -
              maximumDeviation / 2,
          ),
        ),
      });
    }
    points.push(end);
    return { ...edge, points, routing: "polyline" as const };
  });
  return getFixedLayout(
    { ...graph, nodes, edges },
    { direction: options.direction ?? graph.direction },
  );
}

export const randomAlgorithm: LayoutAlgorithm<RandomLayoutOptions> = {
  id: "random",
  capabilities: {
    full: true,
    incremental: false,
    partial: false,
    routeOnly: false,
    hierarchy: false,
    ports: false,
  },
  layout(graph, options) {
    return getRandomLayout(graph, options ?? {});
  },
};
