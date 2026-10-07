/*******************************************************************************
 * Copyright (c) 2010, 2020 Kiel University and others.
 * Adapted from ELK HierarchicalPortOrthogonalEdgeRouter in elkjs 0.11.1.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { EntityRect, Point } from "@statelyai/graph";
import type { JavaRandom } from "../java-random";
import type { ExternalPortConstraints, ExternalPortDummy } from "./external-port-dummy";
import { createOrthogonalHypersegments } from "./orthogonal-hypersegments";
import { routeOrthogonalSegments } from "./orthogonal-segments";
import type { LayoutPadding, NodeSize } from "./types";

export interface CanonicalHierarchicalPortRouting {
  constraints: ExternalPortConstraints;
  size: NodeSize;
  offset: Point;
  padding: LayoutPadding;
  spacing: { node: number; edge: number; port: number };
  originals: readonly {
    id: string;
    origin: ExternalPortDummy;
    margin?: { left: number; right: number };
  }[];
  helpers: readonly {
    id: string;
    originalId: string;
    rect: EntityRect;
    incoming: readonly string[];
    outgoing: readonly string[];
  }[];
  bends: ReadonlyMap<string, readonly Point[]>;
}

/** Operates in ELK's canonical LTR content coordinates, before graph export. */
export function routeHierarchicalPorts(data: CanonicalHierarchicalPortRouting, random: JavaRandom) {
  const size = { ...data.size },
    offset = { ...data.offset };
  const originals = new Map(data.originals.map((original) => [original.id, original]));
  const rects = new Map<string, EntityRect>();
  const bends = new Map(
    [...data.bends].map(([id, points]) => [id, points.map((point) => ({ ...point }))]),
  );
  for (const original of data.originals) {
    const { origin, id } = original;
    const connected = data.helpers.filter((helper) => helper.originalId === id);
    let x = connected.length
      ? connected.reduce((sum, helper) => sum + helper.rect.x, 0) / connected.length -
        origin.anchor.x
      : 0;
    if (data.constraints === "FIXED_POS" || data.constraints === "FIXED_RATIO") {
      x =
        (origin.ratioOrPosition ?? 0) *
          (data.constraints === "FIXED_RATIO"
            ? size.width + data.padding.left + data.padding.right
            : 1) -
        origin.anchor.x -
        data.padding.left -
        offset.x;
      if (data.constraints === "FIXED_POS") size.width = Math.max(size.width, x + origin.width / 2);
    }
    rects.set(id, {
      x,
      y:
        origin.side === "NORTH"
          ? -data.padding.top - offset.y
          : size.height + data.padding.top + data.padding.bottom - offset.y,
      width: origin.width,
      height: origin.height,
    });
  }
  for (const side of ["NORTH", "SOUTH"] as const) {
    const ordered = data.originals.filter((original) => original.origin.side === side);
    if (
      data.constraints === "FIXED_SIDE" ||
      data.constraints === "FREE" ||
      data.constraints === "UNDEFINED"
    )
      ordered.sort((a, b) => rects.get(a.id)!.x - rects.get(b.id)!.x);
    else if (data.constraints === "FIXED_ORDER")
      ordered.sort((a, b) => (a.origin.ratioOrPosition ?? 0) - (b.origin.ratioOrPosition ?? 0));
    else continue;
    let next: number | undefined;
    for (const original of ordered) {
      const rect = rects.get(original.id)!;
      if (next !== undefined) rect.x = Math.max(rect.x, next + (original.margin?.left ?? 0));
      if (next !== undefined) size.width = Math.max(size.width, rect.x + rect.width);
      next = rect.x + rect.width + (original.margin?.right ?? 0) + data.spacing.port;
    }
  }
  const connectorBends = new Map<string, Point[]>();
  const minimumDifference = (values: readonly number[]) => {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    let min = Number.MAX_VALUE;
    for (let i = 1; i < sorted.length; i++) min = Math.min(min, sorted[i]! - sorted[i - 1]!);
    return min;
  };
  for (const side of ["NORTH", "SOUTH"] as const) {
    const selectedOriginals = data.originals.filter((original) => original.origin.side === side);
    const selectedHelpers = selectedOriginals.flatMap((original) =>
      data.helpers.filter((helper) => helper.originalId === original.id),
    );
    if (!selectedHelpers.length) continue;
    const ports = [
      ...selectedHelpers.map((helper) => ({
        id: helper.id,
        side: "source" as const,
        position: helper.rect.x,
      })),
      ...selectedOriginals.map((original) => ({
        id: original.id,
        side: "target" as const,
        position: rects.get(original.id)!.x + original.origin.port.x,
      })),
    ];
    const grouped = createOrthogonalHypersegments(
      ports,
      selectedHelpers.map((helper) => ({ source: helper.id, target: helper.originalId })),
    );
    const critical =
      0.2 *
      Math.min(
        minimumDifference(grouped.segments.flatMap((segment) => segment.incoming)),
        minimumDifference(grouped.segments.flatMap((segment) => segment.outgoing)),
      );
    const routed = routeOrthogonalSegments(
      grouped.segments,
      0.5 * data.spacing.edge,
      critical,
      random,
    );
    const start =
      side === "NORTH" ? -data.spacing.node - offset.y : size.height + data.spacing.node - offset.y;
    const sign = side === "NORTH" ? -1 : 1;
    let slots = 0;
    for (const segment of routed.segments)
      if (Math.abs(segment.end - segment.start) >= 1e-3) slots = Math.max(slots, segment.slot + 1);
    for (const helper of selectedHelpers) {
      const segment = routed.segments[grouped.segmentByPort.get(helper.id)!]!;
      const target = originals.get(helper.originalId)!,
        targetX = rects.get(target.id)!.x + target.origin.port.x;
      const points: Point[] = [];
      if (Math.abs(helper.rect.x - targetX) > 1e-3) {
        let track = start + sign * segment.slot * data.spacing.edge;
        points.push({ x: helper.rect.x, y: track });
        if (segment.partner !== undefined) {
          const partner = routed.segments[segment.partner]!;
          const split = partner.incoming[0]!;
          points.push({ x: split, y: track });
          track = start + sign * partner.slot * data.spacing.edge;
          points.push({ x: split, y: track });
        }
        points.push({ x: targetX, y: track });
      }
      connectorBends.set(helper.id, points);
    }
    if (slots > 0) {
      const reserve = data.spacing.node + (slots - 1) * data.spacing.edge;
      size.height += reserve;
      if (side === "NORTH") offset.y += reserve;
    }
  }
  for (const helper of data.helpers) {
    const connector = connectorBends.get(helper.id) ?? [];
    const joint = { x: helper.rect.x, y: helper.rect.y };
    for (const id of helper.incoming)
      bends.set(id, [...(bends.get(id) ?? []), joint, ...connector]);
    for (const id of helper.outgoing)
      bends.set(id, [...connector.toReversed(), joint, ...(bends.get(id) ?? [])]);
  }
  // The real coordinate fixer runs after reserving connector tracks.
  for (const original of data.originals) {
    const rect = rects.get(original.id)!;
    rect.y =
      original.origin.side === "NORTH"
        ? -data.padding.top - offset.y
        : size.height + data.padding.bottom - offset.y;
  }
  return { size, offset, rects, bends };
}
