# Measured helper cross-axis bounds

Parity remains incomplete. Native bounds normalization discarded helper-node geometry, then added a pixel to outer route points. ELK's layer-size calculator instead measures the last node of each ordered layer, including its actual size and trailing margin. Ordinary long-edge dummies have edge thickness; north/south port helpers have zero cross-axis size. Treating both alike made root bounds too large.

Native Brandes-Koepf placement now retains that measured cross-axis maximum before helper restoration removes the nodes. The ELK-compatible adapter unions this extent with authored node, port, label and route bounds. Other node placers retain their existing allowance. Post-compaction bounds retain precedence. Changed geometry is limited to root width/height and one nested container height; leaf-node, port, label, route-section and junction geometry is unchanged.

[Real worker phases](./worker-phases.json) preserve seed 38 DOWN: canonical graph height 385 after layer-size calculation, then public width 409 including padding. The outer helper is NORTH_SOUTH_PORT with zero size. Previously native returned 410. Every other geometry field already matched; complete geometry now matches.

Across **1,100 retained random inputs**, exact matches rise **601 → 608** and differing values fall **40,992 → 40,983**. No complete matches lost, no rows worsen, no native exceptions. All 213 retained oracle exceptions remain failures. [Complete deltas](./delta.json) and sparse reports retain every input, output and failure through baseline references.

| Corpus | Exact matches | Differing values |
| --- | ---: | ---: |
| Model seeds 1–25 | 59/200 | 4,374 |
| Model seeds 26–50 | 56/200 | 5,075 |
| Default flat | 54/100 | 7,169 |
| Directional flat/hierarchy | 146/200 | 8,513 |
| Expanded flat/hierarchy | 150/200 | 9,087 |
| Fresh directional flat/hierarchy | 143/200 | 6,765 |

Seven complete-geometry regressions rerun both native and real elkjs 0.11.1: model-order seeds 22 DOWN, 36 RIGHT/LEFT, 38 DOWN; default seed 22 DOWN; and hierarchical seed 62 RIGHT/LEFT with RIGHT compaction. All seven fail before and pass after. [Red](./regression-red.json), [green including 19 junction regressions](./regression-green.json). The broad replay reruns native against pinned saved real outputs/errors.

[Equal-scale before/native/real gallery](./index.html#71) covers all 200 first-range cases. [Browser proof](./comparison.png) verifies seed 22 DOWN. Full existing suite: **2,874 passed / 101 unchanged failures / 2,975 total**, before adding these seven regressions; [suite](./full-suite.json), [failure-name comparison](./suite-delta.json). Source/repository types and build pass, with existing mixed-export warnings.

<!-- diagnostic commands from scripts/parity/trace-routing-worker.mjs and test/oracle-placement-cross-bounds.test.ts -->

Reproduce:

```sh
pnpm exec vitest run --dir test test/oracle-placement-cross-bounds.test.ts
node scripts/parity/trace-routing-worker.mjs docs/heuristics/measured-cross-bounds/fresh-report.json .scratch/bounds-worker.json 62
```

Next: physical port/routing preparation and hierarchy phase differences. The full parity goal remains active; these bounds gains do not establish parity.
