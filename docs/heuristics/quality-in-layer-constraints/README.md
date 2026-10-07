# In-layer constraints

With FIXED_SIDE or stricter port constraints, ELK replaces each hierarchical boundary port on a cross-axis side with one helper per layer. The helpers carry the IN_LAYER_CONSTRAINT of the original port (TOP for northern, BOTTOM for southern), and `InLayerConstraintProcessor` moves them to the start or end of their layer after crossing minimization. Native created the helpers but never applied the constraint.

Options seed 4 DOWN: the helper for `e9`'s exit through `g1`'s eastern boundary ended first in its layer, so the route from `n3` crossed `n4` to reach the boundary. Native now stably partitions each layer into TOP helpers, other nodes, then BOTTOM helpers.

|                             | Corpus (1,280) | Holdout (2,800) |
| --------------------------- | -------------- | --------------- |
| LOSS                        | 96 → 78        | 328 → 284       |
| WIN                         | 274 → 290      | 665 → 701       |
| Native hard-violation cases | 39 → 20        | 168 → 86        |
| WIN/TIE → LOSS              | 0              | 2               |
| New hard violations         | 0              | 0               |

Accepted under the net-gain tolerance (decided 2026-10-04): holdout regressions at most 0.1% of cases and outnumbered at least 10× by LOSS fixes (2 versus 46). Regressed holdout seeds, to revisit:

- compound-options 1068 UP: WIN → LOSS on bends.
- compound-options 1071 UP: WIN → LOSS on edge crossings.

Gate elapsed: 262 s corpus, 679 s holdout. Conflicting exact-geometry oracle tests (cumulative, 53): [conflicting-oracle-tests.txt](https://github.com/statelyai/layout/blob/heuristics-evidence/docs/heuristics/quality-in-layer-constraints/conflicting-oracle-tests.txt).

```sh
pnpm exec vitest run --dir test test/quality-in-layer-constraints.test.ts --maxWorkers=1
```
