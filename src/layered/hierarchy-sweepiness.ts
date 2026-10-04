/* Native adaptation of ELK 0.11.1 LayerSweepTypeDecider. SPDX-License-Identifier: EPL-2.0 */
import { externalPortDummyOf } from "./external-port-dummy";
import { getCrossingUnits } from "./crossing-constraints";
import type { AcyclicOrientation, LayeredPhaseInput } from "./types";

export function useBottomUpHierarchySweep(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  layers: readonly (readonly string[])[],
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
  const infos = new Map(
    input.graph.nodes.map((node) => [node.id, { random: 0, hierarchy: 0, edges: 0 }]),
  );
  const outgoing = new Map<string, string[]>(),
    incoming = new Map<string, string[]>();
  for (const edge of input.graph.edges) {
    const reversed = orientation.reversedEdgeIds.has(edge.id);
    const source = reversed ? edge.targetId : edge.sourceId,
      target = reversed ? edge.sourceId : edge.targetId;
    outgoing.set(source, [...(outgoing.get(source) ?? []), target]);
    incoming.set(target, [...(incoming.get(target) ?? []), source]);
  }
  const units = getCrossingUnits(input);
  let randomPaths = 0,
    hierarchyPaths = 0;
  const transfer = (source: string, target: string) => {
    const a = infos.get(source)!,
      b = infos.get(target)!;
    b.random += a.random;
    b.hierarchy += a.hierarchy;
    b.edges += a.edges + 1;
  };
  const outputSide = ({ right: "EAST", left: "WEST", down: "SOUTH", up: "NORTH" } as const)[
    input.direction
  ];
  const passEdges = (id: string) => {
    const state = infos.get(id)!;
    for (const target of outgoing.get(id) ?? []) {
      randomPaths += state.random;
      hierarchyPaths += state.hierarchy;
      transfer(id, target);
    }
  };
  for (const layer of layers) {
    const northSouth: string[] = [];
    for (const id of layer) {
      if (id.startsWith("__layout_dummy:north-south:")) {
        northSouth.push(id);
        continue;
      }
      const node = nodes.get(id)!,
        state = infos.get(id)!;
      const external = externalPortDummyOf(node);
      if (external) {
        state.hierarchy = 1;
        if (external.side === outputSide) hierarchyPaths += state.edges;
      } else {
        if (!incoming.get(id)?.length) state.random = 1;
        else if (!outgoing.get(id)?.length) randomPaths += state.edges;
      }
      passEdges(id);
      for (const dummy of units?.associates.get(id) ?? []) {
        randomPaths += state.random;
        hierarchyPaths += state.hierarchy;
        transfer(id, dummy);
      }
    }
    for (const id of northSouth) passEdges(id);
  }
  const all = randomPaths + hierarchyPaths;
  return (all === 0 ? Number.POSITIVE_INFINITY : (randomPaths - hierarchyPaths) / all) >= boundary;
}
