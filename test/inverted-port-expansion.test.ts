import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { splitLongEdges } from "../src/layered/long-edges";
import { insertInvertedPortDummies } from "../src/layered/inverted-ports";
import type { LayeredPhaseInput } from "../src/layered/types";

for (const span of [1, 3]) {
  it(`composes inverted fixed-side feedback endpoints across ${span} layer(s)`, () => {
    const graph = createGraph({
      nodes: [
        {
          id: "a",
          width: 80,
          height: 60,
          ports: [{ name: "east", direction: "out", x: 80, y: 20, width: 6, height: 6 }],
        },
        {
          id: "b",
          width: 80,
          height: 60,
          ports: [{ name: "west", direction: "in", x: 0, y: 20, width: 6, height: 6 }],
        },
      ],
      edges: [{ id: "ab", sourceId: "a", sourcePort: "east", targetId: "b", targetPort: "west" }],
    });
    const input: LayeredPhaseInput = {
      graph,
      sizes: new Map(graph.nodes.map((n) => [n.id, { width: n.width!, height: n.height! }])),
      direction: "right",
      spacing: { node: 20, layer: 20 },
      padding: { top: 12, left: 12, right: 12, bottom: 12 },
      constrainedLayerByNodeId: new Map(),
      settings: {},
      modelOrderByEdgeId: new Map([["ab", 42]]),
      nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
      portSettings: (p) => ({ "port.side": p.name === "east" ? "EAST" : "WEST" }),
    };
    const expanded = insertInvertedPortDummies(
      splitLongEdges(
        input,
        { reversedEdgeIds: new Set(["ab"]) },
        {
          layerByNodeId: new Map([
            ["a", span],
            ["b", 0],
          ]),
        },
      ),
    );
    const segments = expanded.segmentIdsByEdgeId.get("ab")!;
    expect(segments).toHaveLength(span + 2);
    expect(segments.map((id) => expanded.input.modelOrderByEdgeId?.get(id))).toEqual(
      Array(span + 2).fill(42),
    );
    const edges = segments.map((id) => expanded.input.graph.edges.find((e) => e.id === id)!);
    expect(edges[0]!.sourceId).toBe("a");
    expect(edges[0]!.sourcePort).toBe("east");
    expect(edges.at(-1)!.targetId).toBe("b");
    expect(edges.at(-1)!.targetPort).toBe("west");
    for (const edge of edges) expect(expanded.orientation.reversedEdgeIds.has(edge.id)).toBe(true);
    expect(expanded.assignment.layerByNodeId.get(edges[0]!.targetId)).toBe(span);
    expect(expanded.assignment.layerByNodeId.get(edges.at(-1)!.sourceId)).toBe(0);
    expect(edges[0]!.targetId).toBe(edges[1]!.sourceId);
    for (let i = 1; i < edges.length; i++) expect(edges[i - 1]!.targetId).toBe(edges[i]!.sourceId);
    for (const edge of edges) {
      const sourceLayer = expanded.assignment.layerByNodeId.get(edge.sourceId)!;
      const targetLayer = expanded.assignment.layerByNodeId.get(edge.targetId)!;
      expect(Math.abs(targetLayer - sourceLayer)).toBeLessThanOrEqual(1);
    }
    for (const node of expanded.input.graph.nodes.filter((n) =>
      n.id.startsWith("__layout_dummy:inverted:"),
    )) {
      expect(expanded.input.nodeSettings?.(node)?.portConstraints).toBe("FIXED_POS");
      expect(expanded.input.portSettings?.(node.ports![0]!, node)?.["port.side"]).toBe("WEST");
      expect(expanded.input.portSettings?.(node.ports![1]!, node)?.["port.side"]).toBe("EAST");
    }
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges[0]!.id).toBe("ab");
  });
}

