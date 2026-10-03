import { expect, it } from "vitest";
import { flatFixture } from "../scripts/parity/flat-corpus";

it("reproduces bounded flat graphs with valid node/port endpoints", () => {
  let withPorts = 0,
    withLabels = 0,
    withLoops = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const graph = flatFixture(seed);
    expect(flatFixture(seed)).toEqual(graph);
    expect(flatFixture(seed, "DOWN").children).toEqual(graph.children);
    expect(flatFixture(seed, "DOWN").edges).toEqual(graph.edges);
    expect(graph.children!.length).toBeGreaterThanOrEqual(4);
    expect(graph.children!.length).toBeLessThanOrEqual(16);
    expect(graph.edges!.length).toBeLessThanOrEqual(graph.children!.length * 3 + 2);
    const owners = new Map<string, string>();
    for (const node of graph.children!) {
      owners.set(String(node.id), String(node.id));
      expect(node.width).toBeGreaterThanOrEqual(60);
      expect(node.height).toBeGreaterThanOrEqual(48);
      expect(node.ports?.length ?? 0).toBeLessThanOrEqual(4);
      const sides = node.ports?.map((port) => port.layoutOptions!["elk.port.side"]);
      expect(new Set(sides).size).toBe(node.ports?.length ?? 0);
      for (const port of node.ports ?? []) owners.set(String(port.id), String(node.id));
      withPorts += node.ports?.length ?? 0;
      withLabels += node.labels?.length ?? 0;
    }
    expect(new Set(graph.edges!.map((edge) => edge.id)).size).toBe(graph.edges!.length);
    for (const edge of graph.edges!) {
      expect(owners.has(String(edge.sources![0]))).toBe(true);
      expect(owners.has(String(edge.targets![0]))).toBe(true);
      if (owners.get(String(edge.sources![0])) === owners.get(String(edge.targets![0])))
        withLoops++;
    }
  }
  expect(withPorts).toBeGreaterThan(0);
  expect(withLabels).toBeGreaterThan(0);
  expect(withLoops).toBeGreaterThan(0);
});
