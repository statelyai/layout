import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const) {
  for (const count of [3, 4, 5]) {
    for (const named of [true, false]) {
      it(`matches complete ${direction} ${count}-node ${named ? "physical-port" : "implicit"} fan-out`, async () => {
        const input: ElkNode = {
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": direction,
            "elk.mergeEdges": !named,
          },
          children: Array.from({ length: count }, (_, index) => ({
            id: `n${index}`,
            width: 80,
            height: 50,
            ...(named && index === 0
              ? {
                  layoutOptions: { "elk.portConstraints": "FIXED_SIDE" },
                  ports: [
                    {
                      id: "out",
                      width: 0,
                      height: 0,
                      layoutOptions: {
                        "elk.port.side": {
                          RIGHT: "EAST",
                          LEFT: "WEST",
                          DOWN: "SOUTH",
                          UP: "NORTH",
                        }[direction],
                      },
                    },
                  ],
                }
              : {}),
          })),
          edges: Array.from({ length: count - 1 }, (_, index) => ({
            id: `e${index}`,
            sources: [index === 0 && named ? "out" : `n${index}`],
            targets: [`n${index + 1}`],
          })),
        };
        for (let index = 2; index < count; index++)
          input.edges!.push({
            id: `fan${index}`,
            sources: [named ? "out" : "n0"],
            targets: [`n${index}`],
          });
        const actual = await new NativeELK().layout(structuredClone(input));
        const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
        expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
          [],
        );
      });
    }
  }
}
