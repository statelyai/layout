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
import { loopEnvelopes } from "./loop-envelopes";
import { compactionBounds, recordCompactionBounds } from "./compaction-bounds";
import { InfeasibleCompactionError } from "./compaction-errors";
import { scanlineConstraints } from "./compaction-scanline";
import { preparePortMargins, portCrossMargins } from "./node-margins";
import { nodeNodeSpacing } from "./spacing";
import { solveWeightedCompaction, type CompactionConstraint } from "./weighted-compaction";

interface Compactable extends EntityRect {
  id: string;
  group: string;
  offset: number;
  nodeId?: string;
  edges: Set<string>;
  points: Point[];
  ignoreUp?: boolean;
  ignoreDown?: boolean;
}

/** ELK removes LONG_EDGE dummies before the compactor, while LABEL nodes remain. */
export function applyGroupedEdgeLengthCompaction(
  input: LayeredPhaseInput,
  placement: NodePlacement,
  routes?: EdgeRoutes,
  orientation?: AcyclicOrientation,
): NodePlacement {
  if (!routes) return compactJoinedGeometry(input, placement, routes, orientation);
  const incoming = new Map<string, (typeof input.graph.edges)[number][]>();
  const outgoing = new Map<string, (typeof input.graph.edges)[number][]>();
  for (const edge of input.graph.edges) {
    incoming.set(edge.targetId, [...(incoming.get(edge.targetId) ?? []), edge]);
    outgoing.set(edge.sourceId, [...(outgoing.get(edge.sourceId) ?? []), edge]);
  }
  const removed = new Set(
    input.graph.nodes
      .filter(
        (node) =>
          node.id.startsWith("__layout_dummy:") &&
          !node.id.startsWith("__layout_dummy:label:") &&
          ((incoming.get(node.id)?.length === 1 && outgoing.get(node.id)?.length === 1) ||
            (!node.id.startsWith("__layout_dummy:north-south:") &&
              (input.sizes.get(node.id)?.width ?? 0) === 0 &&
              (input.sizes.get(node.id)?.height ?? 0) === 0 &&
              (incoming.get(node.id)?.length ?? 0) > 0 &&
              (outgoing.get(node.id)?.length ?? 0) > 0)),
      )
      .map((node) => node.id),
  );
  if (!removed.size) return compactJoinedGeometry(input, placement, routes, orientation);
  const joinedEdges: (typeof input.graph.edges)[number][] = [];
  const joinedPoints = new Map<string, readonly Point[]>();
  for (const edge of input.graph.edges) {
    if (removed.has(edge.sourceId)) continue;
    const chain = [edge];
    let last = edge;
    const visited = new Set([edge.id]);
    while (removed.has(last.targetId)) {
      const candidates = outgoing.get(last.targetId)!;
      // Merged hyperedge dummies have several outgoing chains. Continue the
      // original edge's chain, rather than choosing another branch's edge.
      const family = last.id.replace(/(?:::(?:segment|inverted):\d+)+$/, "");
      const next =
        candidates.length === 1
          ? candidates[0]!
          : candidates.find(
              (candidate) =>
                candidate.id.replace(/(?:::(?:segment|inverted):\d+)+$/, "") === family,
            );
      if (!next)
        throw new Error("Missing continuation through a merged long-edge dummy", {
          cause: {
            last: last.id,
            node: last.targetId,
            candidates: candidates.map((edge) => edge.id),
          },
        });
      if (visited.has(next.id)) throw new Error("Cyclic long-edge dummy chain");
      visited.add(next.id);
      chain.push(next);
      last = next;
    }
    joinedEdges.push({ ...edge, targetId: last.targetId, targetPort: last.targetPort });
    joinedPoints.set(
      edge.id,
      chain.flatMap((part) => [...(routes.pointsByEdgeId.get(part.id) ?? [])]),
    );
  }
  const before = new Map(joinedPoints);
  const joinedRoutes = { ...routes, pointsByEdgeId: joinedPoints };
  const rects = new Map([...placement.rectByNodeId].filter(([id]) => !removed.has(id)));
  const joinedPlacement = { ...placement, rectByNodeId: rects };
  compactJoinedGeometry(
    {
      ...input,
      graph: {
        ...input.graph,
        nodes: input.graph.nodes.filter((n) => !removed.has(n.id)),
        edges: joinedEdges,
      },
    },
    joinedPlacement,
    joinedRoutes,
    orientation,
  );
  routes.junctionPointsByEdgeId = joinedRoutes.junctionPointsByEdgeId;
  const bounds = compactionBounds(joinedPlacement);
  if (bounds) recordCompactionBounds(placement, bounds);
  for (const [id, rect] of rects) (placement.rectByNodeId as Map<string, EntityRect>).set(id, rect);
  const moved = new Map<Point, Point>();
  for (const [id, points] of before) {
    const after = joinedRoutes.pointsByEdgeId.get(id)!;
    points.forEach((point, index) => moved.set(point, after[index]!));
  }
  for (const [id, points] of routes.pointsByEdgeId)
    (routes.pointsByEdgeId as Map<string, readonly Point[]>).set(
      id,
      points.map((point) => moved.get(point) ?? point),
    );
  return placement;
}

