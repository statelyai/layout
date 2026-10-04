# Long-edge splitter order

Earliest shared divergence: the initial crossing-minimization order. Read-only real ELK processor snapshots and native scope phases were compared for the 46 flat failures at `6629af0`. Cycle reversal and layering matched in 34; 26 diverged first at crossing minimization. Native already used ELK's port ranks and Random draws. It visited layer nodes in a different initial order.

Minimized case: flat seed 10 RIGHT, a plain DAG without ports, labels or cycles. ELK visits layer 7 as `n7, e11, e12, e8, e20`; native visited `n7, e8, e11, e12, e20`. Each ±0.035 barycenter perturbation landed on a different node. Equal port ranks (layer 2: `n2` and dummy `e19`, both 4) then broke differently, and the first backward sweep diverged. All four directions fail the same way.

ELK seeds crossing minimization with network-simplex component order. LongEdgeSplitter then appends each dummy to the next layer while visiting a layer's nodes, their authored ports and each port's outgoing edges. Reversal appends edges after retained ones. Native used authored node order plus dummies in edge-creation order. The elkjs facade also pre-sorted `FIXED_SIDE` ports by side, hiding the authored port order ELK uses at this point. Native now seeds the same traversal. The facade passes authored port indices to layered port settings.

Pre-sweep order now matches ELK in 66/80 comparable flat cases, up from 20. Twenty label-dummy cases were excluded as naming artifacts. Crossing-minimization-first divergences among HEAD's flat failures fall from 26 to 14 ([phase evidence](phase-divergence.json)).

Complete 1,280-case replay against frozen real ELK outputs: **648 → 680 exact**, **108,901 → 101,702 differing values**, zero native errors before and after, and 217 retained oracle errors. **32 gained, zero lost.** 99 outputs reduce differences; 28 increase them ([audit](audit.json)). Differences by geometry: routes 86,900 → 80,683; nodes/hierarchy 7,659 → 6,980; root size 609 → 546; junctions 11,613 → 11,464; labels 1,246 → 1,155; ports unchanged at 657.

| Corpus                  | Exact     | Differing values |
| ----------------------- | --------- | ---------------- |
| flat                    | 54 → 67   | 7,157 → 4,008    |
| directional 1–25        | 146 → 153 | 8,502 → 6,207    |
| expanded 26–50          | 154 → 158 | 9,063 → 8,157    |
| directional-fresh 51–75 | 149 → 156 | 6,699 → 6,307    |
| report 1–25             | 59 → 60   | 4,620 → 4,490    |
| fresh 26–50             | 56 → 56   | 5,061 → 5,051    |
| compound options        | 10 → 10   | 8,552 → 8,510    |
| complex                 | 20 → 20   | 59,247 → 58,972  |

HEAD baselines come from a fresh native replay at `6629af0`. All 1,180 ordinary and options outputs equaled the retained `reversed-junction-chains` reports. The newest complex replay was missing from that pause; [complex-head-report.json](complex-head-report.json) now holds it. Elapsed, eight parallel processes: 479 s at HEAD and 702 s after; the after run shared the CPU with the full suite.

The new regression covers seeds 10 RIGHT and 22 UP, which fail before. It also covers 22 LEFT, which fails with splitter order alone and passes once authored port order is restored. Full suite: **3,283 passed, 109 retained failures, 3,392 total**. File-qualified comparison shows zero new failures and three added passing regressions ([delta](full-test-delta.json)). Types, repository types, changed-file lint and format, build, the demo corpus and option mappings pass. Every failing row remains in the sparse reports. This is not overall parity.

Next: residual initial-order differences come from reversal history. EdgeAndLayerConstraintEdgeReverser reverses edges, then GreedyCycleBreaker reverses some again, which moves those edges to the end of the port's list. Flat seed 8 RIGHT shows this. Layering divergences (10 flat) and post-order placement/routing remain.

```sh
pnpm exec vitest run --dir test test/oracle-long-edge-splitter-order.test.ts --maxWorkers=1
pnpm exec tsx scripts/replay-native-compound-parity.ts docs/heuristics/reversed-junction-chains/flat-report.json .scratch/flat.json
```
