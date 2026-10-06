import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";
for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const)
  for (const constraints of ["FIXED_SIDE", "FIXED_ORDER"])
    for (const size of [0, 4]) {
      it(`routes shared flow ports alongside a cross-side port (${direction}, ${constraints}, ${size}px)`, async () => {
        const forward = { RIGHT: "EAST", LEFT: "WEST", DOWN: "SOUTH", UP: "NORTH" }[direction];
        const backward = { EAST: "WEST", WEST: "EAST", SOUTH: "NORTH", NORTH: "SOUTH" }[forward];
        const cross = direction === "RIGHT" || direction === "LEFT" ? "SOUTH" : "EAST";
        const input: ElkNode = {
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": direction,
            "elk.separateConnectedComponents": false,
          },
          children: ["a", "b", "c", "d"].map((id, index) => ({
            id,
            width: 80,
            height: 50,
            layoutOptions: { "elk.portConstraints": constraints },
            ports: [
              {
                id: id + ":p",
                width: size,
                height: size,
                layoutOptions: { "elk.port.side": index === 0 ? forward : backward },
              },
              ...(index === 0
                ? [
                    {
                      id: "a:cross",
                      width: size,
                      height: size,
                      layoutOptions: { "elk.port.side": cross },
                    },
                  ]
                : []),
            ],
          })),
          edges: [
            { id: "ab", sources: ["a:p"], targets: ["b:p"] },
            { id: "ac", sources: ["a:p"], targets: ["c:p"] },
            { id: "ad", sources: ["a:cross"], targets: ["d:p"] },
          ],
        };

        const actual = await new Native().layout(structuredClone(input));
        const expected = (await new Oracle().layout(structuredClone(input) as never)) as ElkNode;
        expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
          [],
        );
      });
    }
