import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import { compoundOptionsFixture } from "../scripts/parity/compound-options-corpus";
import { HARD, score } from "../scripts/parity/quality-gate";

// e12 runs from g1's own port to its child n2. Its route is computed in g1's
// frame; reporting g0 as its container shifted it through other nodes.
it.each(["RIGHT", "LEFT", "DOWN", "UP"])(
  "reports a nested route's own container (options seed 406 %s)",
  async (direction) => {
    const input = compoundOptionsFixture(406, direction);
    const native = score(await new NativeELK().layout(structuredClone(input)), input);
    expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
      Object.fromEntries(HARD.map((key) => [key, 0])),
    );
  },
  30000,
);
