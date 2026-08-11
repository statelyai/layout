import corpus from "../demo/generated/corpus.json";
import catalog from "../demo/generated/elk-live-examples.json";
import { describe, expect, it } from "vitest";

describe("ELK Live example corpus", () => {
  it("contains every canonical elk-models example", () => {
    expect(catalog.examples).toHaveLength(45);
    expect(corpus).toHaveLength(catalog.examples.length);
    expect(corpus.map((entry) => entry.sourcePath)).toEqual(
      catalog.examples.map((entry) => entry.path),
    );
  });

  it("preserves ELK Live labels, categories, documentation, and source", () => {
    for (const entry of corpus) {
      const source = catalog.examples.find((example) => example.id === entry.id);
      expect(source).toBeDefined();
      expect(entry.name).toBe(source?.name);
      expect(entry.category).toEqual(source?.category);
      expect(entry.description).toBe(source?.description);
      expect(entry.source).toBe(source?.source);
    }
  });

  it("contains valid pre-laid geometry for every example", () => {
    for (const entry of corpus) {
      expect(entry.engine).toBe("elkjs-oracle");
      expect(entry.graph.layout).toEqual({ status: "complete", direction: "RIGHT" });
      expect(entry.graph.nodes.length).toBeGreaterThan(1);
      expect(entry.graph.nodes.every((node) => Number.isFinite(node.position.x))).toBe(true);
      expect(entry.graph.nodes.every((node) => Number.isFinite(node.position.y))).toBe(true);
      expect(entry.graph.nodes.every((node) => node.width > 0 && node.height > 0)).toBe(true);
      expect(
        entry.graph.nodes
          .flatMap((node) => ("ports" in node ? (node.ports ?? []) : []))
          .every((port) => port.width > 0 && port.height > 0),
      ).toBe(true);
    }
  });

  it("preserves routed self-loops and named ports", () => {
    const portCase = corpus.find((entry) => entry.id === "edges-insideSelfLoops");
    expect(portCase?.graph.edges).toHaveLength(4);
    expect(
      portCase?.graph.nodes.flatMap((node) => ("ports" in node ? (node.ports ?? []) : [])),
    ).toHaveLength(4);
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
