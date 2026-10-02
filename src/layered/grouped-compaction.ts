/*******************************************************************************
 * Copyright (c) 2017 Kiel University and others.
 *
 * Adapted from ELK v0.11.0 LGraphToCGraphTransformer.java,
 * HorizontalGraphCompactor.java and NetworkSimplexCompaction.java.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { EntityRect, Point } from "@statelyai/graph";
import type { AcyclicOrientation, EdgeRoutes, LayeredPhaseInput, NodePlacement } from "./types";
import { nodeNodeSpacing } from "./spacing";
import { solveWeightedCompaction, type CompactionConstraint } from "./weighted-compaction";

interface Compactable extends EntityRect {
  id: string;
  group: string;
  offset: number;
  nodeId?: string;
  edges: Set<string>;
  points: Point[];
}

/** Compact orthogonal geometry in canonical flow coordinates, retaining rigid port leads. */
export function applyGroupedEdgeLengthCompaction(
  input: LayeredPhaseInput,
  placement: NodePlacement,
  routes?: EdgeRoutes,
  orientation?: AcyclicOrientation,
): NodePlacement {
  const vertical = input.direction === "down" || input.direction === "up";
  const negative = input.direction === "left" || input.direction === "up";
  const pointToCanonical = (point: Point): Point => ({
    x: (negative ? -1 : 1) * (vertical ? point.y : point.x),
    y: vertical ? point.x : point.y,
  });
  const rectToCanonical = (rect: EntityRect): EntityRect => {
    const width = vertical ? rect.height : rect.width;
    const flow = vertical ? rect.y : rect.x;
    return {
      x: negative ? -flow - width : flow,
      y: vertical ? rect.x : rect.y,
      width,
      height: vertical ? rect.width : rect.height,
    };
  };
  const items: Compactable[] = [];
  const nodes = new Map<string, Compactable>();
  const groupOrigin = new Map<string, number>();
  for (const [id, rect] of placement.rectByNodeId) {
    const canonical = rectToCanonical(rect);
    const item: Compactable = {
      ...canonical,
      id: `node:${id}`,
      group: `node:${id}`,
      offset: 0,
      nodeId: id,
      edges: new Set(),
      points: [],
    };
    items.push(item);
    nodes.set(id, item);
    groupOrigin.set(item.group, item.x);
  }
  if (!items.length) return placement;
  const canonicalRoutes = new Map(
    [...(routes?.pointsByEdgeId ?? [])].map(([id, points]) => [id, points.map(pointToCanonical)]),
  );
  const edgeById = new Map(input.graph.edges.map((edge) => [edge.id, edge]));
  const endpointSide = (
    nodeId: string,
    portName: string | undefined,
    point: Point | undefined,
  ): string | undefined => {
    const node = input.graph.nodes.find((node) => node.id === nodeId);
    const port = node?.ports?.find((port) => port.name === portName);
    const side = node && port ? input.portSettings?.(port, node)?.["port.side"] : undefined;
    if (side && side !== "UNDEFINED") {
      if (!vertical)
        return negative && (side === "WEST" || side === "EAST")
          ? side === "WEST"
            ? "EAST"
            : "WEST"
          : side;
      if (side === "WEST") return "NORTH";
      if (side === "EAST") return "SOUTH";
      return side === (negative ? "NORTH" : "SOUTH") ? "EAST" : "WEST";
    }
    const rect = nodes.get(nodeId);
    if (!point || !rect) return undefined;
    if (point.x <= rect.x + 1e-9) return "WEST";
    if (point.x >= rect.x + rect.width - 1e-9) return "EAST";
    return point.y <= rect.y ? "NORTH" : "SOUTH";
  };
  const crossSide = (side: string | undefined) => side === "NORTH" || side === "SOUTH";
  const segments: Compactable[] = [];
  for (const [edgeId, points] of canonicalRoutes) {
    const edge = edgeById.get(edgeId);
    if (!edge) continue;
    for (let index = 0; index + 1 < points.length; index++) {
      const first = points[index]!;
      const second = points[index + 1]!;
      if (Math.abs(first.x - second.x) > 1e-9 || Math.abs(first.y - second.y) < 1e-9) continue;
      const owner =
        index === 0 && crossSide(endpointSide(edge.sourceId, edge.sourcePort, first))
          ? nodes.get(edge.sourceId)
          : index === points.length - 2 &&
              crossSide(endpointSide(edge.targetId, edge.targetPort, second))
            ? nodes.get(edge.targetId)
            : undefined;
      const id = `track:${edgeId}:${index}`;
      const group = owner?.group ?? id;
      if (!owner) groupOrigin.set(group, first.x);
      segments.push({
        id,
        group,
        offset: first.x - groupOrigin.get(group)!,
        x: first.x,
        y: Math.min(first.y, second.y),
        width: 0,
        height: Math.abs(second.y - first.y),
        edges: new Set([edgeId]),
        points: [first, second],
      });
    }
  }
  // ELK joins intersecting collinear segments before calculating constraints.
  segments.sort((a, b) => a.x - b.x || a.y - b.y);
  const merged: Compactable[] = [];
  for (const segment of segments) {
    const survivor = merged.at(-1);
    if (
      survivor &&
      Math.abs(survivor.x - segment.x) < 1e-9 &&
      segment.y <= survivor.y + survivor.height + 1e-9
    ) {
      survivor.height = Math.max(survivor.height, segment.y + segment.height - survivor.y);
      for (const edgeId of segment.edges) survivor.edges.add(edgeId);
      survivor.points.push(...segment.points);
      if (!survivor.group.startsWith("node:") && segment.group.startsWith("node:")) {
        survivor.group = segment.group;
        survivor.offset = survivor.x - groupOrigin.get(segment.group)!;
      }
    } else merged.push(segment);
  }
  items.push(...merged);
  const groups = [...new Set(items.map((item) => item.group))];
  const constraints: CompactionConstraint[] = [];
  const sameEdge = (a: Compactable, b: Compactable) =>
    !a.nodeId && !b.nodeId && [...a.edges].some((id) => b.edges.has(id));
  const spacing = (a: Compactable, b: Compactable, flow: boolean): number => {
    if (sameEdge(a, b)) return flow ? 0 : 1;
    if (!flow && a.nodeId && b.nodeId) return nodeNodeSpacing(input, a.nodeId, b.nodeId);
    const kind = (item: Compactable) =>
      !item.nodeId
        ? "long"
        : item.nodeId.startsWith("__layout_dummy:label:")
          ? "label"
          : item.nodeId.startsWith("__layout_dummy:") ||
              item.nodeId.startsWith("__layout_breaking:")
            ? "long"
            : "normal";
    const first = kind(a),
      second = kind(b);
    const key =
      first === "label" && second === "label"
        ? "spacing.edgeEdge"
        : first !== "long" && second !== "long"
          ? flow
            ? "spacing.layer"
            : "spacing.node"
          : first === "long" && second === "long"
            ? flow
              ? "spacing.edgeEdgeBetweenLayers"
              : "spacing.edgeEdge"
            : flow
              ? "spacing.edgeNodeBetweenLayers"
              : "spacing.edgeNode";
    let value =
      key === "spacing.layer"
        ? input.spacing.layer
        : key === "spacing.node"
          ? input.spacing.node
          : Number(input.settings[key] ?? 10);
    for (const item of [a, b]) {
      const node = input.graph.nodes.find((node) => node.id === item.nodeId);
      const individual = node ? input.nodeSettings?.(node)?.["spacing.individual"] : undefined;
      const local =
        individual && typeof individual === "object"
          ? (individual as Record<string, number>)[key]
          : undefined;
      if (local !== undefined && Number.isFinite(local)) value = Math.max(value, local);
    }
    return value;
  };
  for (const left of items) {
    for (const right of items) {
      if (left.group === right.group) continue;
      // ELK's scanline orders intervals by their centers, not their left borders.
      // A zero-width route column may sit left of a wide node's center while
      // still having a greater x coordinate than that node's left border.
      if (right.x + right.width / 2 <= left.x + left.width / 2 + 1e-9) continue;
      const crossSpacing = spacing(left, right, false);
      if (
        right.y + right.height + crossSpacing <= left.y + 1e-9 ||
        right.y >= left.y + left.height + crossSpacing - 1e-9
      )
        continue;
      if (sameEdge(left, right)) {
        const helper = `helper:${constraints.length}`;
        groups.push(helper);
        const delta = Math.ceil(right.offset - left.offset);
        constraints.push(
          { source: helper, target: left.group, delta: Math.max(0, delta), weight: 1 },
          { source: helper, target: right.group, delta: Math.max(0, -delta), weight: 1 },
        );
      } else
        constraints.push({
          source: left.group,
          target: right.group,
          delta: left.offset + left.width + spacing(left, right, true) - right.offset,
          weight: Boolean(left.nodeId) !== Boolean(right.nodeId) ? 2 : 1,
        });
    }
  }
  for (const edge of input.graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    const source = nodes.get(edge.sourceId),
      target = nodes.get(edge.targetId);
    if (!source || !target) continue;
    const points = canonicalRoutes.get(edge.id);
    const sourceSide = endpointSide(edge.sourceId, edge.sourcePort, points?.[0]);
    const targetSide = endpointSide(edge.targetId, edge.targetPort, points?.at(-1));
    if (crossSide(sourceSide) && crossSide(targetSide)) continue;
    const reversed = orientation?.reversedEdgeIds.has(edge.id) ?? source.x > target.x;
    const from = reversed ? target : source,
      to = reversed ? source : target;
    constraints.push({ source: from.group, target: to.group, delta: 0, weight: 100 });
    const fromSide = reversed ? targetSide : sourceSide;
    const toSide = reversed ? sourceSide : targetSide;
    for (const segment of merged) {
      if (!segment.edges.has(edge.id)) continue;
      if (fromSide === "WEST" && segment.x < from.x && segment.group !== from.group)
        constraints.push({
          source: segment.group,
          target: from.group,
          delta: 1,
          weight: 100,
        });
      if (toSide === "EAST" && segment.x > to.x + to.width && segment.group !== from.group)
        constraints.push({
          source: from.group,
          target: segment.group,
          delta: 1,
          weight: 100,
        });
    }
  }
  let solved: Map<string, number>;
  try {
    solved = solveWeightedCompaction(groups, constraints);
  } catch (error) {
    if (error instanceof Error)
      error.cause = {
        groups,
        constraints,
        items: items.map((item) => ({ ...item, edges: [...item.edges] })),
      };
    throw error;
  }
  const flowPadding = negative
    ? vertical
      ? input.padding.bottom
      : input.padding.right
    : vertical
      ? input.padding.top
      : input.padding.left;
  const offset =
    flowPadding - Math.min(...items.map((item) => solved.get(item.group)! + item.offset));
  const nodeDelta = new Map<string, number>();
  for (const item of items) {
    const x = solved.get(item.group)! + item.offset + offset;
    if (item.nodeId) nodeDelta.set(item.nodeId, x - item.x);
    for (const point of new Set(item.points)) point.x = x;
    item.x = x;
  }
  // Endpoints move with their node. Port leads already have the same rigid-group delta.
  for (const [edgeId, points] of canonicalRoutes) {
    const edge = edgeById.get(edgeId)!;
    const originals = routes!.pointsByEdgeId.get(edgeId)!;
    if (!points.length) continue;
    points[0] = {
      ...pointToCanonical(originals[0]!),
      x: pointToCanonical(originals[0]!).x + (nodeDelta.get(edge.sourceId) ?? 0),
    };
    const end = pointToCanonical(originals.at(-1)!);
    points[points.length - 1] = { ...end, x: end.x + (nodeDelta.get(edge.targetId) ?? 0) };
  }
  // Reflect negative directions around the new extent, preserving positive physical bounds.
  const extent = Math.max(
    ...items.map((item) => item.x + item.width),
    ...[...canonicalRoutes.values()].flatMap((points) => points.map((point) => point.x)),
  );
  const physicalPadding = vertical ? input.padding.top : input.padding.left;
  const pointFromCanonical = (point: Point): Point => {
    const flow = negative ? extent + physicalPadding - point.x : point.x;
    return vertical ? { x: point.y, y: flow } : { x: flow, y: point.y };
  };
  for (const [id, item] of nodes) {
    const point = pointFromCanonical({ x: item.x + (negative ? item.width : 0), y: item.y });
    (placement.rectByNodeId as Map<string, EntityRect>).set(id, {
      ...point,
      width: vertical ? item.height : item.width,
      height: vertical ? item.width : item.height,
    });
  }
  for (const [id, points] of canonicalRoutes) {
    (routes!.pointsByEdgeId as Map<string, readonly Point[]>).set(
      id,
      points.map(pointFromCanonical),
    );
  }
  return placement;
}
