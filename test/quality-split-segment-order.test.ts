import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { readReport } from "../scripts/parity/read-report.mjs";
import { score } from "../scripts/parity/quality-gate";

// ELK splits a segment whose dependencies form a critical cycle: the half
// holding the source end runs nearer the source layer. A route starts on the
// half holding its graph source, which in UP and LEFT is the mirrored slot;
// swapping the halves runs both along the crossing edge.
it("keeps the source half of a split segment near the source layer (fresh #89, UP)", async () => {
  const { input } = (
    readReport("docs/heuristics/quality-corpus/fresh.json.gz") as {
      rows: Array<{ input: ElkNode }>;
    }
  ).rows[89]!;
  const native = score(await new NativeELK().layout(structuredClone(input)), input);
  expect(native.edgeOverlapLength).toBe(0);
}, 60000);
