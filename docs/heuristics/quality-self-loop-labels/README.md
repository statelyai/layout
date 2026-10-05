# Self-loop labels

A self-loop label without a dedicated placement rule fell back to the route midpoint. Options seed 12: `e5` loops on `n1` with a five-point route, and its midpoint lies on the segment beside `n1`, so the label covered the node in all four directions.

When that midpoint placement would cover the loop's own node, the label now sits beside one of the loop's segments, longest first, on the side away from the node. It takes the first spot that is clear of every node and every other route. A first version used only the longest segment and placed labels on other edges (one corpus and two holdout edge-label hits). It was not kept.

|                             | Corpus (1,280) | Holdout (2,800) |
| --------------------------- | -------------- | --------------- |
| LOSS                        | 74 → 72        | 279 → 276       |
| Native hard-violation cases | 6 → 2          | 43 → 38         |
| WIN/TIE → LOSS              | 0              | 0               |
| New hard violations         | 0              | 0               |

Gate elapsed: 220 s corpus, 514 s holdout. The conflicting exact-geometry oracle tests are unchanged (53).

```sh
pnpm exec vitest run --dir test test/quality-self-loop-labels.test.ts --maxWorkers=1
```

## Route clearance

The first rule moved a label only when it covered its own node. Same-port loops now route as squares, so their midpoint labels can also land on another edge. Options seed 204 RIGHT is an example: the label of the loop `e2` sat on `e0`. A self-loop label now moves whenever its default spot covers any node or another route.

|                                     | Corpus  | Holdout   |
| ----------------------------------- | ------- | --------- |
| Native hard-violation cases         | 1 → 1   | 30 → 27   |
| LOSS                                | 72 → 72 | 275 → 274 |
| WIN/TIE → LOSS, new hard violations | 0, 0    | 0, 0      |

Gate elapsed: 218 s corpus, 414 s holdout ([gate](route-clearance/gate.json), [holdout](route-clearance/holdout-gate.json)). Two diagnostic label hits remain where a root-level edge shares the loop's port and its route changes when the facade joins hierarchy pieces after placement.
