import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import { complexCompoundFixture } from "../scripts/parity/complex-compound-corpus";
import { HARD, score } from "../scripts/parity/quality-gate";

// e16 leaves g3 and enters g4; the child and parent boundary anchors differed
// on both axes, so the joined route started with a diagonal.
it.each([
  [5, "LEFT"],
  [201, "RIGHT"],
  [217, "LEFT"],
])(
  "joins compound route pieces orthogonally (complex seed %i %s)",
  async (seed, direction) => {
    const input = complexCompoundFixture(seed, direction);
    const native = score(await new NativeELK().layout(structuredClone(input)), input);
    expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
      Object.fromEntries(HARD.map((key) => [key, 0])),
    );
  },
  60000,
);
