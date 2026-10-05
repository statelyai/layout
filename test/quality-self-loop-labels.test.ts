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
