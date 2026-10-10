import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { readReport } from "../scripts/parity/read-report.mjs";
import { HARD, score } from "../scripts/parity/quality-gate";

// A center label stays on the shallowest segment of an edge crossing into
// compounds, as in ELK, so nested scopes get no label dummies of their own;
// those added layers (options #11, #31: an extra jog) and steered the sweeps
// away from ELK's orders (complex #18: 46 crossings, ELK 36).
it.each([
  ["complex", 18, { edgeCrossings: 34, edgeOverlapLength: 0 }],
  ["options", 11, { edgeCrossings: 3, edgeOverlapLength: 467 }],
  ["options", 31, { edgeCrossings: 0, edgeOverlapLength: 253 }],
] as const)(
  "keeps center labels on the shallowest hierarchy segment (%s #%i)",
  async (corpus, index, bounds) => {
    const { input } = (
      readReport(`docs/heuristics/quality-corpus/${corpus}.json.gz`) as {
        rows: Array<{ input: ElkNode }>;
      }
    ).rows[index]!;
    const native = score(await new NativeELK().layout(structuredClone(input)), input);
    expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
      Object.fromEntries(HARD.map((key) => [key, 0])),
    );
    expect(native.edgeCrossings).toBeLessThanOrEqual(bounds.edgeCrossings);
    expect(native.edgeOverlapLength).toBeLessThanOrEqual(bounds.edgeOverlapLength + 1e-6);
  },
  60000,
);
