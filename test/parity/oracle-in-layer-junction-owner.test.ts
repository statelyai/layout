import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { compoundOptionsFixture } from "../../scripts/parity/compound-options-corpus";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";

it("retains physical incident edge order for in-layer junction ownership (seed 20 RIGHT)", async () => {
  const input = compoundOptionsFixture(20, "RIGHT");
  const actual = await new NativeELK().layout(structuredClone(input));
  const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
  expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
}, 30000);
