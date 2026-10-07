import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";

// Edgeless ports have no edge model order; ELK keeps them in authored order,
// without the WEST-side reversal applied to other ports.
it("keeps edgeless WEST ports in authored order, as ELK does", async () => {
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: [
      {
        id: "a",
        width: 80,
        height: 80,
        layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
        ports: ["w1", "w2", "w3"].map((id) => ({
          id,
          width: 8,
          height: 8,
          layoutOptions: { "elk.port.side": "WEST" },
        })),
      },
      { id: "b", width: 40, height: 40 },
    ],
    edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
  };
  const ports = (layout: ElkNode) => layout.children![0]!.ports!.map((port) => [port.id, port.y]);
  const expected = (await new OracleELK().layout(structuredClone(graph) as never)) as ElkNode;
  const actual = await new NativeELK().layout(structuredClone(graph));
  expect(ports(actual)).toEqual(ports(expected));
});
