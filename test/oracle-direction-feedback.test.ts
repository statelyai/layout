import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

describe("ELK direction congruency parity", () => {
  for (const direction of ["RIGHT", "DOWN", "LEFT", "UP"] as const) {
    for (const congruency of ["READING_DIRECTION", "ROTATION"] as const) {
      it(`matches ${direction} ${congruency}`, async () => {
        const input: ElkNode = {
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": direction,
            "elk.separateConnectedComponents": "false",
            "elk.layered.directionCongruency": congruency,
          },
          children: [
            { id: "a", width: 20, height: 20 },
            { id: "b", width: 20, height: 20 },
            { id: "target", width: 20, height: 20 },
          ],
          edges: [
            { id: "a-target", sources: ["a"], targets: ["target"] },
            { id: "b-target", sources: ["b"], targets: ["target"] },
          ],
        };
        const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
        const actual = await new NativeELK().layout(structuredClone(input));
        for (const id of ["a", "b"]) {
          const expectedNode = expected.children?.find((node) => node.id === id);
          const actualNode = actual.children?.find((node) => node.id === id);
          expect([actualNode?.x, actualNode?.y]).toEqual([expectedNode?.x, expectedNode?.y]);
        }
        const flowCoordinate = direction === "RIGHT" || direction === "LEFT" ? "x" : "y";
        expect(actual.children?.find((node) => node.id === "target")?.[flowCoordinate]).toEqual(
          expected.children?.find((node) => node.id === "target")?.[flowCoordinate],
        );
        const crossCoordinate = flowCoordinate === "x" ? "y" : "x";
        expect(
          actual.children?.find((node) => node.id === "target")?.[crossCoordinate],
        ).toBeCloseTo(
          expected.children?.find((node) => node.id === "target")?.[crossCoordinate] ?? Number.NaN,
          12,
        );
        for (const expectedEdge of expected.edges ?? []) {
          const actualEdge = actual.edges?.find((edge) => edge.id === expectedEdge.id);
          const expectedPoints = (expectedEdge.sections ?? []).flatMap((section) => [
            section.startPoint,
            ...(section.bendPoints ?? []),
            section.endPoint,
          ]);
          const actualPoints = (actualEdge?.sections ?? []).flatMap((section) => [
            section.startPoint,
            ...(section.bendPoints ?? []),
            section.endPoint,
          ]);
          expect(actualPoints).toHaveLength(expectedPoints.length);
          for (const [index, expectedPoint] of expectedPoints.entries()) {
            expect(actualPoints[index]?.x).toBeCloseTo(expectedPoint.x, 12);
            expect(actualPoints[index]?.y).toBeCloseTo(expectedPoint.y, 12);
          }
        }
      });
    }
  }
});

describe("ELK feedback-edge parity", () => {
  it("routes a reversed cycle edge around all nodes", async () => {
    const input: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.separateConnectedComponents": "false",
        "elk.layered.feedbackEdges": "true",
      },
      children: ["a", "b", "c"].map((id) => ({ id, width: 30, height: 20 })),
      edges: [
        ["a", "b"],
        ["b", "c"],
        ["c", "a"],
      ].map(([source, target], index) => ({
        id: `edge-${index}`,
        sources: [source!],
        targets: [target!],
      })),
    };
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(input));
    expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
    expect(actual.children?.map(({ x, y }) => [x, y])).toEqual(
      expected.children?.map(({ x, y }) => [x, y]),
    );
    expect(actual.edges?.map((edge) => edge.sections)).toEqual(
      expected.edges?.map((edge) => edge.sections),
    );
  });
});
