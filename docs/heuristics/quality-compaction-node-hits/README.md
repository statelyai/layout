# Compaction node hits

ELK's post-compaction (LEFT, RIGHT and both locking strategies) can move a node across the channel of its own route. Flat seed 1 RIGHT with LEFT compaction: `n14` moves left past the vertical segments of `e15` and `e23`, and ELK routes both through `n14`.

Post-compaction is an optimization. The elkjs facade now checks the final layout. When compaction routes an edge through a leaf node, it lays the graph out again without post-compaction and keeps whichever result has fewer node hits. Graphs without post-compaction, and compacted layouts without hits, are unchanged.

|                             | Corpus (1,280) | Holdout (2,800, all five generators) |
| --------------------------- | -------------- | ------------------------------------ |
| LOSS                        | 96 → 96        | 335 → 328                            |
| WIN                         | 232 → 274      | 599 → 665                            |
| Native hard-violation cases | 85 → 39        | 242 → 168                            |
| WIN/TIE → LOSS              | 0              | 0                                    |
| New hard violations         | 0              | 0                                    |

Gate elapsed: 237 s corpus, 517 s holdout. The holdout now includes complex-compound seeds 1001–1100; its baseline was scored at `98186fb` before this change.

A pipeline-internal version of the check, counting hits on routes before long-edge joining, gave false positives (helper dummies sit inside nodes before joining) and turned 29 corpus TIEs into LOSSes. It was not kept.

Exact-geometry oracle tests that conflict with the quality changes so far: [conflicting-oracle-tests.txt](https://github.com/statelyai/layout/blob/heuristics-evidence/docs/heuristics/quality-compaction-node-hits/conflicting-oracle-tests.txt) (53, cumulative).

```sh
pnpm exec vitest run --dir test test/quality-compaction-node-hits.test.ts --maxWorkers=1
```
