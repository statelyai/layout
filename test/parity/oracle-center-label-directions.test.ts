import OracleELK from "elkjs/lib/elk.bundled.js";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { expect, it } from "vitest";
for (const text of [undefined, "edge"]) {
  for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"]) {
    for (const inline of [true, false]) {
      it(`matches center-label geometry for ${direction}, inline=${inline}, text=${String(text)}`, async () => {
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
              labels: [
                {
                  id: "label",
                  text,
                  width: 24,
                  height: 10,
                  layoutOptions: {
                    "elk.edgeLabels.placement": "CENTER",
                    "elk.edgeLabels.inline": String(inline),
                  },
                },
              ],
            },
          ],
        };
        const expected = (await new OracleELK().layout(structuredClone(graph) as never)) as ElkNode;
        const actual = await new NativeELK().layout(structuredClone(graph));
        expect(actual.width).toBeCloseTo(expected.width!, 12);
        expect(actual.height).toBeCloseTo(expected.height!, 12);
        for (const n of expected.children!) {
          const node = actual.children!.find((x) => x.id === n.id)!;
          expect(node.x).toBeCloseTo(n.x!, 12);
          expect(node.y).toBeCloseTo(n.y!, 12);
        }
        const a = actual.edges![0]!,
          e = expected.edges![0]!;
        expect(a.labels![0]!.x).toBeCloseTo(e.labels![0]!.x!, 12);
        expect(a.labels![0]!.y).toBeCloseTo(e.labels![0]!.y!, 12);
        expect(a.sections!.length).toBe(e.sections!.length);
        for (const [index, section] of e.sections!.entries()) {
          const native = a.sections![index]!;
          const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
          const nativePoints = [native.startPoint, ...(native.bendPoints ?? []), native.endPoint];
          expect(nativePoints.length).toBe(points.length);
          for (const [i, p] of points.entries()) {
            expect(nativePoints[i]!.x).toBeCloseTo(p.x, 12);
            expect(nativePoints[i]!.y).toBeCloseTo(p.y, 12);
          }
        }
      });
    }
  }
}
