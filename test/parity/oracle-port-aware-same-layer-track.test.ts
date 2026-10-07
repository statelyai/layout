import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../../src/elkjs";
import { flatFixture } from "../../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";

for (const width of [2, 4, 8, 12]) {
  it(`matches complete ELK same-layer track geometry with ${width}px ports`, async () => {
    const input = flatFixture(22, "RIGHT");
    for (const node of input.children ?? [])
      for (const port of node.ports ?? []) port.width = width;
    const actual = await new Native().layout(structuredClone(input));
    const expected = await new Oracle().layout(structuredClone(input) as never);
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}
