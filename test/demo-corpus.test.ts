import corpus from "../demo/generated/corpus.json";
import { demoScenarios } from "../demo/scenarios";
import { describe, expect, it } from "vitest";

const expectedAlgorithms = [
  "box",
  "fixed",
  "force",
  "layered",
  "mrtree",
  "radial",
  "random",
  "rectpacking",
  "sporeCompaction",
  "sporeOverlap",
  "stress",
] as const;

describe("Stately SDK layout demonstrator corpus", () => {
  it("covers every algorithm family exposed by the elkjs 0.11.1 demonstrators", () => {
    expect([...new Set(demoScenarios.map((scenario) => scenario.algorithm))].sort()).toEqual(
      [...expectedAlgorithms].sort(),
    );
  });

  it("contains a generated pre-laid graph for every scenario", () => {
    expect(corpus).toHaveLength(demoScenarios.length);
    for (const entry of corpus) {
      expect(entry.graph.layout).toEqual({ status: "complete", direction: "RIGHT" });
      expect(entry.graph.nodes.length).toBeGreaterThan(1);
      expect(entry.graph.nodes.every((node) => Number.isFinite(node.position.x))).toBe(true);
      expect(entry.graph.nodes.every((node) => Number.isFinite(node.position.y))).toBe(true);
      expect(entry.graph.nodes.every((node) => node.width > 0 && node.height > 0)).toBe(true);
    }
  });

  it("labels native and oracle-backed cases honestly", () => {
    expect(corpus.filter((entry) => entry.engine === "native")).toHaveLength(10);
    expect(corpus.filter((entry) => entry.engine === "elkjs-oracle")).toHaveLength(5);
  });

  it("preserves native route geometry and named ports for renderer comparison", () => {
    const portCase = corpus.find((entry) => entry.id === "layered-ports");
    expect(portCase).toBeDefined();
    expect(
      portCase?.graph.nodes.flatMap((node) => ("ports" in node ? (node.ports ?? []) : [])),
    ).toHaveLength(7);
    expect(portCase?.graph.edges.every((edge) => edge.routing === "orthogonal")).toBe(true);
    expect(portCase?.graph.edges.every((edge) => edge.points.length >= 2)).toBe(true);
    expect(
      portCase?.graph.edges.every(
        (edge) =>
          "sourcePort" in edge &&
          "targetPort" in edge &&
          Boolean(edge.sourcePort && edge.targetPort),
      ),
    ).toBe(true);
  });
});
