import { mixedSelfLoopFixture } from "../scripts/parity/mixed-self-loop-corpus";
import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const)
  for (const side of ["NORTH", "EAST", "SOUTH", "WEST"] as const)
    for (const explicit of ["source", "target"] as const)
      it(`matches complete ${direction} self-loop geometry with explicit ${side} ${explicit}`, async () => {
        const input: ElkNode = {
          id: "root",
          layoutOptions: { "elk.algorithm": "layered", "elk.direction": direction },
          children: [
            {
              id: "a",
              width: 100,
              height: 80,
              layoutOptions: { "elk.portConstraints": "FIXED_POS" },
              ports: [
                {
                  id: "p",
                  width: 0,
                  height: 0,
                  x: side === "EAST" ? 100 : side === "WEST" ? 0 : 40,
                  y: side === "SOUTH" ? 80 : side === "NORTH" ? 0 : 30,
                  layoutOptions: { "elk.port.side": side },
                },
              ],
            },
          ],
          edges: [
            {
              id: "e",
              sources: [explicit === "source" ? "p" : "a"],
              targets: [explicit === "target" ? "p" : "a"],
            },
          ],
        };
        const actual = await new NativeELK().layout(structuredClone(input));
        const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
        expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
          [],
        );
      });

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const)
  it.each(Array.from({ length: 25 }, (_, i) => i + 1))(
    `matches bounded random self-loop seed %i in ${direction}`,
    async (seed) => {
      const input = mixedSelfLoopFixture(seed, direction);
      const actual = await new NativeELK().layout(structuredClone(input));
      const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
      expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
    },
  );
