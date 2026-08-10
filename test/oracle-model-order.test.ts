import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import NativeELK, { type ElkNode } from "../src/elkjs";

function crossedGraph(
  strategy: string,
  force: boolean,
  nodeOptions: Record<string, Record<string, string>> = {},
  rootOptions: Record<string, string> = {},
): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.separateConnectedComponents": "false",
      "elk.layered.considerModelOrder.strategy": strategy,
      "elk.layered.crossingMinimization.forceNodeModelOrder": String(force),
      ...rootOptions,
    },
    children: ["s1", "s2", "t1", "t2"].map((id) => ({
      id,
      width: 20,
      height: 20,
      layoutOptions: nodeOptions[id],
    })),
    edges: [
      { id: "e1", sources: ["s1"], targets: ["t2"] },
      { id: "e2", sources: ["s2"], targets: ["t1"] },
    ],
  };
}

async function expectExactNodePositions(input: ElkNode): Promise<void> {
  const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(input));
  expect(actual.children?.map(({ id, x, y }) => ({ id, x, y }))).toEqual(
    expected.children?.map(({ id, x, y }) => ({ id, x, y })),
  );
}

describe("ELK model-order crossing parity", () => {
  for (const strategy of ["NODES_AND_EDGES", "PREFER_EDGES", "PREFER_NODES"]) {
    for (const force of [false, true]) {
      it(`matches ${strategy} with force=${force}`, async () => {
        await expectExactNodePositions(crossedGraph(strategy, force));
      });
    }
  }

  it("honors per-node noModelOrder", async () => {
    await expectExactNodePositions(
      crossedGraph("NODES_AND_EDGES", true, {
        t1: { "elk.layered.considerModelOrder.noModelOrder": "true" },
      }),
    );
  });

  for (const groupStrategy of ["ONLY_WITHIN_GROUP", "MODEL_ORDER", "ENFORCED"]) {
    it(`matches group strategy ${groupStrategy}`, async () => {
      await expectExactNodePositions(
        crossedGraph(
          "NODES_AND_EDGES",
          true,
          {
            t1: {
              "elk.layered.considerModelOrder.groupModelOrder.crossingMinimizationId": "2",
            },
            t2: {
              "elk.layered.considerModelOrder.groupModelOrder.crossingMinimizationId": "1",
            },
          },
          {
            "elk.layered.considerModelOrder.groupModelOrder.cmGroupOrderStrategy": groupStrategy,
          },
        ),
      );
    });
  }

  it("parses a custom enforced group-order set", async () => {
    // elkjs cannot deserialize this ELK Object-typed property; exercise the
    // compatible string form against ELK's source-defined ordering semantics.
    const actual = await new NativeELK().layout(
      crossedGraph(
        "NODES_AND_EDGES",
        true,
        {
          t1: {
            "elk.layered.considerModelOrder.groupModelOrder.crossingMinimizationId": "4",
          },
          t2: {
            "elk.layered.considerModelOrder.groupModelOrder.crossingMinimizationId": "3",
          },
        },
        {
          "elk.layered.considerModelOrder.groupModelOrder.cmGroupOrderStrategy": "ENFORCED",
          "elk.layered.considerModelOrder.groupModelOrder.cmEnforcedGroupOrders": "[3, 4]",
        },
      ),
    );
    expect(actual.children?.map(({ id, y }) => ({ id, y }))).toEqual([
      { id: "s1", y: 12 },
      { id: "s2", y: 52 },
      { id: "t1", y: 52 },
      { id: "t2", y: 12 },
    ]);
  });
});
