/* ELK self-loop port hiding and restoration. SPDX-License-Identifier: EPL-2.0 */
import type { Graph, GraphEdge, GraphPort, Point, VisualGraph, VisualPort } from "@statelyai/graph";
import type { LayeredLayoutOptions } from "./index";

interface PortSize {
  width: number;
  height: number;
}
export interface HiddenLoopPorts {
  source: PortSize;
  target: PortSize;
}

const hiddenBySettings = new WeakMap<object, ReadonlyMap<string, HiddenLoopPorts>>();

/** Sizes of the ports SelfLoopPreProcessor hid from a loop, if any. */
export function hiddenLoopPorts(settings: object, edgeId: string): HiddenLoopPorts | undefined {
  return hiddenBySettings.get(settings)?.get(edgeId);
}

/**
 * ELK's SelfLoopPreProcessor removes ports that carry only self loops from
 * nodes whose port order is not fixed, and SelfLoopPortRestorer later puts
 * them on the loop's side. The layered phases then see implicit loop ports;
 * {@link restoreSelfLoopPorts} places the hidden ports at the loop ends.
 */
export function hideSelfLoopPorts<N, E, G, P>(
  graph: Graph<N, E, G, P>,
  options: LayeredLayoutOptions,
):
  | {
      graph: Graph<N, E, G, P>;
      options: LayeredLayoutOptions;
      edges: ReadonlyMap<string, GraphEdge<E>>;
    }
  | undefined {
  const uses = new Map<string, number>();
  const nonLoop = new Set<string>();
  for (const edge of graph.edges) {
    for (const [node, port] of [
      [edge.sourceId, edge.sourcePort],
      [edge.targetId, edge.targetPort],
    ] as const) {
      if (port === undefined) continue;
      const key = `${node}\0${port}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
      if (edge.sourceId !== edge.targetId) nonLoop.add(key);
    }
  }
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const hidden = new Map<string, HiddenLoopPorts>();
  const edges = new Map<string, GraphEdge<E>>();
  const hiddenPorts = new Set<string>();
  for (const edge of graph.edges) {
    if (
      edge.sourceId !== edge.targetId ||
      edge.sourcePort === undefined ||
      edge.targetPort === undefined ||
      edge.sourcePort === edge.targetPort
    )
      continue;
    const node = nodeById.get(edge.sourceId);
    const constraints = node && options.nodeSettings?.(node)?.portConstraints;
    if (
      !node ||
      (constraints !== undefined && constraints !== "FREE" && constraints !== "UNDEFINED")
    )
      continue;
    // One loop per port: shared ports would make a self hyperloop.
    const ports = [edge.sourcePort, edge.targetPort].map((name) =>
      node.ports?.find((port) => port.name === name),
    );
    if (
      ports.some(
        (port) =>
          !port ||
          uses.get(`${node.id}\0${port.name}`) !== 1 ||
          nonLoop.has(`${node.id}\0${port.name}`),
      )
    )
      continue;
    const size = (port: GraphPort<P>) => ({ width: port.width ?? 0, height: port.height ?? 0 });
    hidden.set(edge.id, { source: size(ports[0]!), target: size(ports[1]!) });
    edges.set(edge.id, edge);
    for (const port of ports) hiddenPorts.add(`${node.id}\0${port!.name}`);
  }
  if (hidden.size === 0) return undefined;
  const settings = { ...options.settings };
  hiddenBySettings.set(settings, hidden);
  return {
    graph: {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.ports?.some((port) => hiddenPorts.has(`${node.id}\0${port.name}`))
          ? {
              ...node,
              ports: node.ports.filter((port) => !hiddenPorts.has(`${node.id}\0${port.name}`)),
            }
          : node,
      ),
      edges: graph.edges.map((edge) =>
        hidden.has(edge.id) ? { ...edge, sourcePort: undefined, targetPort: undefined } : edge,
      ),
    },
    options: { ...options, settings },
    edges,
  };
}

/** Put hidden loop ports back, anchored on the side their loop leaves from. */
export function restoreSelfLoopPorts<N, E, G, P>(
  graph: Graph<N, E, G, P>,
  result: VisualGraph<N, E, G, P>,
  edges: ReadonlyMap<string, GraphEdge<E>>,
): VisualGraph<N, E, G, P> {
  const anchors = new Map<string, Point>();
  for (const edge of result.edges) {
    const original = edges.get(edge.id);
    const points = edge.points;
    if (!original || !points?.length) continue;
    anchors.set(`${edge.sourceId}\0${original.sourcePort}`, points[0]!);
    anchors.set(`${edge.targetId}\0${original.targetPort}`, points.at(-1)!);
  }
  const originalById = new Map(graph.nodes.map((node) => [node.id, node]));
  return {
    ...result,
    nodes: result.nodes.map((node) => {
      const original = originalById.get(node.id)?.ports;
      if (!original?.some((port) => anchors.has(`${node.id}\0${port.name}`))) return node;
      const placed = new Map(node.ports?.map((port) => [port.name, port]));
      return {
        ...node,
        ports: original.map((port): VisualPort<P> => {
          const anchor = anchors.get(`${node.id}\0${port.name}`);
          const width = port.width ?? 0,
            height = port.height ?? 0;
          if (!anchor) return placed.get(port.name) ?? { ...port, width, height, x: 0, y: 0 };
          const x = anchor.x - node.x,
            y = anchor.y - node.y;
          // The loop leaves from the port's outer border, centered on it.
          return {
            ...port,
            width,
            height,
            x: x <= 0 ? x : x >= node.width ? x - width : x - width / 2,
            y: x <= 0 || x >= node.width ? y - height / 2 : y <= 0 ? y : y - height,
          };
        }),
      };
    }),
    edges: result.edges.map((edge) => {
      const original = edges.get(edge.id);
      return original
        ? { ...edge, sourcePort: original.sourcePort, targetPort: original.targetPort }
        : edge;
    }),
  };
}
