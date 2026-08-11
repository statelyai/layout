import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

for (const strategy of ["SINGLE_EDGE", "MULTI_EDGE"] as const) {
  for (const additionalSpacing of [0, 10]) {
    it(`matches ELK ${strategy} path wrapping with additional spacing ${additionalSpacing}`, async () => {
      const graph: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.aspectRatio": "1",
          "elk.layered.layering.strategy": "LONGEST_PATH",
          "elk.layered.wrapping.strategy": strategy,
          "elk.layered.wrapping.additionalEdgeSpacing": String(additionalSpacing),
        },
        children: Array.from({ length: 10 }, (_, index) => ({
          id: `node-${index}`,
          width: 20,
          height: 20,
        })),
        edges: Array.from({ length: 9 }, (_, index) => ({
          id: `edge-${index}`,
          sources: [`node-${index}`],
          targets: [`node-${index + 1}`],
        })),
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
}

it("matches ELK wrapping correction factor", async () => {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.aspectRatio": "1",
      "elk.layered.layering.strategy": "LONGEST_PATH",
      "elk.layered.wrapping.strategy": "SINGLE_EDGE",
      "elk.layered.wrapping.correctionFactor": "2",
    },
    children: Array.from({ length: 10 }, (_, index) => ({
      id: `node-${index}`,
      width: 20,
      height: 20,
    })),
    edges: Array.from({ length: 9 }, (_, index) => ({
      id: `edge-${index}`,
      sources: [`node-${index}`],
      targets: [`node-${index + 1}`],
    })),
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

for (const [option, values] of [
  ["improveCuts", ["false", "true"]],
  ["distancePenalty", ["1", "2", "4"]],
  ["improveWrappedEdges", ["false", "true"]],
] as const) {
  for (const value of values) {
    it(`matches ELK path wrapping with ${option}=${value}`, async () => {
      const graph: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.aspectRatio": "1",
          "elk.layered.layering.strategy": "LONGEST_PATH",
          "elk.layered.wrapping.strategy": "MULTI_EDGE",
          [`elk.layered.wrapping.multiEdge.${option}`]: value,
        },
        children: Array.from({ length: 10 }, (_, index) => ({
          id: `node-${index}`,
          width: 20,
          height: 20,
        })),
        edges: Array.from({ length: 9 }, (_, index) => ({
          id: `edge-${index}`,
          sources: [`node-${index}`],
          targets: [`node-${index + 1}`],
        })),
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
    });
  }
}

for (const [cuttingStrategy, freedom] of [
  ["ARD", 1],
  ["MSD", 0],
  ["MSD", 2],
] as const) {
  it(`matches ELK ${cuttingStrategy} cutting with freedom ${freedom}`, async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.aspectRatio": "1",
        "elk.layered.layering.strategy": "LONGEST_PATH",
        "elk.layered.wrapping.strategy": "SINGLE_EDGE",
        "elk.layered.wrapping.cutting.strategy": cuttingStrategy,
        "elk.layered.wrapping.cutting.msd.freedom": String(freedom),
      },
      children: Array.from({ length: 10 }, (_, index) => ({
        id: `node-${index}`,
        width: 20,
        height: 20,
      })),
      edges: Array.from({ length: 9 }, (_, index) => ({
        id: `edge-${index}`,
        sources: [`node-${index}`],
        targets: [`node-${index + 1}`],
      })),
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
  });
}

for (const [validify, expectedRows] of [
  ["NO", [0, 0, 1, 1, 1, 2, 2, 2]],
  ["GREEDY", [0, 0, 0, 1, 1, 1, 2, 2]],
  ["LOOK_BACK", [0, 1, 1, 1, 2, 2, 2, 2]],
] as const) {
  it(`applies source-equivalent MANUAL cuts with ${validify} validification`, async () => {
    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.layered.wrapping.strategy": "SINGLE_EDGE",
        "elk.layered.wrapping.cutting.strategy": "MANUAL",
        "elk.layered.wrapping.cutting.cuts": [2, 5],
        "elk.layered.wrapping.validify.strategy": validify,
        "elk.layered.wrapping.validify.forbiddenIndices": [2],
      },
      children: Array.from({ length: 8 }, (_, index) => ({
        id: `node-${index}`,
        width: 20,
        height: 20,
      })),
      edges: Array.from({ length: 7 }, (_, index) => ({
        id: `edge-${index}`,
        sources: [`node-${index}`],
        targets: [`node-${index + 1}`],
      })),
    };
    const actual = await new NativeELK().layout(structuredClone(graph));
    const rowCoordinates = [...new Set(actual.children?.map((node) => node.y) ?? [])].sort(
      (left, right) => (left ?? 0) - (right ?? 0),
    );
    expect(actual.children?.map((node) => rowCoordinates.indexOf(node.y))).toEqual(expectedRows);
  });
}

function createMultiEdgeWrappingGraph(option?: string, value?: string): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.aspectRatio": "1",
      "elk.layered.layering.strategy": "LONGEST_PATH",
      "elk.layered.wrapping.strategy": "MULTI_EDGE",
      ...(option === undefined ? {} : { [`elk.layered.wrapping.multiEdge.${option}`]: value }),
    },
    children: Array.from({ length: 10 }, (_, index) => ({
      id: `multi-${index}`,
      width: 20,
      height: 20,
    })),
    edges: [
      ...Array.from({ length: 9 }, (_, index) => ({
        id: `backbone-${index}`,
        sources: [`multi-${index}`],
        targets: [`multi-${index + 1}`],
      })),
      ...[
        [0, 3],
        [2, 5],
        [5, 8],
      ].map(([source, target], index) => ({
        id: `skip-${index}`,
        sources: [`multi-${source}`],
        targets: [`multi-${target}`],
      })),
    ],
  };
}

for (const [option, value] of [
  ["improveCuts", "false"],
  ["improveCuts", "true"],
  ["distancePenalty", "1"],
  ["distancePenalty", "2"],
  ["distancePenalty", "4"],
  ["improveWrappedEdges", "false"],
  ["improveWrappedEdges", "true"],
] as const) {
  it(`matches ELK general MULTI_EDGE cuts with ${option}=${value}`, async () => {
    const graph = createMultiEdgeWrappingGraph(option, value);
    const expected = (await new OracleELK().layout(
      structuredClone(graph) as never,
    )) as unknown as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(graph));

    expect(actual.children?.map((node) => node.x)).toEqual(
      expected.children?.map((node) => node.x),
    );
    expect(actual.width).toBe(expected.width);
    expect(actual.edges?.every((edge) => (edge.sections?.[0]?.bendPoints?.length ?? 0) > 0)).toBe(
      expected.edges?.every((edge) => (edge.sections?.[0]?.bendPoints?.length ?? 0) > 0),
    );
  });
}
