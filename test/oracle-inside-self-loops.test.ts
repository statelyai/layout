import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

function points(graph: ElkNode) {
  return (graph.edges ?? []).map((edge) => {
    const section = edge.sections?.[0];
    return section ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint] : [];
  });
}

async function compare(graph: ElkNode) {
  const expected = (await new OracleELK().layout(
    structuredClone(graph) as never,
  )) as unknown as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  expect(actual.children?.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual(
    expected.children?.map(({ x, y, width, height }) => ({ x, y, width, height })),
  );
  const actualPoints = points(actual);
  const expectedPoints = points(expected);
  expect(actualPoints.map((edge) => edge.length)).toEqual(
    expectedPoints.map((edge) => edge.length),
  );
  actualPoints.forEach((edge, edgeIndex) =>
    edge.forEach((point, pointIndex) => {
      expect(point.x).toBeCloseTo(expectedPoints[edgeIndex]![pointIndex]!.x, 12);
      expect(point.y).toBeCloseTo(expectedPoints[edgeIndex]![pointIndex]!.y, 12);
    }),
  );
}

function fixture(activate: boolean, inside: boolean, count = 1): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    },
    children: [
      {
        id: "parent",
        layoutOptions: { "elk.insideSelfLoops.activate": String(activate) },
        children: [{ id: "child", width: 20, height: 20 }],
      },
    ],
    edges: Array.from({ length: count }, (_, index) => ({
      id: `loop-${index}`,
      sources: ["parent"],
      targets: ["parent"],
      layoutOptions: { "elk.insideSelfLoops.yo": String(inside) },
    })),
  };
}

describe("ELK inside-self-loop parity", () => {
  it("requires activation on the compound and opt-in on the edge", async () => {
    await compare(fixture(true, true));
  });

  it("keeps opted-out loops outside", async () => {
    await compare(fixture(true, false));
  });

  it("keeps loops outside when compound activation is disabled", async () => {
    await compare(fixture(false, true));
  });

  it("stacks multiple inside loops in model order", async () => {
    await compare(fixture(true, true, 3));
  });
});
