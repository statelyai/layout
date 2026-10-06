import type { GraphNode, VisualGraph } from "@statelyai/graph";
import { worldGeometry } from "../authoring/coordinates";
import type { LayoutDiagnostic } from "../types";
import type { LayerOrder, LayeredPhaseInput, NodePlacement } from "./types";

/**
 * Hints steer the layered phases toward a reader's expectations. They are
 * preferences unless marked `require`, and never at the cost of a defect: a
 * hint that would make nodes overlap is relaxed and reported instead.
 */
export type HintStrength = "prefer" | "require";
interface HintBase {
  id: string;
  strength?: HintStrength;
}
/** Place a node at the start (top-left) or end of its container. */
export interface AnchorHint extends HintBase {
  kind: "anchor";
  nodeId: string;
  corner: "start" | "end";
}
/** Align the centers of nodes that follow each other, such as sequential states. */
export interface ChainHint extends HintBase {
  kind: "chain";
  nodeIds: readonly string[];
}
export type LayoutHint = AnchorHint | ChainHint;

/** Serializable hint constructors, alongside the `c` geometry constraint constructors. */
export const hint = {
  anchor: (value: Omit<AnchorHint, "kind">): AnchorHint => ({ ...value, kind: "anchor" }),
  chain: (value: Omit<ChainHint, "kind">): ChainHint => ({ ...value, kind: "chain" }),
};

const relaxed = (
  diagnostics: LayoutDiagnostic[] | undefined,
  item: LayoutHint,
  message: string,
): void => {
  diagnostics?.push({
    severity: "info",
    code: "HINT_RELAXED",
    message: `Hint ${item.id}: ${message}`,
    entityIds: item.kind === "anchor" ? [item.nodeId] : [...item.nodeIds],
  });
};

/** Layering: an anchored node takes the first or last layer of its scope. */
export function hintLayerConstraint(
  hints: readonly LayoutHint[] | undefined,
  node: GraphNode,
): "FIRST" | "LAST" | undefined {
  const anchor = hints?.find(
    (item): item is AnchorHint => item.kind === "anchor" && item.nodeId === node.id,
  );
  return anchor ? (anchor.corner === "start" ? "FIRST" : "LAST") : undefined;
}

/**
 * Ordering: an anchored node, with any helper nodes kept beside it, moves to
 * the start or end of its layer. A preferred anchor yields when the move
 * would add crossings.
 */
export function applyOrderHints(
  hints: readonly LayoutHint[] | undefined,
  order: LayerOrder,
  unitOf: (id: string) => readonly string[],
  crossings: (layers: LayerOrder["layers"]) => number,
  diagnostics?: LayoutDiagnostic[],
): LayerOrder {
  let layers = order.layers;
  for (const item of hints ?? []) {
    if (item.kind !== "anchor") continue;
    const index = layers.findIndex((layer) => layer.includes(item.nodeId));
    if (index < 0) continue;
    const unit = new Set([item.nodeId, ...unitOf(item.nodeId)]);
    const layer = layers[index]!;
    const members = layer.filter((id) => unit.has(id)),
      rest = layer.filter((id) => !unit.has(id));
    const moved = item.corner === "start" ? [...members, ...rest] : [...rest, ...members];
    if (moved.every((id, position) => id === layer[position])) continue;
    const candidate = layers.map((current, position) => (position === index ? moved : current));
    if ((item.strength ?? "prefer") === "prefer" && crossings(candidate) > crossings(layers)) {
      relaxed(diagnostics, item, "kept its layer position to avoid adding crossings");
      continue;
    }
    layers = candidate;
  }
  return layers === order.layers ? order : { ...order, layers };
}

/**
 * Placement: an anchored node moves to the start (or end) of its scope on the
 * cross axis, and chained nodes move onto the first member's center line,
 * each only as far as its layer neighbors allow.
 */
