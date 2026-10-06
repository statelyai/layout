import { expect, it } from "vitest";
import OracleELK from "elkjs/lib/elk.bundled.js";
import NativeELK from "../../src/elkjs";
import type { ElkNode } from "../../src/elkjs/types";
import { compoundOptionsFixture } from "../../scripts/parity/compound-options-corpus";
import { compoundGeometry, geometryDifferences } from "../../scripts/parity/compound-corpus";

it("does not reserve an east self-loop twice after placing a boundary helper (seed 2 DOWN)", async () => {
  const input = compoundOptionsFixture(2, "DOWN");
  const actual = await new NativeELK().layout(structuredClone(input));
  const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
  expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
}, 30000);
