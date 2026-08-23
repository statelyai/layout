import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

for (const distribution of ["NORTH", "NORTH_SOUTH", "EQUALLY"] as const) {
  for (const ordering of ["STACKED", "SEQUENCED", "REVERSE_STACKED"] as const) {
    it(`matches ELK ${distribution} ${ordering} orthogonal self loops`, async () => {
      const graph: ElkNode = {
        id: "root",
        layoutOptions: { "elk.algorithm": "layered", "elk.edgeRouting": "ORTHOGONAL" },
        children: [
          {
            id: "node",
            width: 80,
            height: 50,
            layoutOptions: {
              "elk.layered.edgeRouting.selfLoopDistribution": distribution,
              "elk.layered.edgeRouting.selfLoopOrdering": ordering,
            },
          },
        ],
        edges: Array.from({ length: 4 }, (_, index) => ({
          id: `loop-${index}`,
          sources: ["node"],
          targets: ["node"],
        })),
      };
      const expected = (await new OracleELK().layout(
        structuredClone(graph) as never,
      )) as unknown as ElkNode;
      const actual = await new NativeELK().layout(structuredClone(graph));
      expect(actual.children?.map((node) => [node.x, node.y])).toEqual(
        expected.children?.map((node) => [node.x, node.y]),
      );
      for (const [index, edge] of (actual.edges ?? []).entries()) {
        const actualSection = edge.sections?.[0];
        const expectedSection = expected.edges?.[index]?.sections?.[0];
        const actualPoints = actualSection
          ? [actualSection.startPoint, ...(actualSection.bendPoints ?? []), actualSection.endPoint]
          : [];
        const expectedPoints = expectedSection
          ? [
              expectedSection.startPoint,
              ...(expectedSection.bendPoints ?? []),
              expectedSection.endPoint,
            ]
          : [];
        expect(actualPoints).toHaveLength(expectedPoints.length);
        actualPoints.forEach((point, pointIndex) => {
          expect(point.x).toBeCloseTo(expectedPoints[pointIndex]!.x, 12);
          expect(point.y).toBeCloseTo(expectedPoints[pointIndex]!.y, 12);
        });
      }
      expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
    });
  }
}
