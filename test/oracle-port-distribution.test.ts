import { expect, it } from "vitest";
import fixtures from "./fixtures/port-distribution-oracle.json";
import type { CrossingGraph } from "../src/layered/crossing-counter";
import {
  type PortDistributionState,
  CanonicalPortDistributor,
} from "../src/layered/port-distributor";

for (const [index, sample] of fixtures.samples.entries()) {
  it(`matches ELK physical port distribution: ${sample.case.family} seed ${sample.case.seed} ${sample.case.direction} candidate ${index}`, () => {
    const graph = structuredClone(sample.graph) as CrossingGraph;
    // JSON erases signed zero; fixtures encode it explicitly.
    const decode = (value: unknown): PortDistributionState =>
      JSON.parse(JSON.stringify(value), (_key, item) => (item === "__negative_zero__" ? -0 : item));
    const state = decode(sample.state);
    const before = JSON.stringify(sample.state);
    const distributor = new CanonicalPortDistributor(graph, state);
    distributor.distribute(graph, sample.index, sample.forward, {
      nodeRelative: sample.options.nodeRelative,
      fixedOrder: new Set(sample.options.fixedOrder),
      hierarchical: new Set(sample.options.hierarchical),
    });
    expect(
      graph.layers
        .flat()
        .map((node) => ({ id: node.id, ports: node.ports.map((port) => port.id) })),
    ).toEqual(sample.expectedPorts);
    expect(distributor.state).toEqual(decode(sample.expectedState));
    expect(JSON.stringify(sample.state)).toBe(before);
  });
}
