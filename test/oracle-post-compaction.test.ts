import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

async function compare(input: ElkNode): Promise<void> {
  const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(input));
  expect(actual.width).toBeCloseTo(expected.width ?? Number.NaN, 12);
  expect(actual.height).toBeCloseTo(expected.height ?? Number.NaN, 12);
  expect(actual.children?.map(({ id }) => id)).toEqual(expected.children?.map(({ id }) => id));
  for (const expectedNode of expected.children ?? []) {
    const actualNode = actual.children?.find(({ id }) => id === expectedNode.id);
    expect(actualNode?.x).toBeCloseTo(expectedNode.x ?? Number.NaN, 12);
    expect(actualNode?.y).toBeCloseTo(expectedNode.y ?? Number.NaN, 12);
  }
  expect(actual.edges?.map((edge) => edge.sections)).toEqual(
    expected.edges?.map((edge) => edge.sections),
  );
}

describe("ELK post-compaction parity", () => {
  for (const strategy of [
    "LEFT",
    "RIGHT",
    "LEFT_RIGHT_CONSTRAINT_LOCKING",
    "LEFT_RIGHT_CONNECTION_LOCKING",
    "EDGE_LENGTH",
  ]) {
    it(`matches ${strategy} bounds with long-edge dummies`, () =>
      compare({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.edgeRouting": "ORTHOGONAL",
          "elk.separateConnectedComponents": "false",
          "elk.layered.compaction.postCompaction.strategy": strategy,
        },
        children: [
          { id: "a", width: 30, height: 20 },
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
      }));
  }

  for (const strategy of [
    "NONE",
    "LEFT",
    "RIGHT",
    "LEFT_RIGHT_CONSTRAINT_LOCKING",
    "LEFT_RIGHT_CONNECTION_LOCKING",
    "EDGE_LENGTH",
  ]) {
    for (const constraints of ["SCANLINE", "QUADRATIC"]) {
      it(`matches ${strategy} with ${constraints}`, async () => {
        await compare({
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.separateConnectedComponents": "false",
            "elk.layered.compaction.postCompaction.strategy": strategy,
            "elk.layered.compaction.postCompaction.constraints": constraints,
          },
          children: [
            { id: "a", width: 20, height: 20 },
            { id: "b", width: 20, height: 20 },
          ],
          edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
        });
      });
    }
  }

  for (const strategy of [
    "NONE",
    "LEFT",
    "RIGHT",
    "LEFT_RIGHT_CONSTRAINT_LOCKING",
    "LEFT_RIGHT_CONNECTION_LOCKING",
    "EDGE_LENGTH",
  ]) {
    it(`matches ${strategy} compaction of disconnected constraint classes`, async () => {
      await compare({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.crossingMinimization.strategy": "NONE",
          "elk.layered.compaction.postCompaction.strategy": strategy,
        },
        children: [0, 1, 2, 3, 4].map((index) => ({
          id: `n${index}`,
          width: 20 + (index % 2) * 10,
          height: 20 + (index % 3) * 10,
        })),
        edges: [{ id: "edge", sources: ["n0"], targets: ["n1"] }],
      });
    });
  }

  for (const strategy of [
    "LEFT",
    "RIGHT",
    "LEFT_RIGHT_CONSTRAINT_LOCKING",
    "LEFT_RIGHT_CONNECTION_LOCKING",
    "EDGE_LENGTH",
  ]) {
    it(`matches edge-aware ${strategy} compaction`, async () => {
      const input: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
          "elk.layered.crossingMinimization.strategy": "NONE",
          "elk.layered.crossingMinimization.greedySwitch.type": "OFF",
          "elk.layered.compaction.postCompaction.strategy": strategy,
        },
        children: [
          ["a", 30, 20],
          ["b", 20, 50],
          ["c", 40, 25],
          ["d", 20, 30],
          ["e", 30, 15],
          ["z", 25, 25],
        ].map(([id, width, height]) => ({
          id: String(id),
          width: Number(width),
          height: Number(height),
        })),
        edges: [
          ["a", "c"],
          ["b", "c"],
          ["b", "d"],
          ["c", "e"],
          ["d", "e"],
        ].map(([source, target], index) => ({
          id: `edge-${index}`,
          sources: [source!],
          targets: [target!],
        })),
      };
      const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
      const actual = await new NativeELK().layout(structuredClone(input));
      for (const expectedNode of expected.children ?? []) {
        const actualNode = actual.children?.find((node) => node.id === expectedNode.id);
        expect(actualNode?.x).toBeCloseTo(expectedNode.x ?? Number.NaN, 12);
        expect(actualNode?.y).toBeCloseTo(expectedNode.y ?? Number.NaN, 12);
      }
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
        for (const [index, point] of expectedPoints.entries()) {
          expect(actualPoints[index]?.x).toBeCloseTo(point.x, 12);
          expect(actualPoints[index]?.y).toBeCloseTo(point.y, 12);
        }
      }
    });
  }
});