export function applyPlacementHints(
  hints: readonly LayoutHint[] | undefined,
  input: LayeredPhaseInput,
  order: LayerOrder,
  placement: NodePlacement,
  diagnostics?: LayoutDiagnostic[],
): void {
  if (!hints?.length) return;
  const rects = placement.rectByNodeId as Map<
    string,
    { x: number; y: number; width: number; height: number }
  >;
  const horizontal = input.direction === "right" || input.direction === "left";
  const cross = (id: string) => {
    const rect = rects.get(id)!;
    return horizontal ? { start: rect.y, size: rect.height } : { start: rect.x, size: rect.width };
  };
  const setCross = (id: string, start: number) => {
    const rect = rects.get(id)!;
    rects.set(id, horizontal ? { ...rect, y: start } : { ...rect, x: start });
  };
  const position = new Map<string, { layer: readonly string[]; index: number }>();
  for (const layer of order.layers)
    for (const [index, id] of layer.entries()) position.set(id, { layer, index });
  const gap = (id: string) => (id.startsWith("__") ? 10 : input.spacing.node);
  // The free interval for a node's cross start between its layer neighbors.
  const room = (id: string) => {
    const at = position.get(id);
    const own = cross(id);
    if (!at) return { low: own.start, high: own.start };
    const before = at.layer[at.index - 1],
      after = at.layer[at.index + 1];
    const low = before
      ? cross(before).start + cross(before).size + Math.max(gap(before), gap(id))
      : Number.NEGATIVE_INFINITY;
    const high = after
      ? cross(after).start - own.size - Math.max(gap(after), gap(id))
      : Number.POSITIVE_INFINITY;
    // Never grow the scope: stay within its current cross extent.
    const bounded = {
      low: Math.max(low, extent.start),
      high: Math.min(high, extent.end - own.size),
    };
    return {
      low: Math.min(bounded.low, own.start),
      high: Math.max(bounded.high, own.start),
    };
  };
  const real = [...rects.keys()].filter((id) => !id.startsWith("__"));
  const extent = {
    start: Math.min(...[...rects.keys()].map((id) => cross(id).start)),
    end: Math.max(...[...rects.keys()].map((id) => cross(id).start + cross(id).size)),
  };
  for (const item of hints) {
    if (item.kind === "anchor") {
      if (!rects.has(item.nodeId)) continue;
      const own = cross(item.nodeId);
      const target =
        item.corner === "start"
          ? Math.min(...real.map((id) => cross(id).start))
          : Math.max(...real.map((id) => cross(id).start + cross(id).size)) - own.size;
      const { low, high } = room(item.nodeId);
      const placed = Math.min(high, Math.max(low, target));
      setCross(item.nodeId, placed);
      if (Math.abs(placed - target) > 1e-6)
        relaxed(diagnostics, item, "a neighbor in its layer kept it from the corner");
    } else {
      const members = item.nodeIds.filter((id) => rects.has(id));
      if (members.length < 2) continue;
      const anchored = members.find((id) =>
        hints.some((other) => other.kind === "anchor" && other.nodeId === id),
      );
      // Find the center line every member can reach, nearest the first member
      // (or the anchored one, which stays put).
      const reach = members.map((id) => {
        const own = cross(id);
        if (id === anchored) {
          const center = own.start + own.size / 2;
          return { low: center, high: center };
        }
        const { low, high } = room(id);
        return { low: low + own.size / 2, high: high + own.size / 2 };
      });
      const line = cross(anchored ?? members[0]!);
      const preferred = line.start + line.size / 2;
      const low = Math.max(...reach.map((range) => range.low)),
        high = Math.min(...reach.map((range) => range.high));
      const center = low <= high ? Math.min(high, Math.max(low, preferred)) : preferred;
      let blocked = low > high;
      for (const [index, id] of members.entries()) {
        if (id === anchored) continue;
        const own = cross(id);
        const range = reach[index]!;
        const placed = Math.min(range.high, Math.max(range.low, center)) - own.size / 2;
        setCross(id, placed);
        if (Math.abs(placed + own.size / 2 - center) > 1e-6) blocked = true;
      }
      if (blocked) relaxed(diagnostics, item, "layer neighbors kept some members off the line");
    }
  }
}

/**
 * Hints for statecharts: each container's initial state (and the graph's)
 * is required at the start, and each run of states joined one-to-one within
 * the same parent forms a preferred chain. Callers can filter or extend the
 * result.
 */
export function statechartHints(graph: {
  initialNodeId?: string | null;
  nodes: readonly { id: string; parentId?: string | null; initialNodeId?: string | null }[];
  edges: readonly { sourceId: string; targetId: string }[];
}): LayoutHint[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const hints: LayoutHint[] = [];
  const initials = [
    ...(graph.initialNodeId ? [{ scope: "root", id: graph.initialNodeId }] : []),
    ...graph.nodes.flatMap((node) =>
      node.initialNodeId ? [{ scope: node.id, id: node.initialNodeId }] : [],
    ),
  ];
  for (const { scope, id } of initials)
    if (nodes.has(id))
      hints.push(
        hint.anchor({ id: `initial:${scope}`, nodeId: id, corner: "start", strength: "require" }),
      );
  // One-to-one transitions between siblings, ignoring self loops.
  const outgoing = new Map<string, Set<string>>(),
    incoming = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    outgoing.set(edge.sourceId, (outgoing.get(edge.sourceId) ?? new Set()).add(edge.targetId));
    incoming.set(edge.targetId, (incoming.get(edge.targetId) ?? new Set()).add(edge.sourceId));
  }
  const next = (id: string) => {
    const targets = outgoing.get(id);
    if (targets?.size !== 1) return undefined;
    const [target] = targets;
    const node = nodes.get(id),
      other = nodes.get(target!);
    return other &&
      (other.parentId ?? null) === (node?.parentId ?? null) &&
      incoming.get(target!)?.size === 1
      ? target
      : undefined;
  };
  const previous = new Set(
    graph.nodes.flatMap((node) => {
      const target = next(node.id);
      return target ? [target] : [];
    }),
  );
  for (const node of graph.nodes) {
    if (previous.has(node.id)) continue;
    const chain = [node.id];
    for (let id = next(node.id); id && !chain.includes(id); id = next(id)) chain.push(id);
    if (chain.length >= 2) hints.push(hint.chain({ id: `chain:${node.id}`, nodeIds: chain }));
  }
  return hints;
}

