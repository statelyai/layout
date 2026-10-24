import type { GraphEdge } from "@statelyai/graph";
import type { LayeredPhaseInput, NodePlacement } from "./types";
import { getPortPoint } from "./strategies";
import {
  fixedSelfLoopLabels,
  fixedSelfLoopSide,
  routeFixedSelfLoop,
  selfLoopTracks,
} from "./fixed-self-loop";
import { findNode } from "./node-lookup";
import { hiddenLoopPorts } from "./self-loop-ports";

type CanonicalSide = "NORTH" | "SOUTH" | "EAST" | "WEST";
const crossSide = (side: CanonicalSide) => side === "NORTH" || side === "SOUTH";

/**
 * Extents of a movable loop's hidden ports in the canonical rightward frame:
 * along its side, and protruding from it.
 */
function loopPortExtents(input: LayeredPhaseInput, edge: GraphEdge, side: CanonicalSide) {
  const ports = hiddenLoopPorts(input.settings, edge.id);
  const horizontal = input.direction === "right" || input.direction === "left";
  const along = (crossSide(side) === horizontal ? "width" : "height") as "width" | "height";
  const normal = along === "width" ? "height" : "width";
  return {
    along: ports ? ports.source[along] + ports.target[along] : 0,
    normal: ports ? Math.max(ports.source[normal], ports.target[normal]) : 0,
  };
}

/** A movable loop's label extent away from its side, in the canonical frame. */
export function movableLoopLabelExtent(
  input: LayeredPhaseInput,
  edge: GraphEdge,
  side: CanonicalSide,
): number {
  const horizontal = input.direction === "right" || input.direction === "left";
  const size = (crossSide(side) === horizontal ? edge.height : edge.width) ?? 0;
  return size > 0 ? size + Number(input.settings["spacing.edgeLabel"] ?? 2) : 0;
}

/**
 * ELK's OrthogonalSelfLoopRouter routing slot of a movable loop, measured
 * from its node side in the canonical frame: past the protruding ports and
 * the self-loop spacing, then one edge spacing plus any label per inner slot.
 */
export function movableLoopTrack(
  input: LayeredPhaseInput,
  sideLoops: readonly GraphEdge[],
  edge: GraphEdge,
  side: CanonicalSide,
  ordering: string,
): number {
  const ordered = ordering === "REVERSE_STACKED" ? [...sideLoops].reverse() : sideLoops;
  const inner = ordering === "SEQUENCED" ? [] : ordered.slice(0, ordered.indexOf(edge));
  const edgeSpacing = Number(input.settings["spacing.edgeEdge"] ?? 10);
  return (
    Math.max(0, ...sideLoops.map((loop) => loopPortExtents(input, loop, side).normal)) +
    Number(input.settings["spacing.nodeSelfLoop"] ?? 10) +
    inner.reduce(
      (sum, loop) =>
        sum + edgeSpacing + (crossSide(side) ? movableLoopLabelExtent(input, loop, side) : 0),
      0,
    )
  );
}

/**
 * Canonical position of a movable loop port along its side, given its
 * DISTRIBUTED ratio among the side's implicit ports (ELK's port placement
 * with equal gaps between hidden ports of their own size).
 */
export function movableLoopPortOffset(
  input: LayeredPhaseInput,
  sideLoops: readonly GraphEdge[],
  side: CanonicalSide,
  length: number,
  ratio: number,
): { along: number; normal: number } {
  const count = sideLoops.length * 2;
  const extents = sideLoops.map((loop) => loopPortExtents(input, loop, side));
  const total = extents.reduce((sum, extent) => sum + extent.along, 0);
  const size = total / count;
  const index = Math.round(ratio * (count + 1)) - 1;
  const gap = (length - total) / (count + 1);
  return {
    along: gap * (index + 1) + size * index + size / 2,
    normal: Math.max(0, ...extents.map((extent) => extent.normal)),
  };
}

