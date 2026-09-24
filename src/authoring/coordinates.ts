import { LayoutError } from "../errors";
import type { VisualGraph, Point } from "@statelyai/graph";

/** Native compound nodes and sibling edges are parent-relative; crossing edges are world-relative. */
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
  return {
    ...graph,
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

/** Ancestor frames stay fixed during authoring. Preserve untouched coordinates exactly. */
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
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const p = offsets.nodes.get(n.id)!,
        before = originalNodes.get(n.id)!,
        prior = worldNodes.get(n.id)!;
      return {
        ...n,
        x: n.x === prior.x ? before.x : n.x - p.x,
        y: n.y === prior.y ? before.y : n.y - p.y,
      };
    }),
    edges: graph.edges.map((e) => {
      const p = offsets.edges.get(e.id)!,
        before = originalEdges.get(e.id)!,
        prior = worldEdges.get(e.id)!;
      const points =
        JSON.stringify(e.points) === JSON.stringify(prior.points)
          ? before.points
          : e.points?.map((v) => ({ x: v.x - p.x, y: v.y - p.y }));
      return {
        ...e,
        x: e.x === prior.x ? before.x : e.x - p.x,
        y: e.y === prior.y ? before.y : e.y - p.y,
        ...(points === undefined ? {} : { points }),
      };
    }),
  };
}
