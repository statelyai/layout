# Compound route joins

When an edge crosses compound boundaries, the facade joins the route pieces from each scope. The child's and parent's boundary anchors can disagree on both axes. Complex seed 5 LEFT: `e16` leaves `g3`, and the joined route went straight from `n16`'s port to the parent piece's first bend, a diagonal.

`joinCompoundRouteSegments` now inserts an elbow at any diagonal joint. The elbow is collinear with the neighboring segment, so the join adds no bend beyond the one the misalignment requires.

|                             | Corpus (1,280) | Holdout (2,800) |
| --------------------------- | -------------- | --------------- |
| LOSS                        | 72 → 71        | 274 → 269       |
| Native hard-violation cases | 1 → **0**      | 27 → 20         |
| WIN/TIE → LOSS              | 0              | 0               |
| New hard violations         | 0              | 0               |

The corpus now has no native hard violations. Gate elapsed: 220 s corpus, 420 s holdout.

```sh
pnpm exec vitest run --dir test test/quality-compound-joins.test.ts --maxWorkers=1
```
