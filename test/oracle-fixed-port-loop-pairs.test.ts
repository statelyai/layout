import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const)
  for (const sourceSide of ["NORTH", "EAST", "SOUTH", "WEST"] as const)
    for (const targetSide of ["NORTH", "EAST", "SOUTH", "WEST"] as const) {
      if (sourceSide === targetSide) continue;
      it(`routes fixed loop ${sourceSide} to ${targetSide} in ${direction}`, async () => {
        const input: ElkNode = {
          id: "root",
          layoutOptions: { "elk.algorithm": "layered", "elk.direction": direction },
          children: [
            {
              id: "a",
              width: 100,
              height: 80,
              layoutOptions: { "elk.portConstraints": "FIXED_POS" },
              ports: [sourceSide, targetSide].map((side, index) => ({
                id: `p${index}`,
                width: 8,
                height: 8,
                x: side === "WEST" ? -8 : side === "EAST" ? 100 : 40,
                y: side === "NORTH" ? -8 : side === "SOUTH" ? 80 : 30,
                layoutOptions: { "elk.port.side": side },
              })),
            },
          ],
          edges: [{ id: "e", sources: ["p0"], targets: ["p1"] }],
        };
        const actual = await new Native().layout(structuredClone(input));
        const expected = (await new Oracle().layout(structuredClone(input) as never)) as ElkNode;
        expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
          [],
        );
      });
    }
