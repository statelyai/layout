import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

for (const alignment of ["H_LEFT V_TOP", "H_CENTER V_CENTER", "H_RIGHT V_BOTTOM"]) {
  it(`matches ELK fixed graph sizing with ${alignment}`, async () => {
    const graph: ElkNode = {
      id: "root",
      width: 200,
      height: 120,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.nodeSize.fixedGraphSize": "true",
        "elk.contentAlignment": alignment,
      },
      children: [
        { id: "source", width: 20, height: 20 },
        { id: "target", width: 20, height: 20 },
      ],
      edges: [{ id: "edge", sources: ["source"], targets: ["target"] }],
    };
    const expected = (await new OracleELK().layout(
      structuredClone(graph) as never,
    )) as unknown as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(graph));
    expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
    expect(actual.children?.map((node) => [node.x, node.y])).toEqual(
      expected.children?.map((node) => [node.x, node.y]),
    );
    expect(actual.edges?.map((edge) => edge.sections)).toEqual(
      expected.edges?.map((edge) => edge.sections),
    );
  });
}
