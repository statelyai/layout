# Preserve segment bends after compaction

Native long-edge joining simplified every joined orthogonal point. ELK's LongEdgeJoiner concatenates segment bend lists, then its compactor moves their coordinates without removing bends. Simplifying afterward removed original bends, including short retraced sections when routing tracks collapse. Native joining now removes redundant dummy anchors alone, retains anchors required for real corners, and preserves original segment bends. SPLINES and POLYLINE behavior remains unchanged.

Twelve full-geometry comparisons cover six previously failing hierarchy cases, four newly matching flat cases, and two flat corner guards. Before d01aca5: 2/12; current: 12/12. The archived red run retains ten failures. [Fixture gallery](fixtures/index.html) and [matching image](before-after.png) show identical inputs/dimensions/scale with full original routes. Retained short retraced sections also occur in real ELK; this establishes bend-sequence compatibility, not an aesthetic improvement. `worker-phases.json` preserves real ELK's router → long-edge joiner → compactor sequence for hierarchy seed 10.

The unchanged 200-graph gate improves **64 to 74/200** full matches: flat 8 to 12/100, hierarchy 56 to 62/100. No complete matches lost. Zero native errors; the same six real ELK errors remain included. Differing values: 14,620 before, 14,619 current; some still-failing graphs have more differences, all preserved. [Random gallery](index.html), `before.json` and `report.json` retain all inputs/outputs/errors/differences at tolerance 5e-13. Broad parity remains incomplete.

Full suite: **2,347 passed / 106 failed / 2,453**. Twelve new tests pass; no failures introduced or resolved relative to d01aca5. Complete suite and delta remain in `full-suite.json` and `validation.json`. Source/repository types, selected format/lint and package build pass.

Original gates rerun: flat 32/100 (10,625 differences), hierarchy 72/100 (832), fixed-port loops 100/100 (zero differences). Zero engine errors and no complete matches lost; results remain in `original-*.json`.

```sh
pnpm exec vitest run test/oracle-long-edge-compaction-joining.test.ts --maxWorkers=2 --exclude '.scratch/**'
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/directional-parity/report.json
```

The random gate still exits nonzero. Production remains native; real elkjs is used only as the development oracle.
