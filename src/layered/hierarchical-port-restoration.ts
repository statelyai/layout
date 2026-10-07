/*
 * Copyright (c) 2010, 2020 Kiel University and others.
 * Native adaptation of ELK boundary restoration and direction transforms.
 * SPDX-License-Identifier: EPL-2.0
 */
import type { EntityRect, Point } from "@statelyai/graph";

import { phaseRandomByInput, crossingRandom, inheritCycleRandom } from "./cycle-random";
import { placementCrossBounds, compactionBounds } from "./compaction-bounds";
import { externalPortDummyOf, type ExternalPortDummy } from "./external-port-dummy";
import {
  hierarchicalPortSides,
  type HierarchicalPortPreparation,
} from "./hierarchical-port-phases";
import { routeHierarchicalPorts } from "./hierarchical-port-routing";
import type { LayeredPhaseInput, NodePlacement, EdgeRoutes, LayerOrder, NodeSize } from "./types";

const restoredDummies = new WeakSet<ExternalPortDummy>();
export function isPerpendicularPortRestored(node: object) {
  const origin = externalPortDummyOf(node);
  return !!origin && restoredDummies.has(origin);
}

/** Restore original boundary nodes and routes in the physical export frame. */
export function restoreHierarchicalPorts(
  input: LayeredPhaseInput,
  order: LayerOrder,
  prep: HierarchicalPortPreparation,
  placement: NodePlacement,
  routes: EdgeRoutes,
) {
  if (!prep.originals.size) return { input, routes };
  const horizontal = input.direction === "right" || input.direction === "left";
  const reversed = input.direction === "left" || input.direction === "up";
  const crossReversed =
    input.settings.directionCongruency === "ROTATION" &&
    (input.direction === "left" || input.direction === "down");
  const pad = input.padding;
  const physical = hierarchicalPortSides(input);
  const rects = placement.rectByNodeId as Map<string, EntityRect>;
  const oldBounds = compactionBounds(placement),
    crossBounds = placementCrossBounds(placement);
  let physicalWidth = Math.max(0, ...[...rects.values()].map((r) => r.x + r.width)) - pad.left;
  let physicalHeight = Math.max(0, ...[...rects.values()].map((r) => r.y + r.height)) - pad.top;
  if (oldBounds) {
    physicalWidth = Math.max(physicalWidth, oldBounds.right - pad.left);
    physicalHeight = Math.max(physicalHeight, oldBounds.bottom - pad.top);
  }
  if (crossBounds?.axis === "x")
    physicalWidth = Math.max(physicalWidth, crossBounds.maximum - pad.left);
  if (crossBounds?.axis === "y")
    physicalHeight = Math.max(physicalHeight, crossBounds.maximum - pad.top);
  // Placement already includes graph padding; retain the measured phase extents.
  const initialSize = {
    width: horizontal ? physicalWidth : physicalHeight,
    height: horizontal ? physicalHeight : physicalWidth,
  };
  const canonicalPad = horizontal
    ? { ...pad }
    : { left: pad.top, right: pad.bottom, top: pad.left, bottom: pad.right };
  if (reversed) [canonicalPad.left, canonicalPad.right] = [canonicalPad.right, canonicalPad.left];
  if (crossReversed)
    [canonicalPad.top, canonicalPad.bottom] = [canonicalPad.bottom, canonicalPad.top];
  const toCanonical = (point: Point): Point => {
    let x = horizontal ? point.x - pad.left : point.y - pad.top;
    let y = horizontal ? point.y - pad.top : point.x - pad.left;
    if (reversed) x = initialSize.width - x;
    if (crossReversed) y = initialSize.height - y;
    return { x, y };
  };
  const toCanonicalRect = (rect: EntityRect): EntityRect => {
    const p = toCanonical(rect),
      width = horizontal ? rect.width : rect.height,
      height = horizontal ? rect.height : rect.width;
    return {
      x: p.x - (reversed ? width : 0),
      y: p.y - (crossReversed ? height : 0),
      width,
      height,
    };
  };
  const records = new Map([...prep.replacements.values()].map((r) => [r.helper.id, r]));
  const origins = [...prep.originals.values()].map((node) => {
    const o = externalPortDummyOf(node)!;
    const width = horizontal ? o.width : o.height,
      height = horizontal ? o.height : o.width;
    let x = horizontal ? o.port.x : o.port.y,
      y = horizontal ? o.port.y : o.port.x;
    if (reversed) x = width - x;
    if (crossReversed) y = height - y;
    const side = o.side === physical.north ? ("NORTH" as const) : ("SOUTH" as const);
    return {
      id: node.id,
      origin: {
        ...o,
        width,
        height,
        side,
        port: { x, y, side: side === "NORTH" ? ("SOUTH" as const) : ("NORTH" as const) },
      },
    };
  });
  const helpers = order.layers.flat().flatMap((id) => {
    const record = records.get(id),
      rect = rects.get(id);
    if (!record || !rect) return [];
    return [
      {
        id,
        originalId: record.original.id,
        rect: toCanonicalRect(rect),
        incoming: input.graph.edges.filter((e) => e.targetId === id).map((e) => e.id),
        outgoing: input.graph.edges.filter((e) => e.sourceId === id).map((e) => e.id),
      },
    ];
  });
  const restored = routeHierarchicalPorts(
    {
      constraints: input.settings.portConstraints ?? "FIXED_SIDE",
      size: initialSize,
      offset: { x: 0, y: 0 },
      padding: canonicalPad,
      spacing: {
        node: input.spacing.node,
        edge: Number(input.settings["spacing.edgeEdge"] ?? 10),
        port: Number(input.settings["spacing.portPort"] ?? 10),
      },
      originals: origins,
      helpers,
      bends: new Map(
        [...routes.pointsByEdgeId].map(([id, points]) => [
          id,
          points.slice(1, -1).map(toCanonical),
        ]),
      ),
    },
    phaseRandomByInput.get(input) ?? crossingRandom(input),
  );
  const fromCanonical = (p: Point): Point => {
    let x = p.x + restored.offset.x,
      y = p.y + restored.offset.y;
    if (reversed) x = restored.size.width - x;
    if (crossReversed) y = restored.size.height - y;
    return horizontal ? { x: x + pad.left, y: y + pad.top } : { x: y + pad.left, y: x + pad.top };
  };
  const fromCanonicalRect = (rect: EntityRect): EntityRect => {
    const p = fromCanonical(rect);
    if (reversed) {
      if (horizontal) p.x -= rect.width;
      else p.y -= rect.width;
    }
    if (crossReversed) {
      if (horizontal) p.y -= rect.height;
      else p.x -= rect.height;
    }
    return {
      ...p,
      width: horizontal ? rect.width : rect.height,
      height: horizontal ? rect.height : rect.width,
    };
  };
  for (const [id, rect] of rects)
    if (!records.has(id)) rects.set(id, fromCanonicalRect(toCanonicalRect(rect)));
  for (const id of records.keys()) rects.delete(id);
  for (const [id, rect] of restored.rects) {
    rects.set(id, fromCanonicalRect(rect));
    restoredDummies.add(externalPortDummyOf(prep.originals.get(id)!)!);
  }
  const originalById = new Map(origins.map((origin) => [origin.id, origin]));
  const boundaryPoint = (helperId: string): Point => {
    const original = records.get(helperId)!.original;
    const o = originalById.get(original.id)!.origin,
      rect = restored.rects.get(original.id)!;
    return fromCanonical({ x: rect.x + o.port.x, y: rect.y + o.port.y });
  };
  const pointsByEdgeId = new Map(
    [...routes.pointsByEdgeId].map(([id, points]) => [
      id,
      points.map((p) => fromCanonical(toCanonical(p))),
    ]),
  );
  for (const edge of input.graph.edges) {
    const source = records.get(edge.sourceId),
      target = records.get(edge.targetId);
    if (!source && !target) continue;
    const old = routes.pointsByEdgeId.get(edge.id);
    if (!old?.length) continue;
    const first = source ? boundaryPoint(edge.sourceId) : fromCanonical(toCanonical(old[0]!));
    const last = target ? boundaryPoint(edge.targetId) : fromCanonical(toCanonical(old.at(-1)!));
    pointsByEdgeId.set(edge.id, [
      first,
      ...(restored.bends.get(edge.id) ?? []).map(fromCanonical),
      last,
    ]);
  }
  const nodes = [
    ...input.graph.nodes.filter((n) => !records.has(n.id)),
    ...prep.originals.values(),
  ];
  const edges = input.graph.edges.map((edge) => {
    const source = records.get(edge.sourceId)?.original,
      target = records.get(edge.targetId)?.original;
    return {
      ...edge,
      sourceId: source?.id ?? edge.sourceId,
      targetId: target?.id ?? edge.targetId,
      sourcePort: source?.ports?.[0]?.name ?? edge.sourcePort,
      targetPort: target?.ports?.[0]?.name ?? edge.targetPort,
    };
  });
  const finalSize: NodeSize = horizontal
    ? restored.size
    : { width: restored.size.height, height: restored.size.width };
  return {
    input: inheritCycleRandom(input, { ...input, graph: { ...input.graph, nodes, edges } }),
    routes: {
      ...routes,
      pointsByEdgeId,
      junctionPointsByEdgeId: routes.junctionPointsByEdgeId
        ? new Map(
            [...routes.junctionPointsByEdgeId].map(([id, points]) => [
              id,
              points.map((p) => fromCanonical(toCanonical(p))),
            ]),
          )
        : undefined,
    },
    bounds: {
      width: finalSize.width + pad.left + pad.right,
      height: finalSize.height + pad.top + pad.bottom,
    },
  };
}
