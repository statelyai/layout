import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const) {
  it(`matches ELK ${direction} comment-box placement and routing`, async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: { "elk.algorithm": "layered", "elk.direction": direction },
      children: [
        {
          id: "comment",
          width: 40,
          height: 20,
          layoutOptions: { "elk.commentBox": "true" },
        },
        { id: "source", width: 30, height: 30 },
        { id: "target", width: 30, height: 30 },
      ],
      edges: [
        { id: "annotation", sources: ["comment"], targets: ["source"] },
        { id: "flow", sources: ["source"], targets: ["target"] },
      ],
    };
    const expected = (await new OracleELK().layout(
      structuredClone(graph) as never,
    )) as unknown as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(graph));
    expect(actual.children?.map((node) => [node.x, node.y])).toEqual(
      expected.children?.map((node) => [node.x, node.y]),
    );
    expect(actual.edges?.map((edge) => edge.sections)).toEqual(
      expected.edges?.map((edge) => edge.sections),
    );
    expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  });
}

for (const direction of ["RIGHT", "DOWN"] as const) {
  it(`matches ELK ${direction} multi-comment distribution and spacing`, async () => {
    const comments = Array.from({ length: 4 }, (_, index) => ({
      id: `comment-${index}`,
      width: 20 + index * 10,
      height: 10 + index * 5,
      layoutOptions: { "elk.commentBox": "true" },
    }));
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": direction,
        "elk.spacing.commentNode": "7",
        "elk.spacing.commentComment": "3",
      },
      children: [
        ...comments,
        { id: "source", width: 30, height: 30 },
        { id: "target", width: 30, height: 30 },
      ],
      edges: [
        ...comments.map((comment, index) => ({
          id: `annotation-${index}`,
          sources: [comment.id],
          targets: ["source"],
        })),
        { id: "flow", sources: ["source"], targets: ["target"] },
      ],
    };
    const expected = (await new OracleELK().layout(
      structuredClone(graph) as never,
    )) as unknown as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(graph));
    expect(actual.children?.map((node) => [node.x, node.y])).toEqual(
      expected.children?.map((node) => [node.x, node.y]),
    );
    expect(actual.edges?.map((edge) => edge.sections)).toEqual(
      expected.edges?.map((edge) => edge.sections),
    );
    expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  });
}
