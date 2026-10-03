import Oracle from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import Native from "../src/elkjs";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

for (const alignment of ["NONE", "RIGHTUP", "RIGHTDOWN", "LEFTUP", "LEFTDOWN"] as const) {
  it(`matches complete ELK geometry for singleton block straightening ${alignment}`, async () => {
    const input = flatFixture(3, "RIGHT");
    input.layoutOptions = {
      ...input.layoutOptions,
      "elk.layered.nodePlacement.bk.fixedAlignment": alignment,
    };
    const actual = await new Native().layout(structuredClone(input));
    const expected = await new Oracle().layout(structuredClone(input) as never);
    expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
  });
}
