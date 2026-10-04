import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";

for (const spacing of [0, 1, 1.9, 2, 4]) {
  it(`reserves ELK's minimum edge-track separation at edgeEdge=${spacing}`, async () => {
    const input: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.separateConnectedComponents": "false",
        "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
        "elk.layered.crossingMinimization.strategy": "NONE",
        "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
        "elk.spacing.edgeEdge": String(spacing),
      },
      children: ["a", "b", "c", "d", "e"].map((id) => ({ id, width: 20, height: 20 })),
      edges: [
        ["a", "c"],
        ["b", "c"],
        ["b", "d"],
        ["c", "e"],
        ["d", "e"],
        ["a", "e"],
        ["b", "e"],
      ].map(([source, target], index) => ({
        id: `edge-${index}`,
        sources: [source!],
        targets: [target!],
      })),
    };
    // The two long-edge tracks share a layer. This checks their reserved cross-axis
    // space; independent routing/flow-coordinate parity remains covered elsewhere.
    const expected = await new OracleELK().layout(structuredClone(input) as never);
    const actual = await new NativeELK().layout(structuredClone(input));
    expect(actual.height).toBeCloseTo(expected.height ?? Number.NaN, 12);
    expect(input.layoutOptions?.["elk.spacing.edgeEdge"]).toBe(String(spacing));
  });
}
