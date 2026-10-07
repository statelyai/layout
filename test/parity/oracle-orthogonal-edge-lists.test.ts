import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";
import { flatFixture } from "../../scripts/parity/flat-corpus";

// Orthogonal routing builds hyperedge segments and junctions by walking port
// edge lists; a merged hyperedge dummy lists its kept edges first.
it.each([
  [2, "DOWN"],
  [2, "UP"],
  [17, "RIGHT"],
])(
  "assigns junctions in ELK edge-list order (flat seed %i %s)",
  async (seed, direction) => {
    const input = flatFixture(seed, direction);
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  },
  30000,
);
