import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { compoundOptionsFixture } from "../scripts/parity/compound-options-corpus";
import { HARD, score } from "../scripts/parity/quality-gate";

// e5 loops on n1 with five route points; its label at the route midpoint
// covered n1. It now sits beside a loop segment, clear of nodes and routes.
it.each(["RIGHT", "LEFT", "DOWN", "UP"])(
  "places self-loop labels clear of nodes and routes (options seed 12 %s)",
  async (direction) => {
    const input = compoundOptionsFixture(12, direction);
    const native = score(await new NativeELK().layout(structuredClone(input)), input);
    const elk = score(
      (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode,
      input,
    );
    expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
      Object.fromEntries(HARD.map((key) => [key, 0])),
    );
    expect(native.edgeCrossings).toBeLessThanOrEqual(elk.edgeCrossings);
  },
  30000,
);

// A same-port loop's square route moves its label into e0's path; the label
// takes the first spot clear of nodes and routes instead.
it("keeps self-loop labels off other routes (options seed 204 RIGHT)", async () => {
  const input = compoundOptionsFixture(204, "RIGHT");
  const native = score(await new NativeELK().layout(structuredClone(input)), input);
  expect(native.edgeLabelHits).toBe(0);
  expect(native.labelNodeOverlaps).toBe(0);
}, 30000);
