import type { GraphEdge } from "@statelyai/graph";
import type { LayeredPhaseInput, NodePlacement } from "./types";
import { getPortPoint } from "./strategies";
import {
  fixedSelfLoopLabels,
  fixedSelfLoopSide,
  routeFixedSelfLoop,
  selfLoopTracks,
} from "./fixed-self-loop";

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
  const node = input.graph.nodes.find((candidate) => candidate.id === edge.sourceId);
  const constraints = node && input.nodeSettings?.(node)?.portConstraints;
  return constraints === undefined || constraints === "FREE" || constraints === "UNDEFINED";
}

export function loopEnvelopes(input: LayeredPhaseInput): ReadonlyMap<string, LoopEnvelope> {
  const envelopes = new Map<string, LoopEnvelope>();
  if ((input.settings.edgeRouting ?? "ORTHOGONAL") !== "ORTHOGONAL") return envelopes;
  for (const node of input.graph.nodes) {
    const allLoops = input.graph.edges.filter(
      (edge) => edge.sourceId === node.id && edge.targetId === node.id,
    );
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
    // Inline labels remain owned by the existing labeled-loop phase. Move
    // the entire node together when that phase is ported, rather than mixing
    // two different loop distributions and reservations on the same node.
    if (
      loops.length === 0 ||
      loops.some((edge) => input.edgeSettings?.(edge)?.["edgeLabels.inline"] === true)
    )
      continue;
    const settings = input.nodeSettings?.(node);
    const distribution = settings?.["edgeRouting.selfLoopDistribution"] ?? "NORTH";
    const ordering = settings?.["edgeRouting.selfLoopOrdering"] ?? "STACKED";
    const spacing = Number(input.settings["spacing.nodeSelfLoop"] ?? 10);
    const envelope = { before: 0, after: 0, flowBefore: 0, flowAfter: 0 };
    const sides =
      distribution === "EQUALLY"
        ? (["before", "after", "flowAfter", "flowBefore"] as const)
        : distribution === "NORTH_SOUTH"
          ? (["before", "after"] as const)
          : (["before"] as const);
    for (const side of sides) {
      const selected = loops.filter((_, index) => sides[index % sides.length] === side);
      const horizontal = input.direction === "right" || input.direction === "left";
      const crossSize =
        side === "before" || side === "after"
          ? horizontal
            ? "height"
            : "width"
          : horizontal
            ? "width"
            : "height";
      const labelSpacing = Number(input.settings["spacing.edgeLabel"] ?? 2);
      envelope[side] =
        spacing * (ordering === "SEQUENCED" ? Math.min(1, selected.length) : selected.length) +
        selected.reduce(
          (sum, edge) =>
            sum + ((edge[crossSize] ?? 0) > 0 ? (edge[crossSize] ?? 0) + labelSpacing : 0),
          0,
        );
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
