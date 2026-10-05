# Compound greedy switch

ELK leaves greedy switching off by default for INCLUDE_CHILDREN layouts (`greedySwitchHierarchical.type = OFF`). Native now defaults it to TWO_SIDED, which only accepts strict reductions in counted crossings. An explicit option still wins.

Options seed 3 RIGHT goes from 5 crossings to 2 (ELK 4), and complex seed 13 RIGHT from 259 to 246 (ELK 249).

|                             | Corpus (1,280) | Holdout (2,800) |
| --------------------------- | -------------- | --------------- |
| LOSS                        | 51 → 35        | 240 → 198       |
| WIN                         | 299 → 336      | 747 → 897       |
| Native hard-violation cases | 0 → 0          | 8 → 8           |
| WIN/TIE → LOSS              | 0              | 8               |
| New hard violations         | 0              | 0               |

Holdout soft totals versus ELK are now at or below ELK for crossings (51,932 vs 53,601), edge overlap and bends (157,931 vs 158,003). Route length and area remain above ELK.

Accepted after a decision with David (2026-10-05): hold until no new hard violations, then accept despite the soft regressions. An earlier attempt added a holdout node hit; the [nested route container](../quality-nested-route-container/README.md) fix removed it. On 1,689 diagnostic compound, compound-options and directional cases: 2 regressions, 0 new hard violations. Regressed holdout seeds, to revisit:

- complex-compound 1006 LEFT: WIN → LOSS, crossings.
- complex-compound 1052 DOWN and UP: TIE → LOSS, crossings.
- complex-compound 1080 DOWN and UP: TIE → LOSS, route length.
- compound-options 1030 UP: TIE → LOSS, crossings.
- directional-compaction 1091 RIGHT and LEFT: TIE → LOSS, route length.

`ONE_SIDED` hangs on some compound graphs (options seed 3 RIGHT). That bug is tracked separately.

Gate elapsed: 216 s corpus, 410 s holdout. This changes compound crossing orders, so 16 more exact-geometry oracle tests now conflict (69 cumulative): [conflicting-oracle-tests.txt](conflicting-oracle-tests.txt).

```sh
pnpm exec vitest run --dir test test/quality-compound-greedy-switch.test.ts --maxWorkers=1
```
