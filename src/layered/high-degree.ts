import type { GraphEdge } from "@statelyai/graph";
import type { AcyclicOrientation, LayerAssignment, LayeredPhaseInput } from "./types";

interface Tree {
  nodesAtDepth: Map<number, Set<string>>;
  height: number;
}

function endpoints(edge: GraphEdge, orientation: AcyclicOrientation): [string, string] {
  return orientation.reversedEdgeIds.has(edge.id)
    ? [edge.targetId, edge.sourceId]
    : [edge.sourceId, edge.targetId];
}

/** ELK's post-layering treatment for leaf trees around high-degree nodes. */
export function applyHighDegreeNodeTreatment(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  assignment: LayerAssignment,
): LayerAssignment {
  if (input.settings["highDegreeNodes.treatment"] !== true) return assignment;
  const threshold = Math.max(0, Number(input.settings["highDegreeNodes.threshold"] ?? 16));
  const configuredHeight = Math.max(0, Number(input.settings["highDegreeNodes.treeHeight"] ?? 5));
  const maximumHeight = configuredHeight === 0 ? Number.POSITIVE_INFINITY : configuredHeight;
  const incoming = new Map<string, GraphEdge[]>();
  const outgoing = new Map<string, GraphEdge[]>();
  for (const node of input.graph.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const edge of input.graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    const [source, target] = endpoints(edge, orientation);
    outgoing.get(source)?.push(edge);
    incoming.get(target)?.push(edge);
  }
  const degree = (id: string) => (incoming.get(id)?.length ?? 0) + (outgoing.get(id)?.length ?? 0);
  const isHighDegree = (id: string) => degree(id) >= threshold;
  const other = (edge: GraphEdge, id: string) => {
    const [source, target] = endpoints(edge, orientation);
    return source === id ? target : source;
  };
  const hasSingleConnection = (id: string, edges: readonly GraphEdge[]) => {
    let connection: string | undefined;
    for (const edge of edges) {
      const candidate = other(edge, id);
      if (connection === undefined) connection = candidate;
      else if (connection !== candidate) return false;
    }
    return true;
  };
  const collectTree = (
    root: string,
    ancestors: ReadonlyMap<string, GraphEdge[]>,
    descendants: ReadonlyMap<string, GraphEdge[]>,
  ): Tree | undefined => {
    const nodesAtDepth = new Map<number, Set<string>>();
    const visiting = new Set<string>();
    const visit = (id: string, depth: number): number | undefined => {
      if (isHighDegree(id) || visiting.has(id) || depth > maximumHeight) return undefined;
      if (!hasSingleConnection(id, ancestors.get(id) ?? [])) return undefined;
      visiting.add(id);
      let height = 1;
      for (const edge of descendants.get(id) ?? []) {
        const childHeight = visit(other(edge, id), depth + 1);
        if (childHeight === undefined) {
          visiting.delete(id);
          return undefined;
        }
        height = Math.max(height, childHeight + 1);
      }
      visiting.delete(id);
      if (height > maximumHeight) return undefined;
      const bucket = nodesAtDepth.get(depth) ?? new Set<string>();
      bucket.add(id);
      nodesAtDepth.set(depth, bucket);
      return height;
    };
    const height = visit(root, 1);
    return height === undefined ? undefined : { nodesAtDepth, height };
  };

  const maximumLayer = Math.max(0, ...assignment.layerByNodeId.values());
  const originalLayers = Array.from({ length: maximumLayer + 1 }, () => [] as string[]);
  for (const node of input.graph.nodes) {
    originalLayers[assignment.layerByNodeId.get(node.id) ?? 0]?.push(node.id);
  }
  const beforeByLayer = new Map<number, Tree[]>();
  const afterByLayer = new Map<number, Tree[]>();
  const moved = new Set<string>();
  const remember = (target: Map<number, Tree[]>, layer: number, tree: Tree) => {
    const trees = target.get(layer) ?? [];
    trees.push(tree);
    target.set(layer, trees);
    for (const nodes of tree.nodesAtDepth.values()) for (const node of nodes) moved.add(node);
  };
  for (const [layer, ids] of originalLayers.entries()) {
    for (const id of ids) {
      if (!isHighDegree(id)) continue;
      for (const edge of incoming.get(id) ?? []) {
        const tree = collectTree(other(edge, id), outgoing, incoming);
        if (tree) remember(beforeByLayer, layer, tree);
      }
      for (const edge of outgoing.get(id) ?? []) {
        const tree = collectTree(other(edge, id), incoming, outgoing);
        if (tree) remember(afterByLayer, layer, tree);
      }
    }
  }

  const rebuilt: string[][] = [];
  for (const [layer, ids] of originalLayers.entries()) {
    const before = beforeByLayer.get(layer) ?? [];
    for (let depth = Math.max(0, ...before.map((tree) => tree.height)); depth >= 1; depth--) {
      rebuilt.push(before.flatMap((tree) => [...(tree.nodesAtDepth.get(depth) ?? [])]));
    }
    rebuilt.push(ids.filter((id) => !moved.has(id)));
    const after = afterByLayer.get(layer) ?? [];
    for (let depth = 1; depth <= Math.max(0, ...after.map((tree) => tree.height)); depth++) {
      rebuilt.push(after.flatMap((tree) => [...(tree.nodesAtDepth.get(depth) ?? [])]));
    }
  }
  const nonempty = rebuilt.filter((layer) => layer.length > 0);
  return {
    layerByNodeId: new Map(nonempty.flatMap((ids, layer) => ids.map((id) => [id, layer] as const))),
  };
}
