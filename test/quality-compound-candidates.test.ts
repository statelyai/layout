import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import { isBetterLayout, measureLayout } from "../src/elkjs/layout-quality";
import { compoundOptionsFixture } from "../scripts/parity/compound-options-corpus";
import { HARD, score } from "../scripts/parity/quality-gate";

// Above ELK's default thoroughness, compound layouts try two more random
// seeds and keep the best measured layout. The result is never worse than
// the plain default.
it.each([
  [12, "RIGHT"],
  [18, "RIGHT"],
  [13, "LEFT"],
])(
  "keeps the best compound candidate (options seed %i %s)",
  async (seed, direction) => {
    const input = compoundOptionsFixture(seed, direction);
    const chosen = await new NativeELK().layout(structuredClone(input), {
      layoutOptions: { "elk.layered.thoroughness": "10" },
    });
    const plain = await new NativeELK().layout(structuredClone(input), {
      layoutOptions: {
        "elk.layered.crossingMinimization.greedySwitchHierarchical.type": "TWO_SIDED",
      },
    });
    expect(isBetterLayout(measureLayout(plain), measureLayout(chosen))).toBe(false);
    const native = score(chosen, input);
    expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
      Object.fromEntries(HARD.map((key) => [key, 0])),
    );
    expect(native.edgeOverlapLength).toBeLessThan(score(plain, input).edgeOverlapLength);
  },
  60000,
);

// At the default thoroughness a defect-free compound layout is laid out once.
it("lays out a defect-free compound graph once by default (options seed 12 RIGHT)", async () => {
  const input = compoundOptionsFixture(12, "RIGHT");
  const chosen = await new NativeELK().layout(structuredClone(input));
  const plain = await new NativeELK().layout(structuredClone(input), {
    layoutOptions: {
      "elk.layered.crossingMinimization.greedySwitchHierarchical.type": "TWO_SIDED",
    },
  });
  expect(measureLayout(chosen).defects).toBe(0);
  expect(chosen).toEqual(plain);
}, 60000);
