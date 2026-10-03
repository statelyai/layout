import type { GraphEdge } from "@statelyai/graph";
import type { LayeredPhaseInput, NodePlacement } from "./types";

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
    const loops = input.graph.edges.filter(
      (edge) => edge.sourceId === node.id && hasMovableLoopPorts(input, edge),
    );
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
      envelope[side] =
        spacing * (ordering === "SEQUENCED" ? Math.min(1, selected.length) : selected.length);
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