/** Compact orthogonal geometry in canonical flow coordinates, retaining rigid port leads. */
function compactJoinedGeometry(
  input: LayeredPhaseInput,
  placement: NodePlacement,
  routes?: EdgeRoutes,
  orientation?: AcyclicOrientation,
): NodePlacement {
  try {
    return compactJoinedGeometryUnchecked(input, placement, routes, orientation);
  } catch (error) {
    // Compaction is transactional: only apply positions after a complete solve.
    // Degenerate port leads can make the visibility relation infeasible. Keep
    // the initial layout/routes rather than publishing partial or NaN geometry.
    if (error instanceof InfeasibleCompactionError) return placement;
    throw error;
  }
}

function compactJoinedGeometryUnchecked(
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
  preparePortMargins(input, placement.rectByNodeId, orientation);
  const contentRects = new Map<string, EntityRect>();
  const items: Compactable[] = [];
  const nodes = new Map<string, Compactable>();
  const groupOrigin = new Map<string, number>();
  // Compaction must retain label clearance reserved before placement;
  // route bends alone measure only the loop line's smaller envelope.
  const loopMargins = loopEnvelopes(input);
  for (const [id, rect] of placement.rectByNodeId) {
    const content = rectToCanonical(rect);
    contentRects.set(id, content);
    const portMargins = portCrossMargins(input, id);
    const loopMargin = loopMargins.get(id);
    const margins = {
      before: Math.max(portMargins?.before ?? 0, loopMargin?.before ?? 0),
      after: Math.max(portMargins?.after ?? 0, loopMargin?.after ?? 0),
      flowBefore: Math.max(portMargins?.flowBefore ?? 0, loopMargin?.flowBefore ?? 0),
      flowAfter: Math.max(portMargins?.flowAfter ?? 0, loopMargin?.flowAfter ?? 0),
    };
    // Self-loop routes belong to their owner's hitbox in ELK's compaction graph.
    // Reserve their measured envelope before clipping rigid port leads.
    for (const edge of input.graph.edges) {
      if (edge.sourceId !== id || edge.targetId !== id) continue;
      const points = routes?.pointsByEdgeId.get(edge.id)?.map(pointToCanonical) ?? [];
      for (const point of points) {
        margins.before = Math.max(margins.before, content.y - point.y);
        margins.after = Math.max(margins.after, point.y - content.y - content.height);
        margins.flowBefore = Math.max(margins.flowBefore, content.x - point.x);
        margins.flowAfter = Math.max(margins.flowAfter, point.x - content.x - content.width);
      }
    }
    const canonical = {
      x: content.x - (margins?.flowBefore ?? 0),
      y: content.y - (margins?.before ?? 0),
      width: content.width + (margins?.flowBefore ?? 0) + (margins?.flowAfter ?? 0),
      height: content.height + (margins?.before ?? 0) + (margins?.after ?? 0),
    };
    const item: Compactable = {
      ...canonical,
      id: `node:${id}`,
      group: `node:${id}`,
      offset: -(margins?.flowBefore ?? 0),
      nodeId: id,
      edges: new Set(),
      points: [],
    };
    items.push(item);
    nodes.set(id, item);
    groupOrigin.set(item.group, content.x);
  }
  if (!items.length) return placement;
  const canonicalRoutes = new Map(
    [...(routes?.pointsByEdgeId ?? [])].map(([id, points]) => [id, points.map(pointToCanonical)]),
  );
  const canonicalJunctions =
    routes?.junctionPointsByEdgeId &&
    new Map(
      [...routes.junctionPointsByEdgeId].map(([id, points]) => [id, points.map(pointToCanonical)]),
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
    const rect = contentRects.get(nodeId);
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
    const edgeSegments: Compactable[] = [];
    for (let index = 0; index + 1 < points.length; index++) {
      const first = points[index]!;
      const second = points[index + 1]!;
      if (Math.abs(first.x - second.x) > 1e-9 || Math.abs(first.y - second.y) < 1e-9) continue;
      // The ELK transformer collects endpoint leads only on cross-axis faces.
      // Flow-face endpoints are not bends, even when a split label route turns
      // vertically immediately beside its temporary endpoint.
      if (index === 0 && !crossSide(endpointSide(edge.sourceId, edge.sourcePort, first))) continue;
      if (
        index === points.length - 2 &&
        !crossSide(endpointSide(edge.targetId, edge.targetPort, second))
      )
        continue;
      const owner =
        index === 0
          ? nodes.get(edge.sourceId)
          : index === points.length - 2
            ? nodes.get(edge.targetId)
            : undefined;
      // ELK constructs port-lead spans from the first bend to the margin
      // border, including bends lying inside the owner's reserved envelope.
      const ownerSide = owner
        ? endpointSide(
            index === 0 ? edge.sourceId : edge.targetId,
            index === 0 ? edge.sourcePort : edge.targetPort,
            index === 0 ? first : second,
          )
        : undefined;
      const bend = index === 0 ? second : first;
      const border = ownerSide === "NORTH" ? owner?.y : owner && owner.y + owner.height;
      const segmentStart = owner ? Math.min(bend.y, border!) : Math.min(first.y, second.y);
      const segmentEnd = owner ? Math.max(bend.y, border!) : Math.max(first.y, second.y);
      const id = `track:${edgeId}:${index}`;
      const group = owner?.group ?? id;
      if (!owner) groupOrigin.set(group, first.x);
      const segment: Compactable = {
        id,
        group,
        offset: first.x - groupOrigin.get(group)!,
        x: first.x,
        y: segmentStart,
        width: 0,
        height: Math.max(0, segmentEnd - segmentStart),
        edges: new Set([edgeId]),
        points: [first, second],
        ignoreUp: owner ? ownerSide === "SOUTH" : false,
        ignoreDown: owner ? ownerSide === "NORTH" : false,
      };
      segments.push(segment);
      if (!owner) edgeSegments.push(segment);
    }
    const markNearNode = (
      segment: Compactable | undefined,
      point: Point | undefined,
      node: Compactable | undefined,
    ) => {
      if (!segment || !point || !node) return;
      if (point.y < node.y) segment.ignoreDown = true;
      else if (point.y > node.y + node.height) segment.ignoreUp = true;
      else {
        segment.ignoreUp = true;
        segment.ignoreDown = true;
      }
    };
    // ELK marks clearance in the physical (cycle-broken) edge direction.
    // Authored reverse edges must not suppress the shared track's spacing.
    const reversed = orientation?.reversedEdgeIds.has(edgeId) ?? false;
    const firstSegment = reversed ? edgeSegments.at(-1) : edgeSegments[0];
    const lastSegment = reversed ? edgeSegments[0] : edgeSegments.at(-1);
    markNearNode(
      firstSegment,
      firstSegment?.points[reversed ? 0 : 1],
      nodes.get(reversed ? edge.targetId : edge.sourceId),
    );
    // Include horizontal bends following the last vertical segment.
    markNearNode(
      lastSegment,
      reversed ? points[2] : points.at(-3),
      nodes.get(reversed ? edge.sourceId : edge.targetId),
    );
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
      survivor.ignoreUp ||= segment.ignoreUp;
      survivor.ignoreDown ||= segment.ignoreDown;
      if (!survivor.group.startsWith("node:") && segment.group.startsWith("node:")) {
        survivor.group = segment.group;
        survivor.offset = survivor.x - groupOrigin.get(segment.group)!;
      }
    } else merged.push(segment);
  }
  for (const points of canonicalJunctions?.values() ?? [])
    for (const point of points) {
      const track = merged.find(
        (item) =>
          Math.abs(item.x - point.x) < 1e-9 &&
          point.y >= item.y - 1e-9 &&
          point.y <= item.y + item.height + 1e-9,
      );
      if (track) track.points.push(point);
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
  const visible = new Map<Compactable, Set<Compactable>>();
  const sweep = (hitboxes: Compactable[]) => {
    for (const [left, right] of scanlineConstraints(hitboxes, true)) {
      const originalLeft = items.find((item) => item.id === left.id)!;
      const originalRight = items.find((item) => item.id === right.id)!;
      let targets = visible.get(originalLeft);
      if (!targets) visible.set(originalLeft, (targets = new Set()));
      targets.add(originalRight);
    }
  };
  const edgeMargin = Math.max(0, Number(input.settings["spacing.edgeEdge"] ?? 10) / 2 - 0.5);
  const hitboxes = new Map(items.map((item) => [item.id, { ...item }]));
  const alter = (box: Compactable, margin: number, factor: number): void => {
    const delta = margin * factor;
    if (box.nodeId) {
      box.y -= delta;
      box.height += 2 * delta;
    } else if (!box.ignoreUp) {
      box.y -= delta + 0.01;
      box.height += delta + 0.01;
    } else if (!box.ignoreDown) box.height += delta + 0.01;
  };
  // ELK's restore pass negates spacing but retains its 0.01 scanline tolerance.
  // Keep hitboxes separate from authored geometry, including that residual extent.
  const separateSweep = (selected: Compactable[], margin: (item: Compactable) => number) => {
    for (const item of selected) alter(hitboxes.get(item.id)!, margin(item), 1);
    sweep(selected.map((item) => hitboxes.get(item.id)!));
    for (const item of selected) alter(hitboxes.get(item.id)!, margin(item), -1);
  };
  separateSweep(merged, () => edgeMargin);
  separateSweep([...nodes.values()], (item) => {
    const node = input.graph.nodes.find((node) => node.id === item.nodeId);
    const individual = node ? input.nodeSettings?.(node)?.["spacing.individual"] : undefined;
    const edgeSpacing =
      individual && typeof individual === "object"
        ? Number(
            (individual as Record<string, number>)["spacing.edgeEdge"] ??
              input.settings["spacing.edgeEdge"] ??
              10,
          )
        : Number(input.settings["spacing.edgeEdge"] ?? 10);
    return Math.max(0, edgeSpacing / 2 - 0.5);
  });
  const minimumMargin = Math.min(
    merged.length ? edgeMargin : Infinity,
    ...[...nodes.values()].map((item) =>
      Math.max(0, nodeNodeSpacing(input, item.nodeId!, item.nodeId!) / 2 - 0.5),
    ),
  );
  const alterGroups = (factor: number) => {
    for (const group of groups) {
      const members = items.filter((item) => item.group === group);
      const master = members.find((item) => item.nodeId) ?? members[0];
      if (!master) continue;
      alter(hitboxes.get(master.id)!, minimumMargin, factor);
      for (const member of members) {
        if (member === master) continue;
        const box = hitboxes.get(member.id)!;
        const delta = minimumMargin * factor + 0.01;
        if (member.ignoreUp) {
          box.y += delta;
          box.height -= delta;
        } else if (member.ignoreDown) box.height -= delta;
      }
    }
  };
  alterGroups(1);
  sweep([...hitboxes.values()]);
  alterGroups(-1);
  for (const [left, targets] of visible) {
    for (const right of targets) {
      if (
        sameEdge(left, right) &&
        input.settings["compaction.postCompaction.strategy"] === "EDGE_LENGTH"
      ) {
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
  for (const edge of input.settings["compaction.postCompaction.strategy"] === "EDGE_LENGTH"
    ? input.graph.edges
    : []) {
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
  // Synthetic LABEL terminals retain their initial flow order. A short or
  // vertical terminal approach may have no collected CGraph bend segment,
  // so scanline visibility alone does not retain the owner/label relation.
  for (const [id, points] of canonicalRoutes) {
    const edge = edgeById.get(id)!;
    const source = nodes.get(edge.sourceId),
      target = nodes.get(edge.targetId);
    if (!source || !target || points.length < 3 || source.x === target.x) continue;
    const sourceLabel = edge.sourceId.startsWith("__layout_dummy:label:");
    const targetLabel = edge.targetId.startsWith("__layout_dummy:label:");
    if (!sourceLabel && !targetLabel) continue;
    const [before, after] = source.x < target.x ? [source, target] : [target, source];
    constraints.push({
      source: before.group,
      target: after.group,
      delta: before.offset + before.width - after.offset,
      weight: 1,
    });
  }
  let solved: Map<string, number>;
  try {
    solved =
      input.settings["compaction.postCompaction.strategy"] === "EDGE_LENGTH"
        ? solveWeightedCompaction(groups, constraints)
        : directionalCompaction(input, groups, constraints, items, groupOrigin, orientation);
  } catch (error) {
    if (error instanceof Error)
      error.cause = {
        groups,
        constraints,
        items: items.map((item) => ({ ...item, edges: [...item.edges] })),
      };
    throw error;
  }
  if ([...solved.values()].some((position) => !Number.isFinite(position)))
    throw new InfeasibleCompactionError("Non-finite compaction solution");
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
    if (edge.sourceId === edge.targetId && points.every((point) => point.y === points[0]!.y)) {
      // Zero-length self-loop spans create no compaction item. Move their
      // unowned corners with the node; collected spans already moved above.
      const delta = nodeDelta.get(edge.sourceId) ?? 0;
      for (const [index, point] of points.entries()) {
        if (
          index > 0 &&
          index < points.length - 1 &&
          items.some((item) => item.points.includes(point))
        )
          continue;
        const original = pointToCanonical(originals[index]!);
        points[index] = { ...original, x: original.x + delta };
      }
      continue;
    }
    points[0] = {
      ...pointToCanonical(originals[0]!),
      x: pointToCanonical(originals[0]!).x + (nodeDelta.get(edge.sourceId) ?? 0),
    };
    const end = pointToCanonical(originals.at(-1)!);
    points[points.length - 1] = { ...end, x: end.x + (nodeDelta.get(edge.targetId) ?? 0) };
    // Flow-face terminals do not create CGraph port-lead hitboxes. A split
    // label route may nevertheless turn vertically beside that terminal;
    // keep its adjacent corner attached when moving the endpoint's owner.
    if (points.length > 2) {
      const start = pointToCanonical(originals[0]!);
      const next = pointToCanonical(originals[1]!);
      const previous = pointToCanonical(originals.at(-2)!);
      if (
        !crossSide(endpointSide(edge.sourceId, edge.sourcePort, start)) &&
        Math.abs(start.x - next.x) < 1e-9
      )
        points[1]!.x = points[0]!.x;
      if (
        !crossSide(endpointSide(edge.targetId, edge.targetPort, end)) &&
        Math.abs(end.x - previous.x) < 1e-9
      )
        points[points.length - 2]!.x = points.at(-1)!.x;
    }
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
    const content = contentRects.get(id)!;
    const point = pointFromCanonical({
      x: item.x - item.offset + (negative ? content.width : 0),
      y: content.y,
    });
    (placement.rectByNodeId as Map<string, EntityRect>).set(id, {
      ...point,
      width: vertical ? content.height : content.width,
      height: vertical ? content.width : content.height,
    });
  }
  for (const [id, points] of canonicalRoutes) {
    (routes!.pointsByEdgeId as Map<string, readonly Point[]>).set(
      id,
      points.map(pointFromCanonical),
    );
  }
  if (canonicalJunctions)
    routes!.junctionPointsByEdgeId = new Map(
      [...canonicalJunctions].map(([id, points]) => [id, points.map(pointFromCanonical)]),
    );
  const boundPoints = items.flatMap((item) => {
    const box = hitboxes.get(item.id)!;
    return [
      pointFromCanonical({ x: item.x, y: box.y }),
      pointFromCanonical({ x: item.x + item.width, y: box.y + box.height }),
    ];
  });
  if (boundPoints.length)
    recordCompactionBounds(placement, {
      left: Math.min(...boundPoints.map((p) => p.x)),
      top: Math.min(...boundPoints.map((p) => p.y)),
      right: Math.max(...boundPoints.map((p) => p.x)),
      bottom: Math.max(...boundPoints.map((p) => p.y)),
    });
  return placement;
}

/** ELK LongestPathCompaction, using the same rigid groups as edge-length compaction. */
function directionalCompaction(
  input: LayeredPhaseInput,
  groups: readonly string[],
  constraints: readonly CompactionConstraint[],
  items: readonly Compactable[],
  origins: ReadonlyMap<string, number>,
  orientation?: AcyclicOrientation,
): Map<string, number> {
  const strategy = input.settings["compaction.postCompaction.strategy"];
  const pass = (
    reverse: boolean,
    previous: ReadonlyMap<string, number>,
    lock: string | undefined,
  ) => {
    const sign = reverse ? -1 : 1;
    const offsets = new Map(
      items.map((item) => [item.id, reverse ? -item.offset - item.width : item.offset]),
    );
    const minimum = Math.min(
      ...items.map((item) => sign * previous.get(item.group)! + offsets.get(item.id)!),
    );
    const reference = new Map(
      groups.map((group) => [
        group,
        Math.min(
          ...items.filter((item) => item.group === group).map((item) => offsets.get(item.id)!),
        ),
      ]),
    );
    const position = new Map(groups.map((group) => [group, minimum - reference.get(group)!]));
    const links = new Map(
      groups.map((group) => [group, [] as { target: string; delta: number }[]]),
    );
    const incoming = new Map(groups.map((group) => [group, 0]));
    for (const edge of constraints) {
      const source = reverse ? edge.target : edge.source;
      const target = reverse ? edge.source : edge.target;
      if (source === target) continue;
      links.get(source)!.push({ target, delta: edge.delta });
      incoming.set(target, incoming.get(target)! + 1);
    }
    const locked = new Set<string>();
    if (lock === "LEFT_RIGHT_CONSTRAINT_LOCKING")
      for (const group of groups) if (incoming.get(group) === 0) locked.add(group);
    if (lock === "LEFT_RIGHT_CONNECTION_LOCKING") {
      // ELK locks against the physical adjacency after cycle breaking.
      // Authored directions can turn a sink into an apparent transit node.
      for (const item of items)
        if (item.nodeId) {
          const before = input.graph.edges.filter(
            (edge) =>
              (orientation?.reversedEdgeIds.has(edge.id) ? edge.sourceId : edge.targetId) ===
              item.nodeId,
          ).length;
          const after = input.graph.edges.filter(
            (edge) =>
              (orientation?.reversedEdgeIds.has(edge.id) ? edge.targetId : edge.sourceId) ===
              item.nodeId,
          ).length;
          if (before > after) locked.add(item.group);
        }
    }
    const queue = groups.filter((group) => incoming.get(group) === 0);
    let processed = 0;
    while (queue.length) {
      const group = queue.shift()!;
      processed++;
      if (locked.has(group))
        position.set(group, Math.max(position.get(group)!, sign * previous.get(group)!));
      for (const edge of links.get(group)!) {
        position.set(
          edge.target,
          Math.max(position.get(edge.target)!, position.get(group)! + edge.delta),
        );
        incoming.set(edge.target, incoming.get(edge.target)! - 1);
        if (incoming.get(edge.target) === 0) queue.push(edge.target);
      }
    }
    if (processed !== groups.length)
      throw new InfeasibleCompactionError("Cyclic directional compaction groups");
    return new Map([...position].map(([group, value]) => [group, sign * value]));
  };
  if (strategy === "RIGHT") return pass(true, origins, undefined);
  const left = pass(false, origins, undefined);
  return strategy === "LEFT_RIGHT_CONSTRAINT_LOCKING" ||
    strategy === "LEFT_RIGHT_CONNECTION_LOCKING"
    ? pass(true, left, String(strategy))
    : left;
}
