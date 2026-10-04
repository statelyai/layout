# Compaction scanline hitbox bounds

ELK enlarges segment hitboxes for each scanline sweep, then restores spacing with the opposite sign. The 0.01 tolerance stays positive during restoration, leaving a residual hitbox extent. Native previously used disposable enlarged copies, so later sweeps and final graph bounds lost that extent. This also changed some flat compaction constraints.

Native now retains separate mutable hitboxes through segment, node and grouped sweeps. Graph normalization uses their measured bounds while authored node dimensions and route anchors retain their geometry. Long-edge joining carries the compaction bounds back to the original placement. The adapter's approximate trailing-edge allowance remains only for compaction paths without measured bounds.

Twenty strict hierarchy regressions cover random seeds 6, 11, 13, 22 and 23 across four directions: baseline `8257b8f` **0/20**, current **20/20**. All 120 focused bounds, directional-compaction, port-margin and long-edge checks pass. The [fixture gallery](fixtures/index.html) preserves all thirty newly matching graphs, including ten flat graphs; the [matching image](before-after.png) uses identical input, direction, dimensions, scale and viewport. Real ELK phase evidence shows hierarchy seed 6's graph height changes from 215 to 215.04 during horizontal compaction, without changing node coordinates in that phase.

The unchanged directional option gate improves **92 to 122/200**: hierarchy **100/100**, flat **22/100**. Differences decrease 13,777 to 11,887. No complete matches lost; zero native errors. The same six real ELK errors remain included. [Random gallery](index.html), `before.json` and `report.json` preserve complete inputs, outputs, errors and differences at tolerance 5e-13. Broad parity remains incomplete.

Original gates remain unchanged: hierarchy **100/100**, fixed-port loops **100/100**, flat **32/100** (10,614 differences), all with zero engine errors. Reports remain in `original-*.json`.

```sh
pnpm exec vitest run test/oracle-compaction-hitbox-bounds.test.ts --maxWorkers=2 --exclude '.scratch/**'
pnpm exec tsx scripts/check-directional-compaction-parity.ts
```

The broad gate remains nonzero. Production stays native; real elkjs remains a development oracle.

Full suite: **2,403 passed / 106 failed / 2,509**. No introduced or resolved failures relative to `8257b8f`; all twenty new tests pass. Complete results and deltas remain in `full-suite.json` and `validation.json`. Source/repository types, selected format/lint and package build pass.
