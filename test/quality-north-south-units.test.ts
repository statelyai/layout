import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compare, HARD, score } from "../scripts/parity/quality-gate";

// Forced model order places n0 between n3 and n3's northern port dummies;
// ELK then routes n3's north port edges through n0.
it("keeps north/south port dummies beside their node (forced model order, flat seed 7 RIGHT)", async () => {
  const input = flatFixture(7, "RIGHT");
  input.layoutOptions = {
    ...input.layoutOptions,
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    "elk.layered.crossingMinimization.forceNodeModelOrder": true,
  };
  const native = score(await new NativeELK().layout(structuredClone(input)), input);
  const elk = score(
    (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode,
    input,
  );
  expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
    Object.fromEntries(HARD.map((key) => [key, 0])),
  );
  expect(elk.nodeHits).toBeGreaterThan(0);
  expect(native.edgeCrossings).toBeLessThanOrEqual(elk.edgeCrossings);
  expect(compare(native, elk).status).toBe("WIN");
}, 30000);
