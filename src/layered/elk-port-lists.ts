import type { GraphEdge, GraphNode } from "@statelyai/graph";
import { orientConstrainedEdges } from "./constraint-orientation";
import type { AcyclicOrientation, LayeredPhaseInput } from "./types";

/** One ELK port: its authored name (implicit edge ports have none) and edge lists. */
export interface PortEdgeList {
  name?: string;
  outgoing: string[];
  incoming: string[];
}

/** ELK imports ports in authored order; side sorting happens after dummy insertion. */
export function authoredPortIndex(
  input: LayeredPhaseInput,
  node: GraphNode | undefined,
  name: string | undefined,
): number {
  const port = name === undefined ? undefined : node?.ports?.find((p) => p.name === name);
  if (!node || !port) return -1;
  const settings = input.portSettings?.(port, node) as
    | { "port.authoredIndex"?: number }
    | undefined;
  return settings?.["port.authoredIndex"] ?? node.ports!.indexOf(port);
}

/**
 * Replays ELK's per-port edge lists through import, EdgeAndLayerConstraintEdgeReverser
 * and cycle breaking. ELK appends a reversed edge to the end of its new ports'
 * lists, so an edge's position records its reversal history.
 */
export function simulatePortEdgeLists(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
): Map<string, PortEdgeList[]> {
  const ports = new Map<string, PortEdgeList[]>();
  for (const node of input.graph.nodes) {
    const authored = (node.ports ?? [])
      .map((port) => ({ name: port.name, index: authoredPortIndex(input, node, port.name) }))
      .sort((a, b) => a.index - b.index);
    ports.set(
      node.id,
      authored.map(({ name }) => ({ name, outgoing: [], incoming: [] })),
    );
  }
  const ends = new Map<string, { source: PortEdgeList; target: PortEdgeList }>();
  const portOf = (nodeId: string, name: string | undefined): PortEdgeList | undefined => {
    const list = ports.get(nodeId);
    if (!list) return undefined;
    const named = name === undefined ? undefined : list.find((port) => port.name === name);
    if (named) return named;
    // Edges without an authored port receive their own port at import.
    const port: PortEdgeList = { outgoing: [], incoming: [] };
    list.push(port);
    return port;
  };
  const edges: GraphEdge[] = [];
  for (const edge of input.graph.edges) {
    if (edge.sourceId === edge.targetId) continue;
    const source = portOf(edge.sourceId, edge.sourcePort);
    const target = portOf(edge.targetId, edge.targetPort);
    if (!source || !target) continue;
    source.outgoing.push(edge.id);
    target.incoming.push(edge.id);
    ends.set(edge.id, { source, target });
    edges.push(edge);
  }
  // Local edges keep import order; hierarchy segments follow in creation order.
  const position = new Map(input.graph.edges.map((edge, index) => [edge.id, index]));
  const segment = new Map(
    input.graph.edges.flatMap((edge) => {
      const rank = (input.edgeSettings?.(edge) as { "edge.hierarchyRank"?: number } | undefined)?.[
        "edge.hierarchyRank"
      ];
      return rank === undefined ? [] : [[edge.id, rank] as const];
    }),
  );
  const importOrder = (a: string, b: string) =>
    Number(segment.has(a)) - Number(segment.has(b)) ||
    (segment.get(a) ?? 0) - (segment.get(b) ?? 0) ||
    position.get(a)! - position.get(b)!;
  for (const list of ports.values())
    for (const port of list) {
      port.outgoing.sort(importOrder);
      port.incoming.sort(importOrder);
    }
  const reverse = (id: string) => {
    const end = ends.get(id)!;
    end.source.outgoing.splice(end.source.outgoing.indexOf(id), 1);
    end.target.incoming.splice(end.target.incoming.indexOf(id), 1);
    end.target.outgoing.push(id);
    end.source.incoming.push(id);
    ends.set(id, { source: end.target, target: end.source });
  };
  const replay = (
    pending: Set<string>,
    visit: (node: GraphNode) => "outgoing" | "incoming" | "all" | undefined,
  ) => {
    for (const node of input.graph.nodes) {
      const kind = visit(node);
      if (!kind) continue;
      // Like ELK, iterate copies: reversal moves edges between these lists.
      for (const port of (ports.get(node.id) ?? []).slice()) {
        if (kind !== "incoming")
          for (const id of port.outgoing.slice()) if (pending.delete(id)) reverse(id);
        if (kind !== "outgoing")
          for (const id of port.incoming.slice()) if (pending.delete(id)) reverse(id);
      }
    }
  };
  const known = new Set(edges.map((edge) => edge.id));
  const prepared = orientConstrainedEdges(input, new Set());
  const constrained = new Set([...prepared.reversedEdgeIds].filter((id) => known.has(id)));
  const wholeNodes = new Set(prepared.reversedNodeIds);
  const constraint = (node: GraphNode) =>
    String(input.nodeSettings?.(node)?.["layering.layerConstraint"] ?? "NONE");
  // Outer FIRST/LAST nodes reverse first; the remaining nodes may reverse whole.
  const pending = new Set(constrained);
  replay(pending, (node) =>
    constraint(node).startsWith("FIRST")
      ? "incoming"
      : constraint(node).startsWith("LAST")
        ? "outgoing"
        : undefined,
  );
  replay(pending, (node) => (wholeNodes.has(node.id) ? "all" : undefined));
  for (const id of pending) reverse(id);
  // The cycle breaker reverses the remaining difference while visiting outgoing edges.
  const cycles = new Set(
    [...known].filter((id) => orientation.reversedEdgeIds.has(id) !== constrained.has(id)),
  );
  replay(cycles, () => "outgoing");
  for (const id of cycles) reverse(id);
  return ports;
}

