import { createGraph } from "@statelyai/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge } from "elkjs/lib/elk-api";
import { expect, it } from "vitest";
import { getLayeredLayout } from "../src";

const nodes = [
  { id: "a", width: 30, height: 20 },
  { id: "b", width: 20, height: 50 },
  { id: "c", width: 40, height: 25 },
  { id: "d", width: 20, height: 30 },
  { id: "e", width: 30, height: 15 },
];
const edges = [
  { id: "ac", sourceId: "a", targetId: "c" },
  { id: "bc", sourceId: "b", targetId: "c" },
  { id: "bd", sourceId: "b", targetId: "d" },
  { id: "ce", sourceId: "c", targetId: "e" },
  { id: "de", sourceId: "d", targetId: "e" },
];

for (const edgeRouting of ["ORTHOGONAL", "POLYLINE", "SPLINES"] as const) {
  it(`matches ELK ${edgeRouting} implicit-port routes`, async () => {
    const oracle = await new ELK().layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.separateConnectedComponents": "false",
        "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
        "elk.layered.crossingMinimization.strategy": "NONE",
        "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.edgeRouting": edgeRouting,
      },
      children: structuredClone(nodes),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [edge.sourceId],
        targets: [edge.targetId],
      })),
    });
    const native = getLayeredLayout(createGraph({ nodes, edges }), {
      direction: "right",
      settings: {
        "layering.strategy": "LONGEST_PATH_SOURCE",
        "crossingMinimization.strategy": "NONE",
        "crossingMinimization.greedySwitch.type": "OFF",
        "nodePlacement.strategy": "BRANDES_KOEPF",
        edgeRouting,
      },
    });

    for (const edge of oracle.edges ?? []) {
      const section = (edge as ElkExtendedEdge).sections?.[0];
      const expected = section
        ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
        : [];
      const actual = native.edges.find((candidate) => candidate.id === edge.id)?.points ?? [];
      expect(actual).toHaveLength(expected.length);
      actual.forEach((point, index) => {
        expect(point.x).toBeCloseTo(expected[index]?.x ?? Number.NaN, 12);
        expect(point.y).toBeCloseTo(expected[index]?.y ?? Number.NaN, 12);
      });
    }
  });
}
