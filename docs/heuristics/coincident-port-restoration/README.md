# Coincident cross-port endpoint restoration

The orthogonal router can collapse two coincident physical endpoints to one coordinate. North/south port restoration treated that coordinate as only the face being reconnected: slicing it away also consumed the opposite endpoint. Later compound-boundary transfer moved the wrong terminal point, producing diagonal segments.

Restoration now expands a collapsed route to two endpoint coordinates before reconnecting either face. This preserves endpoint identity while leaving routing and boundary-transfer algorithms intact. No bend-repair heuristic, input-specific branch or weaker assertion was added.

The [native phase snapshot](./native-before-restoration.json) records single-point input/output routes before restoration. The delegating [real ELK route trace](./worker-edge-phases.json) shows its north/south postprocessor retaining the terminal bend and opposite anchor. The trace adds optional route observations to the existing worker observer; a fresh unobserved oracle run is byte-identical: [observer proof](./observer-proof.json).

Eight strengthened phase tests cover all directions and feedback reversal, preserving the opposite endpoint and input immutability for coincident source-only and two-face routes. All eight fail before and pass after; three unaffected phase tests also pass: [red](./regression-red.json), [after](./regression-after.json).

The unchanged strict 48-case hierarchy matrix improves **26→30 complete matches**. Its four default/FREE vertical-port cases now match real ELK exactly, including every node, port, route, junction and container field. Eighteen stronger-constraint failures remain active assertions. [Equal-scale minimized before/native/real comparison](./minimal-comparison/index.html#0) demonstrates the two diagonal segments disappearing with zero complete-geometry differences. [Browser proof](./minimal-comparison/comparison.png).

The original 1,100 retained random outputs are unchanged, retaining 608 exact matches, zero native exceptions and 213 oracle exceptions counted as failures. The 100 deeper inputs retain 20 complete matches and 57,938 differing values; six native outputs change without changing that count. Combined coverage remains **628/1,200 exact matches**, **99,176 differing values**, zero native exceptions and 213 oracle exceptions counted as failures. All changed outputs remain in [complex deltas](./complex-delta.json) and [the sparse report](./complex-report.json). On the deeper corpus, diagonal segments decrease **9→2**, while real ELK has zero: [segment observations](./diagonal-segments.json). The two remaining diagonals are both in seed 25 LEFT; this diagnostic does not replace the strict geometry gate.

Final full suite: **2,942 passed / 119 failed / 3,061 total**, fixing four prior strict ELK failures with no new failed names: [suite](./full-suite.json), [delta](./suite-delta.json). The initial contended run records one compaction timeout; its unchanged 32-case isolated check and final full rerun pass. That observation is retained in [the contended suite](./contention-suite.json), [its delta](./contention-suite-delta.json), and [the compaction recheck](./compaction-recheck.json). Assertions and time limits are unchanged. Source/repository types, selected lint/format and build pass with existing mixed-export warnings.

Parity remains incomplete. Next: remaining physical-port routing and compound helper constraints, followed by hierarchy label ownership and unseen random coverage.

<!-- diagnostic commands from test/north-south-port-expansion.test.ts, test/oracle-hierarchy-fixed-sides.test.ts and scripts/parity/trace-compound-worker.mjs -->

```sh
pnpm exec vitest run --dir test test/north-south-port-expansion.test.ts test/oracle-hierarchy-fixed-sides.test.ts
node scripts/parity/trace-compound-worker.mjs docs/heuristics/coincident-port-restoration/minimal-comparison/report.json .scratch/vertical-worker.json 0 --routes
pnpm exec vitest run --dir test --maxWorkers=4
```
