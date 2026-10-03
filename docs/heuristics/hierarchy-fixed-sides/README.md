# Hierarchy boundary-side diagnostic

Native preparation left synthetic compound ports FREE. Real ELK's compound preprocessor sets their owning nodes to FIXED_SIDE after introducing external dummies, including nodes with authored constraints. The delegating [worker trace](./worker-phases.json) records that state on all six compounds in complex seed 1 RIGHT. A fresh unobserved oracle run is byte-identical: [observer proof](./observer-proof.json).

This directory preserves the first trial, which changed only the default FREE constraint to FIXED_SIDE. It reduces complex-corpus differing values 61,058→58,243, retains 20/100 matches, and produces no exceptions. However it loses 15 complete LEFT-direction matches across the original directional corpora. These are retained in [original corpus deltas](./delta.json); [complex deltas](./complex-delta.json) preserve every changed complex row. This trial is not the final implementation.

The losses expose a second issue: native fixed-side port sorting uses physical compass sides, whereas ELK sorts after direction normalization. Canonical-side sorting restores all fifteen targeted matches: [failing trial](./canonical-sort-red.json), [corrected run](./canonical-sort-after.json).

A new 48-case strict complete-geometry matrix covers three patterns (explicit leaf ports, feedback edges, parallel edges), four directions, and default/FREE/FIXED_ORDER/FIXED_POS compound constraints. The original implementation passes 4 and fails 44; the faithful override plus canonical sort passes 26 and fails 22. All assertions and remaining failures are retained: [before](./regression-red.json), [after](./regression-after.json). The 22 gaps concern vertical route bends and stronger authored constraints. [Small RIGHT fixtures and outputs](./minimal-results.json) preserve the first minimization.

The final implementation applies FIXED_SIDE only when actual hierarchy crossings introduce boundary ports, restores authored metadata on the public graph, and sorts ports in canonical direction. Its independent broad replay and final validation live in [the final proof directory](../hierarchy-boundary-port-sides/README.md). Parity remains incomplete.

<!-- diagnostic commands from test/oracle-hierarchy-fixed-sides.test.ts, test/oracle-hierarchy-canonical-port-sort.test.ts and scripts/parity/trace-compound-worker.mjs -->

```sh
pnpm exec vitest run --dir test test/oracle-hierarchy-fixed-sides.test.ts test/oracle-hierarchy-canonical-port-sort.test.ts
node scripts/parity/trace-compound-worker.mjs docs/heuristics/nested-placement-bounds/complex-report.json .scratch/hierarchy-side-worker.json 0
```
