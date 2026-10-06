import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";
import fixtures from "../fixtures/hierarchy-canonical-port-sort.json";

for (const fixture of fixtures) {
  it(`sorts hierarchy ports in canonical direction: ${fixture.name} seed ${fixture.seed} ${fixture.direction}`, async () => {
    const input = fixture.input as ElkNode;
    const actual = await new NativeELK().layout(structuredClone(input));
    const expected = await new OracleELK().layout(structuredClone(input) as never);
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}
