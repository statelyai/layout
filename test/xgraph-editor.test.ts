import { describe, expect, it } from "vitest";
import { formatXGraph, parseXGraph, parseXGraphDocument } from "../demo/src/xgraph-editor";

describe("XGraph JSON5 editor", () => {
  it("accepts JSON5 and normalizes position-only visual nodes", () => {
    const graph = parseXGraph(`{
      // JSON5 comments and unquoted keys are accepted.
      id: 'pasted',
      nodes: [
        { id: 'a', position: { x: 12, y: 24 }, width: 80, height: 40 },
        { id: 'b', x: 140, y: 24, width: 80, height: 40 },
      ],
      edges: [{ id: 'a-b', sourceId: 'a', targetId: 'b', points: [
        { x: 92, y: 44 }, { x: 140, y: 44 },
      ] }],
    }`);

    expect(graph.nodes[0]).toMatchObject({ id: "a", x: 12, y: 24, width: 80, height: 40 });
    expect(graph.edges[0]).toMatchObject({ id: "a-b", sourceId: "a", targetId: "b" });
  });

  it("accepts an API response wrapped in graph", () => {
    const graph = parseXGraph(`{ graph: { id: 'wrapped', nodes: [{ id: 'a' }], edges: [] } }`);
    expect(graph.nodes[0]).toMatchObject({ id: "a", x: 0, y: 0, width: 80, height: 40 });
  });

  it("identifies topology-only XGraph that needs layout", () => {
    expect(
      parseXGraphDocument(`{
        id: 'topology',
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: [{ id: 'a-b', sourceId: 'a', targetId: 'b' }],
      }`).needsLayout,
    ).toBe(true);
    expect(
      parseXGraphDocument(`{
        id: 'visual',
        nodes: [
          { id: 'a', x: 0, y: 0, width: 80, height: 40 },
          { id: 'b', x: 120, y: 0, width: 80, height: 40 },
        ],
        edges: [{ id: 'a-b', sourceId: 'a', targetId: 'b', points: [
          { x: 80, y: 20 }, { x: 120, y: 20 },
        ] }],
      }`).needsLayout,
    ).toBe(false);
  });

  it("rejects dangling edge references", () => {
    expect(() =>
      parseXGraph(`{
        nodes: [{ id: 'a' }],
        edges: [{ id: 'missing', sourceId: 'a', targetId: 'b' }],
      }`),
    ).toThrow("missing.targetId references missing node b");
  });

  it("formats JSON5 as copyable JSON", () => {
    expect(formatXGraph(`{ nodes: [], edges: [], }`)).toBe(`{\n  "nodes": [],\n  "edges": []\n}\n`);
  });
});
