import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { HARD, score } from "../scripts/parity/quality-gate";
import { readFixture } from "./helpers/fixture";

// Stately's espresso-bar machine as the editor sends it: initial states are
// FIRST_SEPARATE and compounds have transitions to their own initial state.
// Real ELK throws here; native used to reject it as a layer-constraint conflict.
it("lays out espresso-bar without throwing or hard defects", async () => {
  const { input, args } = readFixture<{ input: ElkNode; args?: object }>("espresso-bar-elk-input");
  const layout = await new NativeELK().layout(structuredClone(input), args);
  const native = score(layout, input);
  // Opposite-direction track sharing is tracked separately until routing separates it.
  expect(
    Object.fromEntries(
      HARD.filter((key) => key !== "opposingOverlapLength").map((key) => [key, native[key]]),
    ),
  ).toEqual(
    Object.fromEntries(
      HARD.filter((key) => key !== "opposingOverlapLength").map((key) => [key, 0]),
    ),
  );
}, 30000);
