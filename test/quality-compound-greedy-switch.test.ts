import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundOptionsFixture } from "../scripts/parity/compound-options-corpus";
import { complexCompoundFixture } from "../scripts/parity/complex-compound-corpus";
import { HARD, score } from "../scripts/parity/quality-gate";

// ELK skips greedy switching for INCLUDE_CHILDREN layouts by default. Native
// runs the two-sided pass there, which only accepts strict improvements.
it.each([
  ["options seed 3 RIGHT", () => compoundOptionsFixture(3, "RIGHT")],
  ["complex seed 13 RIGHT", () => complexCompoundFixture(13, "RIGHT")],
  ["complex seed 21 RIGHT", () => complexCompoundFixture(21, "RIGHT")],
])(
  "crosses fewer edges than ELK in compound layouts (%s)",
  async (_, fixture) => {
    const input = fixture();
    const native = score(await new NativeELK().layout(structuredClone(input)), input);
    const elk = score(
      (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode,
      input,
    );
    expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
      Object.fromEntries(HARD.map((key) => [key, 0])),
    );
    expect(native.edgeCrossings).toBeLessThan(elk.edgeCrossings);
  },
  60000,
);