interface SoftQuality {
  crossings: number;
  bends: number;
  length: number;
  area: number;
}
/** Soft measures of a finished layout, in world coordinates. */
export function measureSoftQuality(graph: VisualGraph): SoftQuality {
  const world = worldGeometry(graph);
  const rects = new Map(world.nodes.map((node) => [node.id, node]));
  const routes = world.edges.map((edge) => {
    const points = edge.points ?? [];
    return {
      ends: [edge.sourceId, edge.targetId],
      segments: points.slice(1).map((b, index) => ({ a: points[index]!, b })),
    };
  });
  let bends = 0,
    length = 0;
  for (const { segments } of routes)
    for (const [index, { a, b }] of segments.entries()) {
      length += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const previous = segments[index - 1];
      if (previous && Math.abs(previous.a.x - previous.b.x) < 1e-9 !== Math.abs(a.x - b.x) < 1e-9)
        bends++;
    }
  let crossings = 0;
  for (const [index, first] of routes.entries())
    for (const second of routes.slice(index + 1)) {
      const shared = first.ends
        .filter((id) => second.ends.includes(id))
        .flatMap((id) => {
          const rect = rects.get(id);
          return rect ? [rect] : [];
        });
      for (const s of first.segments)
        for (const t of second.segments) {
          const sHorizontal = Math.abs(s.a.y - s.b.y) < 1e-9,
            tHorizontal = Math.abs(t.a.y - t.b.y) < 1e-9;
          if (sHorizontal === tHorizontal) continue;
          const h = sHorizontal ? s : t,
            v = sHorizontal ? t : s;
          const x = v.a.x,
            y = h.a.y;
          if (
            x > Math.min(h.a.x, h.b.x) + 1e-6 &&
            x < Math.max(h.a.x, h.b.x) - 1e-6 &&
            y > Math.min(v.a.y, v.b.y) + 1e-6 &&
            y < Math.max(v.a.y, v.b.y) - 1e-6 &&
            shared.every(
              (rect) =>
                x < rect.x - 12 ||
                x > rect.x + rect.width + 12 ||
                y < rect.y - 12 ||
                y > rect.y + rect.height + 12,
            )
          )
            crossings++;
        }
    }
  const xs = world.nodes.flatMap((node) => [node.x, node.x + node.width]),
    ys = world.nodes.flatMap((node) => [node.y, node.y + node.height]);
  const area = xs.length
    ? (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
    : 0;
  return { crossings, bends, length, area };
}

/** True when `candidate` is worse at the first soft measure where the two differ. */
export function isSoftRegression(candidate: SoftQuality, baseline: SoftQuality): boolean {
  for (const key of ["crossings", "bends", "length", "area"] as const) {
    const limit = key === "length" || key === "area" ? 0.02 * Math.abs(baseline[key]) : 0;
    if (Math.abs(candidate[key] - baseline[key]) > limit) return candidate[key] > baseline[key];
  }
  return false;
}

/**
 * Lay out with every hint, keeping preferred hints only while they do not
 * make the layout worse than one without them. Usually two layouts; when the
 * full set regresses, preferred hints are added back one at a time.
 */
export function layoutWithHints<T extends VisualGraph>(
  hints: readonly LayoutHint[] | undefined,
  run: (hints: readonly LayoutHint[] | undefined, diagnostics: LayoutDiagnostic[]) => T,
  diagnostics?: LayoutDiagnostic[],
): T {
  const preferred = hints?.filter((item) => (item.strength ?? "prefer") === "prefer") ?? [];
  if (!preferred.length) return run(hints, diagnostics ?? []);
  const required = hints!.filter((item) => item.strength === "require");
  const attempt = (selected: readonly LayoutHint[]) => {
    const own: LayoutDiagnostic[] = [];
    const graph = run(selected, own);
    return { graph, own, quality: measureSoftQuality(graph) };
  };
  let best = attempt(required);
  const all = attempt(hints!);
  let kept: LayoutHint[] = [...required];
  if (!isSoftRegression(all.quality, best.quality)) {
    best = all;
    kept = [...hints!];
  } else
    for (const item of preferred) {
      const candidate = attempt([...kept, item]);
      if (isSoftRegression(candidate.quality, best.quality)) continue;
      best = candidate;
      kept.push(item);
    }
  diagnostics?.push(...best.own);
  for (const item of preferred)
    if (!kept.includes(item))
      relaxed(diagnostics, item, "dropped because it made the layout worse");
  return best.graph;
}