export interface LoopEnvelope {
  before: number;
  after: number;
  flowBefore: number;
  flowAfter: number;
}

/** Unconstrained implicit loop ports are restored on loop faces after the sweep. */
export function hasMovableLoopPorts(input: LayeredPhaseInput, edge: GraphEdge): boolean {
  if (
    edge.sourceId !== edge.targetId ||
    edge.sourcePort !== undefined ||
    edge.targetPort !== undefined
  )
    return false;
  const node = findNode(input.graph.nodes, edge.sourceId);
  const constraints = node && input.nodeSettings?.(node)?.portConstraints;
  return constraints === undefined || constraints === "FREE" || constraints === "UNDEFINED";
}

export function loopEnvelopes(input: LayeredPhaseInput): ReadonlyMap<string, LoopEnvelope> {
  const envelopes = new Map<string, LoopEnvelope>();
  if ((input.settings.edgeRouting ?? "ORTHOGONAL") !== "ORTHOGONAL") return envelopes;
  const loopsByNodeId = new Map<string, GraphEdge[]>();
  for (const edge of input.graph.edges)
    if (edge.sourceId === edge.targetId) {
      const loops = loopsByNodeId.get(edge.sourceId);
      if (loops) loops.push(edge);
      else loopsByNodeId.set(edge.sourceId, [edge]);
    }
  for (const node of input.graph.nodes) {
    const allLoops = loopsByNodeId.get(node.id)?.slice() ?? [];
    const constraints = input.nodeSettings?.(node)?.portConstraints;
    if (
      allLoops.length &&
      constraints &&
      constraints !== "FREE" &&
      constraints !== "UNDEFINED" &&
      allLoops.every(
        (edge) =>
          edge.sourcePort !== undefined &&
          edge.targetPort !== undefined &&
          input.edgeSettings?.(edge)?.["edgeLabels.inline"] !== true &&
          (((edge.width ?? 0) === 0 && (edge.height ?? 0) === 0) ||
            (input.edgeSettings?.(edge)?.["edgeLabels.placement"] ?? "CENTER") === "CENTER"),
      )
    ) {
      const size = input.sizes.get(node.id) ?? { width: 0, height: 0 };
      const rect = { x: 0, y: 0, ...size };
      const envelope = { before: 0, after: 0, flowBefore: 0, flowAfter: 0 };
      const horizontal = input.direction === "right" || input.direction === "left";
      const reverse = input.direction === "left" || input.direction === "up";
      const spacing = Number(input.settings["spacing.nodeSelfLoop"] ?? 10);
      let supported = true;
      const tracks = selfLoopTracks(allLoops);
      for (const edge of allLoops) {
        const from = node.ports?.find((port) => port.name === edge.sourcePort);
        const to = node.ports?.find((port) => port.name === edge.targetPort);
        const sourceSide =
          from && fixedSelfLoopSide(input.portSettings?.(from, node)?.["port.side"]);
        const targetSide = to && fixedSelfLoopSide(input.portSettings?.(to, node)?.["port.side"]);
        const labeled = (edge.width ?? 0) > 0 || (edge.height ?? 0) > 0;
        if (!sourceSide || !targetSide || (labeled && sourceSide !== targetSide)) {
          supported = false;
          break;
        }
        const start = getPortPoint(
          node,
          edge.sourcePort,
          rect,
          { x: 0, y: 0 },
          input.direction,
          input,
        );
        const end = getPortPoint(
          node,
          edge.targetPort,
          rect,
          { x: 0, y: 0 },
          input.direction,
          input,
        );
        const route = routeFixedSelfLoop(
          rect,
          start,
          end,
          sourceSide,
          targetSide,
          spacing * (tracks.get(edge.id)! + 1),
          input.direction,
        );
        if (labeled) {
          const labelSpacing = Number(input.settings["spacing.edgeLabel"] ?? 2);
          const { width = 0, height = 0 } = edge;
          for (const label of fixedSelfLoopLabels(route, sourceSide, width, height, labelSpacing))
            route.push(label, { x: label.x + width, y: label.y + height });
        }
        for (const point of route) {
          const cross = horizontal ? point.y : point.x;
          const flow = horizontal ? point.x : point.y;
          const flowSize = horizontal ? size.width : size.height;
          envelope.before = Math.max(envelope.before, -cross);
          envelope.after = Math.max(
            envelope.after,
            cross - (horizontal ? size.height : size.width),
          );
          envelope.flowBefore = Math.max(envelope.flowBefore, reverse ? flow - flowSize : -flow);
          envelope.flowAfter = Math.max(envelope.flowAfter, reverse ? -flow : flow - flowSize);
        }
      }
      if (supported) {
        envelopes.set(node.id, envelope);
        continue;
      }
    }
    const loops = allLoops.filter((edge) => hasMovableLoopPorts(input, edge));
    if (loops.length === 0) continue;
    const settings = input.nodeSettings?.(node);
    const distribution = settings?.["edgeRouting.selfLoopDistribution"] ?? "NORTH";
    const ordering = settings?.["edgeRouting.selfLoopOrdering"] ?? "STACKED";
    const envelope = { before: 0, after: 0, flowBefore: 0, flowAfter: 0 };
    const sides =
      distribution === "EQUALLY"
        ? (["before", "after", "flowAfter", "flowBefore"] as const)
        : distribution === "NORTH_SOUTH"
          ? (["before", "after"] as const)
          : (["before"] as const);
    const canonicalSides = {
      before: "NORTH",
      after: "SOUTH",
      flowAfter: "EAST",
      flowBefore: "WEST",
    } as const;
    const horizontal = input.direction === "right" || input.direction === "left";
    const size = input.sizes.get(node.id) ?? { width: 0, height: 0 };
    const flowSize = horizontal ? size.width : size.height;
    for (const side of sides) {
      const selected = loops.filter((_, index) => sides[index % sides.length] === side);
      const canonical = canonicalSides[side];
      envelope[side] = Math.max(
        envelope[side],
        ...selected.map(
          (edge) =>
            movableLoopTrack(input, selected, edge, canonical, ordering) +
            movableLoopLabelExtent(input, edge, canonical),
        ),
      );
      if (!crossSide(canonical)) continue;
      // ELK centers cross-side loop labels on their node along the flow, and
      // a label longer than its node widens the node's layer by the overhang.
      for (const edge of selected) {
        const overhang = ((horizontal ? edge.width : edge.height) ?? 0) - flowSize;
        envelope.flowBefore = Math.max(envelope.flowBefore, overhang / 2);
        envelope.flowAfter = Math.max(envelope.flowAfter, overhang / 2);
      }
    }
    envelopes.set(node.id, envelope);
  }
  return envelopes;
}

const reservedByPlacement = new WeakMap<NodePlacement, ReadonlySet<string>>();
export function recordLoopEnvelopes(placement: NodePlacement, ids: ReadonlySet<string>): void {
  reservedByPlacement.set(placement, ids);
}
export function hasPlacementLoopEnvelope(placement: NodePlacement, id: string): boolean {
  return reservedByPlacement.get(placement)?.has(id) ?? false;
}

const preparedByInput = new WeakMap<LayeredPhaseInput, ReadonlyMap<string, LoopEnvelope>>();
export function prepareLoopEnvelopes(input: LayeredPhaseInput): ReadonlyMap<string, LoopEnvelope> {
  const envelopes = loopEnvelopes(input);
  preparedByInput.set(input, envelopes);
  return envelopes;
}
export function preparedLoopEnvelopes(
  input: LayeredPhaseInput,
): ReadonlyMap<string, LoopEnvelope> | undefined {
  return preparedByInput.get(input);
}
