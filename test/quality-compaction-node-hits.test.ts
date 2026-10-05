import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compare, HARD, score } from "../scripts/parity/quality-gate";

// LEFT post-compaction moves n14 across its own route channel; ELK routes
// e15 and e23 through n14. Native keeps the uncompacted layout instead.
it("never lets post-compaction route edges through nodes (flat seed 1 RIGHT, LEFT)", async () => {
  const input = flatFixture(1, "RIGHT");
  input.layoutOptions = {
    ...input.layoutOptions,
    "elk.layered.compaction.postCompaction.strategy": "LEFT",
  };
  const native = score(await new NativeELK().layout(structuredClone(input)), input);
  const elk = score(
    (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode,
    input,
  );
  expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
    Object.fromEntries(HARD.map((key) => [key, 0])),
  );
  expect(elk.nodeHits).toBe(2);
  expect(native.edgeCrossings).toBeLessThanOrEqual(elk.edgeCrossings);
  expect(compare(native, elk).status).toBe("WIN");
}, 30000);

// LEFT compaction folds e22's channel onto its first segment: a 278 px retrace.
it("never lets post-compaction fold a route onto itself (flat seed 37 RIGHT, LEFT)", async () => {
  const input = flatFixture(37, "RIGHT");
  input.layoutOptions = {
    ...input.layoutOptions,
    "elk.layered.compaction.postCompaction.strategy": "LEFT",
  };
  const native = score(await new NativeELK().layout(structuredClone(input)), input);
  const elk = score(
    (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode,
    input,
  );
  expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
    Object.fromEntries(HARD.map((key) => [key, 0])),
  );
  expect(elk.selfRetraceLength).toBeGreaterThan(0);
  expect(compare(native, elk).status).toBe("WIN");
}, 30000);
