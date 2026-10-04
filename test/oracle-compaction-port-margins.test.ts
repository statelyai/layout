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
    "EDGE_LENGTH",
  ])
    for (const incoming of [false, true])
      it(`keeps ${incoming ? "incoming" : "outgoing"} compound port margins (${direction}, ${strategy})`, async () => {
        const input: ElkNode = {
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": direction,
            "elk.hierarchyHandling": "INCLUDE_CHILDREN",
            "elk.layered.compaction.postCompaction.strategy": strategy,
          },
          children: [
            {
              id: "group",
              children: [
                { id: "a", width: 30, height: 40 },
                { id: "b", width: 40, height: 30 },
              ],
              edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
            },
            { id: "outside", width: 30, height: 20 },
          ],
          edges: [
            {
              id: "boundary",
              sources: [incoming ? "outside" : "a"],
              targets: [incoming ? "b" : "outside"],
            },
          ],
        };

        const actual = await new Native().layout(structuredClone(input));
        const expected = (await new Oracle().layout(structuredClone(input) as never)) as ElkNode;
        expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual(
          [],
        );
      });
