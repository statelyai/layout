import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

function fixture(flexibility: "NODE_SIZE" | "NODE_SIZE_WHERE_SPACE_PERMITS", perNode: boolean) {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.separateConnectedComponents": "false",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "NONE",
      "elk.layered.nodePlacement.networkSimplex.nodeFlexibility.default": perNode
        ? "NONE"
        : flexibility,
    },
    children: [
      {
        id: "source",
        width: 40,
        height: 20,
        layoutOptions: {
          "elk.portConstraints": "FIXED_ORDER",
          ...(perNode
            ? { "elk.layered.nodePlacement.networkSimplex.nodeFlexibility": flexibility }
            : {}),
        },
        ports: Array.from({ length: 4 }, (_, index) => ({
          id: `p${index}`,
          width: 8,
          height: 8,
          layoutOptions: {
            "elk.port.side": "EAST",
            "elk.port.index": String(index),
          },
        })),
      },
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `target-${index}`,
        width: 30,
        height: 20,
      })),
    ],
    edges: Array.from({ length: 4 }, (_, index) => ({
      id: `edge-${index}`,
      sources: [`p${index}`],
      targets: [`target-${index}`],
    })),
  } satisfies ElkNode;
}

async function compare(graph: ElkNode) {
  const expected = (await new OracleELK().layout(
    structuredClone(graph) as never,
  )) as unknown as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect(
    actual.children?.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
  ).toEqual(expected.children?.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })));
  expect(actual.children?.[0]?.ports?.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
    expected.children?.[0]?.ports?.map(({ id, x, y }) => ({ id, x, y })),
  );
}

describe("ELK network-simplex node-flexibility parity", () => {
  for (const flexibility of ["NODE_SIZE", "NODE_SIZE_WHERE_SPACE_PERMITS"] as const) {
    it(`matches ${flexibility} inherited from the parent`, async () => {
      await compare(fixture(flexibility, false));
    });

    it(`matches a per-node ${flexibility} override`, async () => {
      await compare(fixture(flexibility, true));
    });
  }
});
