import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";
for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const)
  for (const strategy of [
    "LEFT",
    "RIGHT",
    "LEFT_RIGHT_CONSTRAINT_LOCKING",
    "LEFT_RIGHT_CONNECTION_LOCKING",
  ])
    for (const profile of ["implicit", "flow", "cross"])
      it(`matches rigid directional compaction (${direction}, ${strategy}, ${profile})`, async () => {
        const vertical = direction === "DOWN" || direction === "UP",
          negative = direction === "LEFT" || direction === "UP";
        const sides =
          profile === "cross"
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
            "elk.separateConnectedComponents": false,
            "elk.layered.compaction.postCompaction.strategy": strategy,
          },
          children: [
            { id: "a", width: 30, height: 20 },
            { id: "b", width: 40, height: 30 },
          ].map((n, i) => ({
            ...n,
            ...(profile === "implicit"
              ? {}
              : {
                  layoutOptions: { "elk.portConstraints": "FIXED_POS" },
                  ports: [
                    {
                      id: n.id + ":p",
                      width: 0,
                      height: 0,
                      x: sides[i] === "WEST" ? 0 : sides[i] === "EAST" ? n.width : n.width / 2,
                      y: sides[i] === "NORTH" ? 0 : sides[i] === "SOUTH" ? n.height : n.height / 2,
                      layoutOptions: { "elk.port.side": sides[i] },
                    },
                  ],
                }),
          })),
          edges: [
            {
              id: "edge",
              sources: [profile === "implicit" ? "a" : "a:p"],
              targets: [profile === "implicit" ? "b" : "b:p"],
            },
          ],
        };

        const actual = await new Native().layout(structuredClone(input));
        const expected = (await new Oracle().layout(structuredClone(input) as never)) as ElkNode;
        expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
          [],
        );
      });
