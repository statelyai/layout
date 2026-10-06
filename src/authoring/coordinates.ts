import { LayoutError } from "../errors";
import type { VisualGraph, Point } from "@statelyai/graph";

/** Legacy sibling edges are parent-relative; native compound output marks world-space edges. */
function frames<N, E, G, P>(graph: VisualGraph<N, E, G, P>) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const offsets = new Map<string, Point>();
  const visiting = new Set<string>();
  function offset(id: string): Point {
    const cached = offsets.get(id);
    if (cached) return cached;
    if (visiting.has(id))
      throw new LayoutError(`Cyclic parent hierarchy at ${id}`, "INVALID_GRAPH");
    visiting.add(id);
    const parentId = nodes.get(id)?.parentId;
    if (parentId == null) {
      const origin = { x: 0, y: 0 };
      visiting.delete(id);
      offsets.set(id, origin);
      return origin;
    }
    const parent = nodes.get(parentId)!;
    const ancestor = offset(parentId);
    const result = { x: ancestor.x + parent.x, y: ancestor.y + parent.y };
    visiting.delete(id);
    offsets.set(id, result);
    return result;
  }
  for (const node of graph.nodes) offsets.set(node.id, offset(node.id));
  const edgeOffsets = new Map(
    graph.edges.map((edge) => {
      const source = nodes.get(edge.sourceId)!;
      const target = nodes.get(edge.targetId)!;
      return [
        edge.id,
        (graph as VisualGraph & { edgeCoordinateSpace?: string }).edgeCoordinateSpace !== "world" &&
        (source.parentId ?? null) === (target.parentId ?? null)
          ? offset(source.id)
          : { x: 0, y: 0 },
      ] as const;
    }),
  );
  return { nodes: offsets, edges: edgeOffsets };
}

export function worldGeometry<N, E, G, P>(graph: VisualGraph<N, E, G, P>): VisualGraph<N, E, G, P> {
  const offsets = frames(graph);
  const base = { ...graph } as VisualGraph<N, E, G, P> & {
    compoundRoutes?: unknown;
    compoundGeometry?: unknown;
  };
  // Authoring may change nodes, labels, or paths. Never carry derived full-layout caches.
  delete base.compoundRoutes;
  delete base.compoundGeometry;
  return {
    ...base,
    nodes: graph.nodes.map((n) => {
      const p = offsets.nodes.get(n.id)!;
      return p.x === 0 && p.y === 0 ? n : { ...n, x: n.x + p.x, y: n.y + p.y };
    }),
    edges: graph.edges.map((e) => {
      const p = offsets.edges.get(e.id)!;
      return p.x === 0 && p.y === 0
        ? e
        : {
            ...e,
            x: e.x + p.x,
            y: e.y + p.y,
            ...(e.points ? { points: e.points.map((v) => ({ x: v.x + p.x, y: v.y + p.y })) } : {}),
          };
    }),
  };
}

/**
 * Convert solved world geometry back to parent-relative coordinates, using
 * each parent's solved position. Untouched coordinates stay exactly as authored.
 */
export function nativeGeometry<N, E, G, P>(
  graph: VisualGraph<N, E, G, P>,
  original: VisualGraph<N, E, G, P>,
): VisualGraph<N, E, G, P> {
  const offsets = frames(original);
  const world = worldGeometry(original);
  const originalNodes = new Map(original.nodes.map((n) => [n.id, n]));
  const originalEdges = new Map(original.edges.map((e) => [e.id, e]));
  const worldNodes = new Map(world.nodes.map((n) => [n.id, n]));
  const worldEdges = new Map(world.edges.map((e) => [e.id, e]));
  const solved = new Map(graph.nodes.map((n) => [n.id, n]));
  const frame = (id: string): Point => {
    const parentId = originalNodes.get(id)?.parentId;
    const parent = parentId == null ? undefined : solved.get(parentId);
    return parent ? { x: parent.x, y: parent.y } : { x: 0, y: 0 };
  };
  const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const p = frame(n.id),
        before = originalNodes.get(n.id)!,
        prior = worldNodes.get(n.id)!;
      const kept = same(p, offsets.nodes.get(n.id)!);
      return {
        ...n,
        x: kept && n.x === prior.x ? before.x : n.x - p.x,
        y: kept && n.y === prior.y ? before.y : n.y - p.y,
      };
    }),
    edges: graph.edges.map((e) => {
      const old = offsets.edges.get(e.id)!,
        before = originalEdges.get(e.id)!,
        prior = worldEdges.get(e.id)!;
      const source = originalNodes.get(e.sourceId)!,
        target = originalNodes.get(e.targetId)!;
      // Same rule as frames(): sibling edges in legacy space use their parent's frame.
      const p =
        (original as VisualGraph & { edgeCoordinateSpace?: string }).edgeCoordinateSpace !==
          "world" && (source.parentId ?? null) === (target.parentId ?? null)
          ? frame(source.id)
          : { x: 0, y: 0 };
      const kept = same(p, old);
      const points =
        kept && JSON.stringify(e.points) === JSON.stringify(prior.points)
          ? before.points
          : e.points?.map((v) => ({ x: v.x - p.x, y: v.y - p.y }));
      return {
        ...e,
        x: kept && e.x === prior.x ? before.x : e.x - p.x,
        y: kept && e.y === prior.y ? before.y : e.y - p.y,
        ...(points === undefined ? {} : { points }),
      };
    }),
  };
}
