import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const) {
  for (const extent of [4, 8, 12]) {
    for (const before of [true, false]) {
      it(`reserves ${extent}px ${before ? "before" : "after"} physical port margins (${direction})`, async () => {
        const vertical = direction === "DOWN" || direction === "UP";
        const negative = direction === "LEFT" || direction === "UP";
        const flowSide = vertical ? (negative ? "NORTH" : "SOUTH") : negative ? "WEST" : "EAST";
        const opposite = { NORTH: "SOUTH", SOUTH: "NORTH", WEST: "EAST", EAST: "WEST" }[flowSide];
        const children = ["a", "b", "c"].map((id, index) => {
          const side = index === 0 ? flowSide : opposite;
          return {
            id,
            width: 80,
            height: 50,
            layoutOptions: { "elk.portConstraints": "FIXED_POS" },
            ports: [
              {
                id: `${id}:p`,
                width: 4,
                height: 4,
                x: side === "WEST" ? -4 : side === "EAST" ? 80 : 38,
                y: side === "NORTH" ? -4 : side === "SOUTH" ? 50 : 23,
                layoutOptions: { "elk.port.side": side },
              },
              ...(index === 1
                ? [
                    {
                      id: `${id}:extra`,
                      x: vertical ? (before ? -extent : 80) : 30,
                      y: vertical ? 20 : before ? -extent : 50,
                      width: vertical ? extent : 4,
                      height: vertical ? 4 : extent,
                      layoutOptions: {
                        "elk.port.side": vertical
                          ? before
                            ? "WEST"
                            : "EAST"
                          : before
                            ? "NORTH"
                            : "SOUTH",
                      },
                    },
                  ]
                : []),
            ],
          };
        });
        const input: ElkNode = {
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": direction,
            "elk.separateConnectedComponents": false,
          },
          children,
          edges: [
            { id: "ab", sources: ["a:p"], targets: ["b:p"] },
            { id: "ac", sources: ["a:p"], targets: ["c:p"] },
          ],
        };
        const actual = await new NativeELK().layout(structuredClone(input));
        const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
        expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
          [],
        );
      });
    }
  }
}
