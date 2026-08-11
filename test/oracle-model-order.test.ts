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

  for (const portModelOrder of [false, true]) {
    it(`matches portModelOrder=${portModelOrder}`, async () => {
      const input: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
          "elk.layered.considerModelOrder.portModelOrder": String(portModelOrder),
        },
        children: [
          {
            id: "source",
            width: 30,
            height: 60,
            layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
            ports: ["p1", "p2"].map((id) => ({
              id,
              width: 8,
              height: 8,
              layoutOptions: { "elk.port.side": "EAST" },
            })),
          },
          { id: "t1", width: 20, height: 20 },
          { id: "t2", width: 20, height: 20 },
        ],
        edges: [
          { id: "e2", sources: ["p2"], targets: ["t2"] },
          { id: "e1", sources: ["p1"], targets: ["t1"] },
        ],
      };
      const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
      const actual = await new NativeELK().layout(structuredClone(input));
      const signature = (graph: ElkNode) => {
        const source = graph.children?.find((node) => node.id === "source");
        const targetYs = ["t1", "t2"].map(
          (id) => graph.children?.find((node) => node.id === id)?.y ?? 0,
        );
        return {
          portOrder: [...(source?.ports ?? [])]
            .sort((left, right) => (left.y ?? 0) - (right.y ?? 0))
            .map((port) => port.id),
          targetOrder: ["t1", "t2"].sort(
            (left, right) =>
              targetYs[["t1", "t2"].indexOf(left)]! - targetYs[["t1", "t2"].indexOf(right)]!,
          ),
        };
      };
      expect(signature(actual)).toEqual(signature(expected));
    });
  }

  for (const longEdgeStrategy of ["DUMMY_NODE_OVER", "DUMMY_NODE_UNDER", "EQUAL"]) {
    it(`matches ${longEdgeStrategy}`, async () => {
      const input: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.layered.layering.strategy": "INTERACTIVE",
          "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
          "elk.layered.considerModelOrder.longEdgeStrategy": longEdgeStrategy,
          "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
        },
        children: [
          { id: "source", x: 0, y: 0, width: 20, height: 20 },
          { id: "unconnected", x: 100, y: 0, width: 20, height: 20 },
          { id: "target", x: 200, y: 0, width: 20, height: 20 },
        ],
        edges: [{ id: "long", sources: ["source"], targets: ["target"] }],
      };
      const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
      const actual = await new NativeELK().layout(structuredClone(input));
      const relativeSide = (graph: ElkNode) => {
        const source = graph.children?.find((node) => node.id === "source");
        const unconnected = graph.children?.find((node) => node.id === "unconnected");
        return Math.sign((unconnected?.y ?? 0) - (source?.y ?? 0));
      };
      expect(relativeSide(actual)).toBe(relativeSide(expected));
    });
  }

  for (const nodeInfluence of [0, 0.5, 1, 2]) {
    it(`matches node crossing-counter influence ${nodeInfluence}`, async () => {
      const input: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.separateConnectedComponents": "false",
          "elk.randomSeed": "1",
          "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
          "elk.layered.considerModelOrder.crossingCounterNodeInfluence": String(nodeInfluence),
        },
        children: ["s0", "s1", "s2", "t0", "t1", "t2"].map((id) => ({
          id,
          width: 20,
          height: 20,
        })),
        edges: [
          { id: "e0", sources: ["s0"], targets: ["t0"] },
          { id: "e1", sources: ["s0"], targets: ["t1"] },
          { id: "e3", sources: ["s1"], targets: ["t0"] },
        ],
      };
      const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
      const actual = await new NativeELK().layout(structuredClone(input));
      const layerOrders = (graph: ElkNode) => [
        ["s0", "s1", "s2"].sort(
          (left, right) =>
            (graph.children?.find((node) => node.id === left)?.y ?? 0) -
            (graph.children?.find((node) => node.id === right)?.y ?? 0),
        ),
        ["t0", "t1", "t2"].sort(
          (left, right) =>
            (graph.children?.find((node) => node.id === left)?.y ?? 0) -
            (graph.children?.find((node) => node.id === right)?.y ?? 0),
        ),
      ];
      expect(layerOrders(actual)).toEqual(layerOrders(expected));
    });
  }
});
