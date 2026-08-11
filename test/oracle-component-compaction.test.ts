import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

for (const compact of [false, true]) {
  it(`matches shape-aware connected-component compaction ${compact}`, async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.aspectRatio": "1",
        "elk.layered.compaction.connectedComponents": String(compact),
      },
      children: [
        [28, 39],
        [50, 66],
        [14, 39],
        [71, 54],
        [11, 61],
        [30, 43],
        [57, 76],
        [28, 88],
      ].map(([width, height], index) => ({ id: `n${index}`, width, height })),
      edges: [0, 2, 4, 6].map((index) => ({
        id: `e${index}`,
        sources: [`n${index}`],
        targets: [`n${index + 1}`],
      })),
    };
    const expected = (await new OracleELK().layout(structuredClone(graph) as never)) as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(graph));
    expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
    expect(actual.children?.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
      expected.children?.map(({ id, x, y }) => ({ id, x, y })),
    );
    expect(actual.edges?.map((edge) => edge.sections)).toEqual(
      expected.edges?.map((edge) => edge.sections),
    );
  });
}
