import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

for (const alignment of ["AUTOMATIC", "LEFT", "RIGHT", "TOP", "BOTTOM", "CENTER"] as const) {
  it(`matches ELK per-node ${alignment} alignment`, async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT" },
      children: [
        { id: "a", width: 20, height: 20, layoutOptions: { "elk.alignment": alignment } },
        { id: "b", width: 20, height: 50 },
        { id: "c", width: 20, height: 20 },
      ],
      edges: [
        { id: "ac", sources: ["a"], targets: ["c"] },
        { id: "bc", sources: ["b"], targets: ["c"] },
      ],
    };
    const expected = (await new OracleELK().layout(structuredClone(graph) as never)) as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(graph));
    for (const expectedNode of expected.children ?? []) {
      const actualNode = actual.children?.find(({ id }) => id === expectedNode.id);
      expect(actualNode?.x).toBeCloseTo(expectedNode.x ?? 0, 12);
      expect(actualNode?.y).toBeCloseTo(expectedNode.y ?? 0, 12);
    }
  });
}
