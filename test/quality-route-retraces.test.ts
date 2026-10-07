import OracleELK from "elkjs/lib/elk.bundled.js";
import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { flatFixture } from "../scripts/parity/flat-corpus";
import { compare, HARD, score } from "../scripts/parity/quality-gate";

const cases: Array<[string, () => ElkNode]> = [
  // A self loop on one port closes a square instead of an out-and-back spike.
  ["same-port self loop (flat seed 8 RIGHT)", () => flatFixture(8, "RIGHT")],
  // Post-compaction can leave a route doubling back along one line.
  [
    "post-compaction spur (flat seed 42 UP, RIGHT compaction)",
    () => {
      const input = flatFixture(42, "UP");
      input.layoutOptions = {
        ...input.layoutOptions,
        "elk.layered.compaction.postCompaction.strategy": "RIGHT",
      };
      return input;
    },
  ],
];

it.each(cases)(
  "routes without retracing: %s",
  async (_, fixture) => {
    const input = fixture();
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
  },
  30000,
);
