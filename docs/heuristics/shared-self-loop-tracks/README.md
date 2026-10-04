# Shared self-loop tracks

After the merged dummy port fix, flat seed 13 RIGHT still placed every layer from layer 2 ten units late. Routing slots now matched ELK in every gap; the extra space came from `n10`'s east margin. `n10` has two self loops from north port `p0` to east port `p1`. ELK routes both on one track at x 250. Native gave each loop its own track (x 250 and 260), widening the layer.

ELK's self-loop preprocessing combines loops that share a port into one self hyperloop, which routes on a single track. Native assigned a track per loop in authored order, both when reserving loop envelopes and when routing. `selfLoopTracks` now assigns one track per group of loops connected through shared ports, in order of each group's first loop, and both paths use it. Seed 13 RIGHT falls from 216 to 11 differences; the remainder lies elsewhere.

This uses group order for distinct hyperloops. ELK assigns their slots through its own crossing-based ordering, which is not yet modelled.

Complete 1,280-case replay: **716 → 724 exact**, **85,172 → 82,705 differing values**, zero native errors, 217 retained oracle errors. **8 gained, zero lost.** 28 outputs reduce differences; 1 increases ([audit](audit.json)). Routes 67,824 → 65,821; junctions 9,229 → 8,939; nodes/hierarchy 5,876 → 5,732; root size 463 → 433. Complex differences rise 57,417 → 57,449. Replay elapsed, eight parallel processes: 445 s. Reports are rebased onto the merged dummy evidence with `scripts/parity/rebase-report.mjs`.

The regression covers flat seeds 7 DOWN and 7 UP and compound-options seed 10 DOWN; all fail before and pass after. Full suite: **3,298 passed, 109 retained failures, 3,407 total**; zero new failures ([delta](full-test-delta.json)). Types, repository types, changed-file lint and format, build and the demo corpus pass. This is not overall parity.

```sh
pnpm exec vitest run --dir test test/oracle-shared-self-loop-tracks.test.ts --maxWorkers=1
```
