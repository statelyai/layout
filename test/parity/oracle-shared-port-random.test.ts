import { expect, it } from "vitest";
import Oracle from "elkjs/lib/elk.bundled.js";
import Native from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { sharedPortFixture } from "../helpers/shared-port-fixture";
function expectGeometry(actual: ElkNode, expected: ElkNode) {
  for (const key of ["width", "height"] as const)
    expect(actual[key], `root.${key}`).toBeCloseTo(expected[key]!, 12);
  expect(actual.children).toHaveLength(expected.children!.length);
  expect(actual.edges).toHaveLength(expected.edges!.length);
  for (const node of expected.children ?? []) {
    const match = actual.children!.find((n) => n.id === node.id)!;
    for (const key of ["x", "y", "width", "height"] as const)
      expect(match[key], `${node.id}.${key}`).toBeCloseTo(node[key]!, 12);
    expect(match.ports).toHaveLength(node.ports!.length);
    for (const port of node.ports ?? []) {
      const p = match.ports!.find((p) => p.id === port.id)!;
      for (const key of ["x", "y", "width", "height"] as const)
        expect(p[key], `${port.id}.${key}`).toBeCloseTo(port[key]!, 12);
    }
  }
  for (const edge of expected.edges ?? []) {
    const match = actual.edges!.find((e) => e.id === edge.id)!;
    const actualJunctions = [...(match.junctionPoints ?? [])].sort(
      (a, b) => a.x - b.x || a.y - b.y,
    );
    const expectedJunctions = [...(edge.junctionPoints ?? [])].sort(
      (a, b) => a.x - b.x || a.y - b.y,
    );
    expect(actualJunctions, `${edge.id}.junctions`).toHaveLength(expectedJunctions.length);
    for (const [i, p] of actualJunctions.entries())
      for (const key of ["x", "y"] as const)
        expect(p[key], `${edge.id}.junctions.${i}.${key}`).toBeCloseTo(
          expectedJunctions[i]![key],
          12,
        );
    expect(match.sections).toHaveLength(edge.sections!.length);
    const s = edge.sections![0]!,
      a = match.sections![0]!;
    const wanted = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint],
      points = [a.startPoint, ...(a.bendPoints ?? []), a.endPoint];
    expect(points, String(edge.id)).toHaveLength(wanted.length);
    for (const [i, p] of points.entries())
      for (const key of ["x", "y"] as const)
        expect(p[key], `${edge.id}.${i}.${key}`).toBeCloseTo(wanted[i]![key], 12);
  }
}
for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"] as const)
  for (let seed = 1; seed <= 50; seed++)
    it(`matches complete ELK geometry for random shared-port graph ${direction === "RIGHT" ? "" : direction + " "}seed ${seed}`, async () => {
      const input = sharedPortFixture(seed, direction),
        expected = (await new Oracle().layout(
          structuredClone(input) as never,
        )) as unknown as ElkNode;
      expectGeometry(await new Native().layout(structuredClone(input)), expected);
    });
