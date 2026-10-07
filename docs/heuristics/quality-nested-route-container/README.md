# Nested route container

An edge from a compound node's own port to one of its children is routed inside that compound. Options seed 406: `e12` runs from `g1`'s port to `n2` inside `g1`, so its points are relative to `g1`. When the facade copied the route out of `g0`'s temporary scope, it reported `g0` as the edge's container. Consumers then drew the route shifted by `g1`'s offset, through other nodes, in all four directions. ELK reports `g1`.

The facade now keeps the container that the nested scope reported for the route.

|                             | Corpus (1,280) | Holdout (2,800) | Diagnostic options 301–500 (800) |
| --------------------------- | -------------- | --------------- | -------------------------------- |
| LOSS                        | 51 → 51        | 245 → 240       | 194 → 181                        |
| Native hard-violation cases | 0 → 0          | 20 → 8          | 23 → 7                           |
| WIN/TIE → LOSS              | 0              | 0               | 0                                |
| New hard violations         | 0              | 0               | 0                                |

Gate elapsed: 216 s corpus, 422 s holdout.

```sh
pnpm exec vitest run --dir test test/quality-nested-route-container.test.ts --maxWorkers=1
```
