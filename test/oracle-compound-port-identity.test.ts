import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import {
  compoundFixture,
  compoundGeometry,
  geometryDifferences,
} from "../scripts/parity/compound-corpus";

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"]) {
  it.each([
    1,
    2,
    3,
    4,
    10,
    12,
    15,
    18,
    19,
    24,
    ...(direction === "RIGHT" || direction === "LEFT" ? [14, 23, 25] : [6, 13, 14, 17, 22, 23, 25]),
  ])(
    `matches complete seed %i geometry and route containers through a ${direction} boundary`,
    async (seed) => {
      const input = compoundFixture(seed, direction);
      const actual = await new NativeELK().layout(structuredClone(input));
      const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
      expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
    },
  );
  it(`preserves the selected descendant port through a ${direction} compound boundary`, async () => {
    const input = compoundFixture(1, direction);
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    const relativeSource = (graph: ElkNode) => {
      const group = graph.children!.find((node) => node.id === "g0")!;
      const leaf = group.children!.find((node) => node.id === "n0")!;
      const crossing = graph.edges!.find((edge) => edge.sources?.[0] === "n0")!;
      const start = crossing.sections![0]!.startPoint;
      return { x: start.x - group.x! - leaf.x!, y: start.y - group.y! - leaf.y! };
    };
    const a = relativeSource(actual),
      b = relativeSource(expected);
    expect(a.x).toBeCloseTo(b.x, 12);
    expect(a.y).toBeCloseTo(b.y, 12);
    // Direction must select the same physical node face as real ELK.
    const leaf = actual.children![0]!.children![0]!;
    if (direction === "RIGHT") expect(a.x).toBe(leaf.width);
    if (direction === "LEFT") expect(a.x).toBe(0);
    if (direction === "DOWN") expect(a.y).toBe(leaf.height);
    if (direction === "UP") expect(a.y).toBe(0);
  });
}

for (const direction of ["RIGHT", "LEFT", "DOWN", "UP"]) {
  it(`matches seed 3 child geometry after ancestor-first port import (${direction})`, async () => {
    const input = compoundFixture(3, direction);
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    const local = (graph: ElkNode) => {
      const child = graph.children!.find((node) => node.id === "g1")!;
      // This regression covers the child phase; the complete parent mismatch
      // stays in the random gate with all root coordinates and route sections.
      return compoundGeometry({ ...child, x: 0, y: 0 });
    };
    expect(geometryDifferences(local(actual), local(expected))).toEqual([]);
  });
}
