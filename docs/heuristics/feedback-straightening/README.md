# Feedback straightening

Deferred BK straightening selected incoming/outgoing edges using model direction. Cycle-reversed feedback segments keep that direction in the native graph; alignment and compaction instead follow layer direction. Selection could therefore choose a neighbor on the wrong side. Seed 1 DOWN/UP had correctly placed normal nodes but a long-edge dummy offset and unnecessary detour.

Selection now follows layer direction. Eight previously failing random cases completely match real ELK: seed 6 in all directions, and seeds 1/21 DOWN/UP. Original inputs and 5e-13 geometry assertions are unchanged; no previous complete flat match lost. Hierarchy remains 72/100.

`worker-phases.json` observes real elkjs 0.11.1 for seed 1 DOWN. `red.json` runs the eight complete-geometry regressions against archived a3758d0; `green.json` runs current source. `report.json` preserves all 100 flat inputs, both engine outputs and all differences. `index.html` compares prior native, current native and real ELK at equal scale.

```sh
pnpm exec vitest run test/oracle-feedback-straightening.test.ts --maxWorkers=2
pnpm test:parity:flat
pnpm test:parity:compound
node scripts/parity/trace-routing-worker.mjs docs/heuristics/routing-coordinate-phase/report.json .scratch/seed-1-down-worker.json 50
```

Broad parity remains incomplete. Remaining random inputs and original failing assertions stay preserved.
