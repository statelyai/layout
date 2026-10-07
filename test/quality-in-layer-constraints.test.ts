import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundOptionsFixture } from "../scripts/parity/compound-options-corpus";
import { compare, HARD, score } from "../scripts/parity/quality-gate";

// A southern hierarchical port helper must end its layer. Left mid-layer, the
// route from n3 to g1's eastern boundary cuts through n4.
it("keeps hierarchical port helpers at their layer's end (options seed 4 DOWN)", async () => {
  const input = compoundOptionsFixture(4, "DOWN");
  const native = score(await new NativeELK().layout(structuredClone(input)), input);
  const elk = score(
    (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode,
    input,
  );
  expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
    Object.fromEntries(HARD.map((key) => [key, 0])),
  );
  expect(native.edgeCrossings).toBeLessThanOrEqual(elk.edgeCrossings);
  expect(compare(native, elk).status).not.toBe("LOSS");
}, 30000);
