# Physical port margins

BK previously reserved movable loop envelopes but omitted protruding physical port boxes from cross-axis node margins. Final padding normalization could move ports inside graph bounds, but could not restore the missing separation between neighboring nodes.

Port boxes now contribute their full before/after extents before alignment and compaction. Their margins combine with loop envelopes by maximum extent. Recursive compaction, class separation, deferred straightening, order feasibility, layout bounds and normalization share those margins. The port boxes include unused ports, matching real ELK's node-margin calculation.

All 24 focused complete-geometry fixtures match elkjs 0.11.1: 4/8/12-pixel protrusions before/after nodes in all four directions. Archived b723c67 passes 12/fails 12; current passes all 24. Original NORTH/SOUTH port-side option tests also now pass. Final full suite: 2,231 passed, 106 failures, with no introduced failures compared by file and full test name. Assertions remain unchanged.

Unchanged random gates: flat 32/100 (10,896 differing values, down from 11,070); hierarchy 72/100 (832); fixed loops 100/100. Zero engine errors and no previously complete matches lost. Source/repository types, selected format/lint and package build pass. The 12-pixel after-margin RIGHT fixture was browser-inspected at equal scale against real ELK.

`report.json` preserves every random flat input, both engine geometries and differences. `fixtures/` preserves all focused inputs and before/current/oracle outputs; `red.json`/`green.json` preserve archived/current test results. `worker-phases.json` observes ELK for random seed 2, including its BK node margins. This change reserves port rectangles; fixed-loop and label envelopes and remaining north/south ordering still need parity work.

```sh
pnpm exec vitest run test/oracle-port-margins.test.ts --maxWorkers=2
pnpm test:parity:flat
pnpm test:parity:compound
pnpm test:parity:self-loops
```

Broad parity remains incomplete. Original failed inputs and assertions remain preserved.
