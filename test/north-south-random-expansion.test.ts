import { createGraph } from "@statelyai/graph";
import { expect, it } from "vitest";
import { insertNorthSouthPortDummies } from "../src/layered/north-south-ports";
import { splitLongEdges } from "../src/layered/long-edges";
import { assignLayersByLongestPath, breakCyclesGreedily } from "../src/layered/strategies";
import type { LayeredPhaseInput } from "../src/layered/types";
import { readFixture } from "./helpers/fixture";
// Seed 3468112780 of the vertical-center fresh parity corpus.
const corpus = readFixture("vertical-center-fresh-corpus");
for (const c of corpus.cases) {
  it(`preserves randomized graph ${c.id}, seed ${c.seed}, through cross-port expansion`, () => {
    const graph = createGraph(c.input);
    const input: LayeredPhaseInput = {
      graph,
      direction: c.direction,
      settings: { randomSeed: c.seed },
      sizes: new Map(
        graph.nodes.map((n) => [n.id, { width: n.width ?? 0, height: n.height ?? 0 }]),
      ),
      constrainedLayerByNodeId: new Map(),
      spacing: { node: 36, layer: 56 },
      padding: { top: 24, right: 24, bottom: 24, left: 24 },
      nodeSettings: () => ({ portConstraints: "FIXED_POS" }),
      portSettings: (p) => ({ "port.side": (p.data as { side: string }).side }),
    };
    const orientation = breakCyclesGreedily(input);
    const original = splitLongEdges(
      input,
      orientation,
      assignLayersByLongestPath(input, orientation),
    );
    const before = structuredClone(original.input.graph);
    const result = insertNorthSouthPortDummies(original),
      expanded = result.expansion;
    expect(original.input.graph).toEqual(before);
    expect(expanded.input.graph.edges.map((e) => e.id)).toEqual(
      original.input.graph.edges.map((e) => e.id),
    );
    expect(expanded.segmentIdsByEdgeId).toBe(original.segmentIdsByEdgeId);
    expect(expanded.labelDummyIdByEdgeId).toBe(original.labelDummyIdByEdgeId);
    const originals = new Map(original.input.graph.edges.map((e) => [e.id, e]));
    for (const e of expanded.input.graph.edges) {
      const orig = originals.get(e.id)!;
      const source = result.originsByDummyId.get(e.sourceId),
        target = result.originsByDummyId.get(e.targetId);
      expect(source?.node.id ?? e.sourceId).toBe(orig.sourceId);
      expect(target?.node.id ?? e.targetId).toBe(orig.targetId);
      expect(source?.port.name ?? e.sourcePort).toBe(orig.sourcePort);
      expect(target?.port.name ?? e.targetPort).toBe(orig.targetPort);
      expect(e.width).toBe(orig.width);
      expect(e.height).toBe(orig.height);
      const reverse = expanded.orientation.reversedEdgeIds.has(e.id);
      if (source) expect(e.sourcePort).toBe(reverse ? "input" : "output");
      if (target) expect(e.targetPort).toBe(reverse ? "output" : "input");
    }
    for (const [id, o] of result.originsByDummyId) {
      expect(expanded.assignment.layerByNodeId.get(id)).toBe(
        original.assignment.layerByNodeId.get(o.node.id),
      );
      expect(result.layoutUnitByNodeId.get(id)).toBe(o.node.id);
      expect(expanded.input.graph.nodes.filter((n) => n.id === id)).toHaveLength(1);
      expect(expanded.input.sizes.get(id)).toEqual({ width: 0, height: 0 });
      expect(result.successorsByNodeId.get(o.beforeOwner ? id : o.node.id)).toContain(
        o.beforeOwner ? o.node.id : id,
      );
    }
  });
}