/**
 * LabelDummyInserter keeps a labeled edge on its source port and moves the
 * dummy's outgoing part to the end of the target port's incoming edges.
 */
export function insertLabelDummyPorts(
  lists: ReadonlyMap<string, readonly PortEdgeList[]>,
  orientation: AcyclicOrientation,
  segmentIdsByEdgeId: ReadonlyMap<string, readonly string[]>,
): Map<string, PortEdgeList[]> {
  const result = new Map(
    [...lists].map(([id, ports]) => [
      id,
      ports.map((port) => ({
        ...port,
        outgoing: [...port.outgoing],
        incoming: [...port.incoming],
      })),
    ]),
  );
  const dummies: [string, PortEdgeList[]][] = [];
  for (const ports of result.values()) {
    for (const port of ports) {
      for (const id of port.outgoing) {
        const parts = segmentIdsByEdgeId.get(id);
        if (parts?.length !== 2) continue;
        const reversed = orientation.reversedEdgeIds.has(id);
        const [head, tail] = reversed ? [parts[1]!, parts[0]!] : [parts[0]!, parts[1]!];
        port.outgoing[port.outgoing.indexOf(id)] = head;
        for (const target of result.values())
          for (const candidate of target) {
            const at = candidate.incoming.indexOf(id);
            if (at < 0) continue;
            candidate.incoming.splice(at, 1);
            candidate.incoming.push(tail);
          }
        dummies.push([
          `__layout_dummy:label:${id}`,
          [
            { name: "input", outgoing: [], incoming: [head] },
            { name: "output", outgoing: [tail], incoming: [] },
          ],
        ]);
      }
    }
  }
  for (const [id, ports] of dummies) result.set(id, ports);
  return result;
}

/**
 * ELK's network-simplex layerer orders nodes by connected-component DFS. Each
 * visit walks ports in list order, incoming edges before outgoing edges; a
 * component larger than the current first one moves to the front.
 */
export function elkComponentOrder(
  input: LayeredPhaseInput,
  lists: ReadonlyMap<string, readonly PortEdgeList[]>,
): string[] {
  const endpoints = new Map(input.graph.edges.map((edge) => [edge.id, edge]));
  const nodeIds = new Set(input.graph.nodes.map((node) => node.id));
  const visited = new Set<string>();
  const components: string[][] = [];
  const neighbors = (id: string) =>
    (lists.get(id) ?? []).flatMap((port) =>
      [...port.incoming, ...port.outgoing].flatMap((edgeId) => {
        const edge = endpoints.get(edgeId);
        const opposite = edge && (edge.sourceId === id ? edge.targetId : edge.sourceId);
        return opposite && nodeIds.has(opposite) ? [opposite] : [];
      }),
    );
  const visit = (root: string, component: string[]) => {
    visited.add(root);
    component.push(root);
    const stack = [{ next: neighbors(root), index: 0 }];
    while (stack.length > 0) {
      const frame = stack.at(-1)!;
      const id = frame.next[frame.index++];
      if (id === undefined) stack.pop();
      else if (!visited.has(id)) {
        visited.add(id);
        component.push(id);
        stack.push({ next: neighbors(id), index: 0 });
      }
    }
  };
  for (const node of input.graph.nodes) {
    if (visited.has(node.id)) continue;
    const component: string[] = [];
    visit(node.id, component);
    if (components.length > 0 && components[0]!.length >= component.length)
      components.push(component);
    else components.unshift(component);
  }
  return components.flat();
}
