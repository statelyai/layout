import Oracle from "elkjs/lib/elk.bundled.js";
import Native from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { expect, it } from "vitest";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const) {
  for (const profile of ["implicit", "flow ports", "cross ports"] as const) {
    it(`matches grouped EDGE_LENGTH geometry: ${direction}, ${profile}`, async () => {
      const vertical = direction === "DOWN" || direction === "UP";
      const negative = direction === "LEFT" || direction === "UP";
      const sides =
        profile === "cross ports"
          ? vertical
            ? ["WEST", "EAST"]
            : ["NORTH", "SOUTH"]
          : vertical
            ? negative
              ? ["NORTH", "SOUTH"]
              : ["SOUTH", "NORTH"]
            : negative
              ? ["WEST", "EAST"]
              : ["EAST", "WEST"];
      const input: ElkNode = {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": direction,
          "elk.edgeRouting": "ORTHOGONAL",
          "elk.separateConnectedComponents": "false",
          "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
        },
        children: [
          { id: "a", width: 30, height: 20 },
          { id: "b", width: 40, height: 30 },
        ].map((node, index) => ({
          ...node,
          ...(profile === "implicit"
            ? {}
            : {
                layoutOptions: { "elk.portConstraints": "FIXED_POS" },
                ports: [
                  {
                    id: `${node.id}:port`,
                    width: 0,
                    height: 0,
                    x:
                      sides[index] === "WEST"
                        ? 0
                        : sides[index] === "EAST"
                          ? node.width
                          : node.width / 2,
                    y:
                      sides[index] === "NORTH"
                        ? 0
                        : sides[index] === "SOUTH"
                          ? node.height
                          : node.height / 2,
                    layoutOptions: { "elk.port.side": sides[index]! },
                  },
                ],
              }),
        })),
        edges: [
          {
            id: "edge",
            sources: [profile === "implicit" ? "a" : "a:port"],
            targets: [profile === "implicit" ? "b" : "b:port"],
          },
        ],
      };
      const oracle = (await new Oracle().layout(structuredClone(input) as never)) as ElkNode;
      const native = await new Native().layout(structuredClone(input));
      expect(native.width).toBeCloseTo(oracle.width!, 12);
      expect(native.height).toBeCloseTo(oracle.height!, 12);
      for (const expected of oracle.children!) {
        const actual = native.children!.find((node) => node.id === expected.id)!;
        expect(actual.x).toBeCloseTo(expected.x!, 12);
        expect(actual.y).toBeCloseTo(expected.y!, 12);
        expect(actual.ports).toEqual(expected.ports);
      }
      expect(native.edges!.map((edge) => edge.sections)).toEqual(
        oracle.edges!.map((edge) => edge.sections),
      );
    });
  }
}
