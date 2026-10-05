# North/south port units

Forced node model order can place another node between a node and its north/south port dummies. Both engines then route the port's edges through that node. Flat seed 7 RIGHT with forced model order: `n0` lands between `n3` and `n3`'s northern dummies, and `n3`'s north-port edges cross `n0`.

After crossing minimization, native now rejoins each such unit. The intervening nodes either stay on their side of the owner or pass it. It keeps whichever arrangement has fewer layer crossings and never separates another node from its own dummies.

|                             | Corpus (1,280) | Holdout (2,800) | Diagnostic model-order 401–600 (1,600) |
| --------------------------- | -------------- | --------------- | -------------------------------------- |
| LOSS                        | 78 → 74        | 284 → 279       | 55 → 44                                |
| Native hard-violation cases | 20 → 6         | 86 → 43         | 78 → 0                                 |
| WIN/TIE → LOSS              | 0              | 1               | 0                                      |
| New hard violations         | 0              | 0               | 0                                      |

Two more diagnostic ranges, model-order 201–230 and 301–400, also had zero regressions. Accepted under the net-gain tolerance, counting removed hard violations as fixes (decided 2026-10-04). Regressed holdout seed, to revisit: model-order 1037 RIGHT, TIE → LOSS on edge crossings (7 → 10).

Gate elapsed: 260 s corpus, 506 s holdout. Conflicting exact-geometry oracle tests (cumulative, 53): [conflicting-oracle-tests.txt](conflicting-oracle-tests.txt).

```sh
pnpm exec vitest run --dir test test/quality-north-south-units.test.ts --maxWorkers=1
```
