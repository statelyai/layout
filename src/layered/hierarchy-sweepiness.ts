/* Native adaptation of ELK 0.11.1 LayerSweepTypeDecider. SPDX-License-Identifier: EPL-2.0 */
import { externalPortDummyOf } from "./external-port-dummy";
import type { CrossingGraph } from "./crossing-counter";
import type { LayeredPhaseInput } from "./types";

/**
 * Whether a child graph is swept on its own before its parent. Like ELK, a
 * node starts a random path when no western port carries an edge and ends one
 * when no eastern port does, on the canonical crossing graph's port sides.
 */
export function useBottomUpHierarchySweep(
  input: LayeredPhaseInput,
  graph: CrossingGraph,
  parent: {
    portOrderFixed: boolean;
    inputPorts: number;
    outputPorts: number;
    deterministic: boolean;
  },
): boolean {
  const boundary = input.settings["crossingMinimization.hierarchicalSweepiness"] ?? 0.1;
  if (boundary < -1 || parent.portOrderFixed || (parent.inputPorts < 2 && parent.outputPorts < 2))
    return true;
  if (parent.deterministic) return false;
  const nodes = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const owner = new Map<string, string>();
  for (const node of graph.layers.flat())
    for (const port of node.ports) owner.set(port.id, node.id);
  const degree = new Map<string, number>(),
    targets = new Map<string, string[]>();
  for (const { source, target } of graph.edges) {
    degree.set(source, (degree.get(source) ?? 0) + 1);
    degree.set(target, (degree.get(target) ?? 0) + 1);
    const from = owner.get(source)!;
    targets.set(from, [...(targets.get(from) ?? []), owner.get(target)!]);
  }
  const infos = new Map(
    graph.layers.flat().map((node) => [node.id, { random: 0, hierarchy: 0, edges: 0 }]),
  );
  let randomPaths = 0,
    hierarchyPaths = 0;
  const transfer = (source: string, target: string) => {
    const a = infos.get(source)!,
      b = infos.get(target)!;
    randomPaths += a.random;
    hierarchyPaths += a.hierarchy;
    b.random += a.random;
    b.hierarchy += a.hierarchy;
    b.edges += a.edges + 1;
  };
  const outputSide = ({ right: "EAST", left: "WEST", down: "SOUTH", up: "NORTH" } as const)[
    input.direction
  ];
  for (const layer of graph.layers) {
    const northSouth: string[] = [];
    for (const node of layer) {
      if (node.type === "NORTH_SOUTH_PORT") {
        northSouth.push(node.id);
        continue;
      }
      const state = infos.get(node.id)!;
      const connected = (side: string) =>
        node.ports.some((port) => port.side === side && degree.has(port.id));
      const external = externalPortDummyOf(nodes.get(node.id)!);
      if (external) {
        state.hierarchy = 1;
        if (external.side === outputSide) hierarchyPaths += state.edges;
      } else if (!connected("WEST")) state.random = 1;
      else if (!connected("EAST")) randomPaths += state.edges;
      for (const target of targets.get(node.id) ?? []) transfer(node.id, target);
      for (const port of node.ports)
        if ((port.side === "NORTH" || port.side === "SOUTH") && port.dummy)
          transfer(node.id, port.dummy);
    }
    for (const id of northSouth) for (const target of targets.get(id) ?? []) transfer(id, target);
  }
  const all = randomPaths + hierarchyPaths;
  return (all === 0 ? Number.POSITIVE_INFINITY : (randomPaths - hierarchyPaths) / all) >= boundary;
}
