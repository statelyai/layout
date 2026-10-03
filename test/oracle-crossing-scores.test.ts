import { expect, it } from "vitest";
import fixtures from "./fixtures/crossing-score-oracle.json";
import { countAllCrossings, type CrossingGraph } from "../src/layered/crossing-counter";

for (const [index, sample] of fixtures.samples.entries()) {
  it(`matches real ELK crossing score: ${sample.case.family} seed ${sample.case.seed} ${sample.case.direction} candidate ${index}`, () => {
    const graph = sample.graph as CrossingGraph;
    const before = JSON.stringify(graph);
    const actual = countAllCrossings(graph);
    expect(actual.total).toBe(sample.expected);
    expect(countAllCrossings(graph, "edges").total).toBe(sample.expectedEdges);
    expect(actual.total).toBe(actual.betweenLayers + actual.inLayer + actual.northSouth);
    expect(JSON.stringify(graph)).toBe(before);
  });
}
