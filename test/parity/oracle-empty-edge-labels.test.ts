import OracleELK from "elkjs/lib/elk.bundled.js";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { expect, it } from "vitest";
for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"]) {
  for (const text of [undefined, ""]) {
    for (const position of [undefined, { x: 3, y: 5 }]) {
      it(`ignores dimensioned ${String(text)} text labels for ${direction}, authored position=${Boolean(position)}`, async () => {
        const graph: ElkNode = {
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": direction,
            "elk.edgeRouting": "ORTHOGONAL",
            "elk.separateConnectedComponents": "false",
          },
          children: [
            { id: "a", width: 30, height: 20 },
            { id: "b", width: 40, height: 30 },
          ],
          edges: [
            {
              id: "edge",
              sources: ["a"],
              targets: ["b"],
              labels: [{ id: "label", text, width: 24, height: 10, ...position }],
            },
          ],
        };
        const expected = (await new OracleELK().layout(structuredClone(graph) as never)) as ElkNode;
        const actual = await new NativeELK().layout(structuredClone(graph));
        expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
        expect(actual.children!.map((n) => [n.id, n.x, n.y, n.width, n.height])).toEqual(
          expected.children!.map((n) => [n.id, n.x, n.y, n.width, n.height]),
        );
        expect(actual.edges![0]!.labels).toEqual(expected.edges![0]!.labels);
        expect(actual.edges![0]!.sections).toEqual(expected.edges![0]!.sections);
      });
    }
  }
}
