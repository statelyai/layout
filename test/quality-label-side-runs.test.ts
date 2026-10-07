import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compare, HARD, score } from "../scripts/parity/quality-gate";

// ELK's smart label sides pair consecutive dummies of any kind whose long
// edges connect the same nodes. Reversed e24 pairs with e22's long-edge dummy,
// so its label goes above and the route stays straight.
it.each(["RIGHT", "LEFT", "DOWN", "UP"])(
  "pairs label dummies with matching long-edge dummies (flat seed 19 %s)",
  async (direction) => {
    const input = flatFixture(19, direction);
    const native = score(await new NativeELK().layout(structuredClone(input)), input);
    const elk = score(
      (await new OracleELK().layout(structuredClone(input) as never)) as ElkNode,
      input,
    );
    expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
      Object.fromEntries(HARD.map((key) => [key, 0])),
    );
    expect(native.bends).toBeLessThanOrEqual(elk.bends);
    expect(compare(native, elk).status).not.toBe("LOSS");
  },
  30000,
);
