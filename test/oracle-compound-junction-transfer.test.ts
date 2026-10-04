import { expect, it } from "vitest";
import OracleELK from "elkjs/lib/elk.bundled.js";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundOptionsFixture } from "../scripts/parity/compound-options-corpus";
import { compoundGeometry, geometryDifferences } from "../scripts/parity/compound-corpus";

it("preserves child-scope junctions when joining random cross-hierarchy routes (seed 13)", async () => {
  const input = compoundOptionsFixture(13, "RIGHT");
  const actual = await new NativeELK().layout(structuredClone(input));
  const expected = (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode;
  expect(geometryDifferences(compoundGeometry(actual), compoundGeometry(expected))).toEqual([]);
}, 30000);
