import type { Graph, VisualGraph, VisualNode } from "@statelyai/graph";
import { getNodeSize, type LayoutOptions } from "@statelyai/graph/layout";
import { getFixedLayout } from "./fixed";
import type { LayoutPadding } from "./layered";
import type { LayoutAlgorithm } from "./types";

export interface RectanglePackingLayoutOptions extends Pick<
  LayoutOptions,
  "direction" | "measure"
> {
  spacing?: number;
  padding?: number | Partial<LayoutPadding>;
  targetWidth?: number;
}

function getPadding(value: RectanglePackingLayoutOptions["padding"]): LayoutPadding {
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

/** Deterministic shelf-based rectangle packing for `@statelyai/graph`. */
export function getRectanglePackingLayout<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: RectanglePackingLayoutOptions = {},
): VisualGraph<N, E, G, P> {
  const spacing = options.spacing ?? 20;
  const padding = getPadding(options.padding);
  const sizes = new Map(graph.nodes.map((node) => [node.id, getNodeSize(node, options)]));
  const totalArea = [...sizes.values()].reduce(
    (area, size) => area + (size.width + spacing) * (size.height + spacing),
    0,
  );
  const targetWidth = options.targetWidth ?? Math.max(1, Math.sqrt(totalArea) * 1.5);
  let x = padding.left;
  let y = padding.top;
  let rowHeight = 0;
  const nodes: VisualNode<N, P>[] = [];

  for (const node of graph.nodes) {
    const size = sizes.get(node.id) ?? { width: 0, height: 0 };
    if (x > padding.left && x + size.width > padding.left + targetWidth) {
      x = padding.left;
      y += rowHeight + spacing;
      rowHeight = 0;
    }
    nodes.push({ ...node, x, y, ...size } as VisualNode<N, P>);
    x += size.width + spacing;
    rowHeight = Math.max(rowHeight, size.height);
  }

  return getFixedLayout({ ...graph, nodes }, { direction: options.direction ?? graph.direction });
}

export const rectanglePackingAlgorithm: LayoutAlgorithm<RectanglePackingLayoutOptions> = {
  id: "rectpacking",
  capabilities: {
    full: true,
    incremental: false,
    partial: false,
    routeOnly: false,
    hierarchy: false,
    ports: true,
  },
  layout(graph, options) {
    return getRectanglePackingLayout(graph, options ?? {});
  },
};