it("leaves free-side ports and self-loops untouched", () => {
  const graph = createGraph({
    nodes: [
      {
        id: "a",
        width: 80,
        height: 60,
        ports: [{ name: "west", direction: "out", x: 0, y: 20, width: 6, height: 6 }],
      },
      { id: "b", width: 80, height: 60 },
    ],
    edges: [
      { id: "ab", sourceId: "a", sourcePort: "west", targetId: "b" },
      { id: "loop", sourceId: "a", sourcePort: "west", targetId: "a", targetPort: "west" },
    ],
  });
  const input: LayeredPhaseInput = {
    graph,
    sizes: new Map(graph.nodes.map((n) => [n.id, { width: 80, height: 60 }])),
    direction: "right",
    spacing: { node: 20, layer: 20 },
    padding: { top: 12, left: 12, right: 12, bottom: 12 },
    constrainedLayerByNodeId: new Map(),
    settings: {},
    nodeSettings: () => ({ portConstraints: "FREE" }),
    portSettings: () => ({ "port.side": "WEST" }),
  };
  const expansion = splitLongEdges(
    input,
    { reversedEdgeIds: new Set() },
    {
      layerByNodeId: new Map([
        ["a", 0],
        ["b", 1],
      ]),
    },
  );
  expect(insertInvertedPortDummies(expansion)).toBe(expansion);
  const loopInput = {
    ...input,
    graph: { ...graph, edges: [graph.edges[1]!] },
    nodeSettings: () => ({ portConstraints: "FIXED_POS" as const }),
  };
  const loopExpansion = splitLongEdges(
    loopInput,
    { reversedEdgeIds: new Set() },
    {
      layerByNodeId: new Map([
        ["a", 0],
        ["b", 1],
      ]),
    },
  );
  expect(insertInvertedPortDummies(loopExpansion)).toBe(loopExpansion);
});

it("retains the center-label dummy when composing inverted ends with a long edge", () => {
  const graph = createGraph({
    nodes: [
      {
        id: "a",
        width: 80,
        height: 60,
        ports: [{ name: "west", direction: "out", x: 0, y: 20, width: 6, height: 6 }],
      },
      {
        id: "b",
        width: 80,
        height: 60,
        ports: [{ name: "east", direction: "in", x: 80, y: 20, width: 6, height: 6 }],
      },
    ],
    edges: [
      {
        id: "ab",
        sourceId: "a",
        sourcePort: "west",
        targetId: "b",
        targetPort: "east",
        width: 37,
        height: 22,
      },
    ],
  });
  const input: LayeredPhaseInput = {
    graph,
    sizes: new Map(graph.nodes.map((n) => [n.id, { width: 80, height: 60 }])),
    direction: "right",
    spacing: { node: 20, layer: 20 },
    padding: { top: 12, left: 12, right: 12, bottom: 12 },
    constrainedLayerByNodeId: new Map(),
    settings: {},
    nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
    portSettings: (p) => ({ "port.side": p.name === "east" ? "EAST" : "WEST" }),
  };
  const long = splitLongEdges(
    input,
    { reversedEdgeIds: new Set() },
    {
      layerByNodeId: new Map([
        ["a", 0],
        ["b", 3],
      ]),
    },
  );
  const expanded = insertInvertedPortDummies(long);
  expect(expanded.segmentIdsByEdgeId.get("ab")).toHaveLength(5);
  expect(expanded.labelDummyIdByEdgeId.get("ab")).toBe(long.labelDummyIdByEdgeId.get("ab"));
  expect(expanded.input.sizes.get(expanded.labelDummyIdByEdgeId.get("ab")!)).toEqual({
    width: 37,
    height: 22,
  });
  const segments = expanded.segmentIdsByEdgeId.get("ab")!;
  for (let i = 1; i < segments.length; i++) {
    const previous = expanded.input.graph.edges.find((e) => e.id === segments[i - 1])!;
    const next = expanded.input.graph.edges.find((e) => e.id === segments[i])!;
    expect(previous.targetId).toBe(next.sourceId);
  }
});
