import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../../src/elkjs";
import { compoundOptionsFixture } from "../../scripts/parity/compound-options-corpus";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";

it("joins junctions in physical routing order on reversed chains (seed 20 UP)", async () => {
  const input = compoundOptionsFixture(20, "UP");
  const actual = await new NativeELK().layout(structuredClone(input));
  const expected = await new OracleELK().layout(structuredClone(input) as never);
  expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
}, 30000);
