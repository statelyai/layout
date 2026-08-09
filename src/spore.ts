import type { Graph, VisualGraph, VisualNode } from "@statelyai/graph";
import { getNodeSize, type LayoutOptions } from "@statelyai/graph/layout";
import { getFixedLayout } from "./fixed";
import type { LayoutPadding } from "./layered";
import type { LayoutAlgorithm } from "./types";

export interface SporeLayoutOptions extends Pick<LayoutOptions, "direction" | "measure"> {
  spacing?: number;
  padding?: number | Partial<LayoutPadding>;
}

function getPadding(value: SporeLayoutOptions["padding"]): LayoutPadding {
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value };
  }
  return {
    top: value?.top ?? 0,
    right: value?.right ?? 0,
    bottom: value?.bottom ?? 0,
    left: value?.left ?? 0,
  };
}

function getSporeLayout<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: SporeLayoutOptions,
  compact: boolean,
): VisualGraph<N, E, G, P> {
  const spacing = options.spacing ?? 20;
  const padding = getPadding(options.padding);
  const nodes: VisualNode<N, P>[] = [];

  graph.nodes.forEach((node, index) => {
    const size = getNodeSize(node, options);
    const previous = graph.nodes[index - 1];
    const placedPrevious = nodes[index - 1];
    if (!previous || !placedPrevious) {
      nodes.push({
        ...node,
        x: padding.left,
        y: padding.top,
        ...size,
      } as VisualNode<N, P>);
      return;
    }
    const deltaX = (node.x ?? 0) - (previous.x ?? 0);
    const deltaY = (node.y ?? 0) - (previous.y ?? 0);
    const requiredX = placedPrevious.width + spacing;
    const requiredY = placedPrevious.height + spacing;
    const distance = (delta: number, required: number): number => {
      if (delta === 0) return 0;
      const magnitude = compact ? required : Math.max(Math.abs(delta), required);
      return Math.sign(delta) * magnitude;
    };
    nodes.push({
      ...node,
      x: placedPrevious.x + distance(deltaX, requiredX),
      y: placedPrevious.y + distance(deltaY, requiredY),
      ...size,
    } as VisualNode<N, P>);
  });

  return getFixedLayout({ ...graph, nodes }, { direction: options.direction ?? graph.direction });
}

/** Compact an existing layout while preserving its relative directions. */
export function getSporeCompactionLayout<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: SporeLayoutOptions = {},
): VisualGraph<N, E, G, P> {
  return getSporeLayout(graph, options, true);
}

/** Remove overlap while preserving existing distances that already fit. */
export function getSporeOverlapRemovalLayout<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: SporeLayoutOptions = {},
): VisualGraph<N, E, G, P> {
  return getSporeLayout(graph, options, false);
}

function algorithm(
  id: "sporeCompaction" | "sporeOverlap",
  compact: boolean,
): LayoutAlgorithm<SporeLayoutOptions> {
  return {
    id,
    capabilities: {
      full: true,
      incremental: false,
      partial: false,
      routeOnly: false,
      hierarchy: false,
      ports: true,
    },
    layout(graph, options) {
      return getSporeLayout(graph, options ?? {}, compact);
    },
  };
}

export const sporeCompactionAlgorithm = algorithm("sporeCompaction", true);
export const sporeOverlapRemovalAlgorithm = algorithm("sporeOverlap", false);
