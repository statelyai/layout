import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

for (const constraint of ["FIRST", "FIRST_SEPARATE", "LAST", "LAST_SEPARATE"] as const) {
  it(`matches ELK ${constraint} layer constraints`, async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.separateConnectedComponents": "false",
        "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
        "elk.layered.crossingMinimization.strategy": "NONE",
        "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
        "elk.layered.nodePlacement.strategy": "SIMPLE",
      },
      children: [
        { id: "a", width: 20, height: 20 },
        { id: "b", width: 20, height: 20 },
        {
          id: "constrained",
          width: 20,
          height: 20,
          layoutOptions: { "elk.layered.layering.layerConstraint": constraint },
        },
        { id: "d", width: 20, height: 20 },
      ],
      edges: [
        { id: "ab", sources: ["a"], targets: ["b"] },
        { id: "bd", sources: ["b"], targets: ["d"] },
      ],
    };
    const expected = (await new OracleELK().layout(
      structuredClone(graph) as never,
    )) as unknown as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(graph));

    expect(actual.width).toBeCloseTo(expected.width ?? Number.NaN, 12);
    expect(actual.height).toBeCloseTo(expected.height ?? Number.NaN, 12);
    for (const expectedNode of expected.children ?? []) {
      const actualNode = actual.children?.find(
        (candidate) => String(candidate.id) === String(expectedNode.id),
      );
      expect(actualNode?.x).toBeCloseTo(expectedNode.x ?? Number.NaN, 12);
      expect(actualNode?.y).toBeCloseTo(expectedNode.y ?? Number.NaN, 12);
    }
  });

  it(`matches ELK ${constraint} when the constrained node has incident edges`, async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.separateConnectedComponents": "false",
      },
      children: [
        {
          id: "a",
          width: 30,
          height: 20,
          layoutOptions: { "elk.layered.layering.layerConstraint": constraint },
        },
        { id: "b", width: 40, height: 25 },
        { id: "c", width: 35, height: 30 },
        { id: "d", width: 30, height: 25 },
      ],
      edges: [
        { id: "ab", sources: ["a"], targets: ["b"] },
        { id: "ac", sources: ["a"], targets: ["c"] },
        { id: "bd", sources: ["b"], targets: ["d"] },
        { id: "dc", sources: ["d"], targets: ["c"] },
      ],
    };
    const expected = (await new OracleELK().layout(
      structuredClone(graph) as never,
    )) as unknown as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(graph));
    expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
    for (const expectedNode of expected.children ?? []) {
      const actualNode = actual.children?.find(({ id }) => id === expectedNode.id);
      expect(actualNode?.x, String(expectedNode.id)).toBeCloseTo(expectedNode.x!, 12);
      expect(actualNode?.y, String(expectedNode.id)).toBeCloseTo(expectedNode.y!, 12);
    }
  });
}
