import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { complexCompoundFixture } from "../scripts/parity/complex-compound-corpus";
import { readReport } from "../scripts/parity/read-report.mjs";
import { HARD, score } from "../scripts/parity/quality-gate";

const clean = (metrics: Record<string, number>) =>
  expect(Object.fromEntries(HARD.map((key) => [key, metrics[key]]))).toEqual(
    Object.fromEntries(HARD.map((key) => [key, 0])),
  );

// ELK sweeps a child graph on its own when its random paths outweigh its
// hierarchical ones, judging a node by which port sides carry edges. Judged
// by edge direction, compound g0 here was swept top-down: 38 crossings, ELK 25.
it("decides bottom-up child sweeps by port sides (complex-compound seed 2003)", async () => {
  const input = complexCompoundFixture(2003, "RIGHT");
  const native = score(await new NativeELK().layout(structuredClone(input)), input);
  clean(native);
  expect(native.edgeCrossings).toBeLessThanOrEqual(25);
}, 60000);

// Edges on declared ports start in their ports' order, as ELK lists ports.
// Two boundary ports of a compound tie on one target port; ordered by edge
// declaration they swapped and doubled the shared track (74 -> 138).
it("starts edges on declared ports in port order (holdout compound-options #223)", async () => {
  const { input } = (
    readReport("docs/heuristics/quality-holdout/compound-options.json.gz") as {
      rows: Array<{ input: ElkNode }>;
    }
  ).rows[223]!;
  const native = score(await new NativeELK().layout(structuredClone(input)), input);
  clean(native);
  expect(native.edgeOverlapLength).toBeLessThanOrEqual(74 + 1e-6);
}, 60000);
