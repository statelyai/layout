/*******************************************************************************
 * Copyright (c) 2009, 2020 Kiel University and others.
 *
 * Translated from ELK v0.11.0 BoxLayoutProvider.java SIMPLE mode.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { Graph, GraphNode, VisualGraph, VisualNode } from "@statelyai/graph";
import { getNodeSize, type LayoutOptions } from "@statelyai/graph/layout";
import { getFixedLayout } from "./fixed";
import type { LayoutPadding } from "./layered";
import type { LayoutAlgorithm } from "./types";

export interface BoxLayoutOptions extends Pick<LayoutOptions, "direction" | "measure"> {
  spacing?: number;
  padding?: number | Partial<LayoutPadding>;
  aspectRatio?: number;
  interactive?: boolean;
  expandNodes?: boolean;
  priority?: (node: GraphNode) => number | undefined;
}

function getPadding(value: BoxLayoutOptions["padding"]): LayoutPadding {
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

function standardDeviation(values: readonly number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return Math.sqrt(variance / (values.length - 1));
}

/** ELK Box SIMPLE packing translated onto `@statelyai/graph`. */
export function getBoxLayout<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: BoxLayoutOptions = {},
): VisualGraph<N, E, G, P> {
  const spacing = Math.fround(options.spacing ?? 15);
  const padding = getPadding(options.padding);
  const aspectRatio = (options.aspectRatio ?? 1.3) > 0 ? (options.aspectRatio ?? 1.3) : 1.3;
  const sizes = new Map(graph.nodes.map((node) => [node.id, getNodeSize(node, options)]));
  const sortedNodes = [...graph.nodes].sort((first, second) => {
    const priorityDifference = (options.priority?.(second) ?? 0) - (options.priority?.(first) ?? 0);
    if (priorityDifference !== 0) return priorityDifference;
    if (options.interactive) {
      const yDifference = (first.y ?? 0) - (second.y ?? 0);
      if (yDifference !== 0) return yDifference;
      const xDifference = (first.x ?? 0) - (second.x ?? 0);
      if (xDifference !== 0) return xDifference;
    }
    const firstSize = sizes.get(first.id) ?? { width: 0, height: 0 };
    const secondSize = sizes.get(second.id) ?? { width: 0, height: 0 };
    return firstSize.width * firstSize.height - secondSize.width * secondSize.height;
  });

  const areas = sortedNodes.map((node) => {
    const size = sizes.get(node.id) ?? { width: 0, height: 0 };
    return size.width * size.height;
  });
  let totalArea = areas.reduce((sum, area) => sum + area, 0);
  const mean = areas.length === 0 ? 0 : totalArea / areas.length;
  totalArea += areas.length * standardDeviation(areas, mean);
  totalArea += Math.sqrt(totalArea) * (padding.bottom + padding.top);
  totalArea += Math.sqrt(totalArea) * padding.right;
  const widestNode = Math.max(0, ...sortedNodes.map((node) => sizes.get(node.id)?.width ?? 0));
  const maximumRowWidth = Math.max(widestNode, Math.sqrt(totalArea * aspectRatio)) + padding.left;

  let x = padding.left;
  let y = padding.top;
  let rowHeight = 0;
  let rowStart = 0;
  const rows: Array<{ start: number; end: number; height: number }> = [];
  const nodes: VisualNode<N, P>[] = [];
  for (const node of sortedNodes) {
    const size = sizes.get(node.id) ?? { width: 0, height: 0 };
    if (x + size.width > maximumRowWidth) {
      rows.push({ start: rowStart, end: nodes.length, height: rowHeight });
      rowStart = nodes.length;
      x = padding.left;
      y += rowHeight + spacing;
      rowHeight = 0;
    }
    nodes.push({ ...node, x, y, ...size } as VisualNode<N, P>);
    x += size.width + spacing;
    rowHeight = Math.max(rowHeight, size.height);
  }
  rows.push({ start: rowStart, end: nodes.length, height: rowHeight });

  if (options.expandNodes) {
    const broadestRow = Math.max(
      padding.left + padding.right,
      ...nodes.map((node) => node.x + node.width + padding.right),
    );
    for (const row of rows) {
      for (let index = row.start; index < row.end; index++) {
        const node = nodes[index];
        if (!node) continue;
        node.height = row.height;
        if (index === row.end - 1) node.width = broadestRow - node.x - padding.right;
      }
    }
  }

  const placedById = new Map(nodes.map((node) => [node.id, node]));
  return getFixedLayout(
    {
      ...graph,
      nodes: graph.nodes.map((node) => placedById.get(node.id) ?? node) as VisualNode<N, P>[],
    },
    { direction: options.direction ?? graph.direction },
  );
}

export const boxAlgorithm: LayoutAlgorithm<BoxLayoutOptions> = {
  id: "box",
  capabilities: {
    full: true,
    incremental: false,
    partial: false,
    routeOnly: false,
    hierarchy: false,
    ports: true,
  },
  layout(graph, options) {
    return getBoxLayout(graph, options ?? {});
  },
};
