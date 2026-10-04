# Native routing repair

Matching Stately before/after views of corpus graphs 1 (flat), 7 (nested),
and 10 (dense hierarchy). Each pair keeps its input, seed, direction,
node/label dimensions, shared scale, and viewport. Compound positions may
change when incorrectly enlarged port geometry is corrected.

Before: origin/main at `81363b469e857650527548a5bd356c98727f378e`.
After: this branch, generated with `scripts/generate-heuristic-corpus.mjs`.

All ten input fixtures now pass checks for orthogonality, leaf-node interior
intersections, collinear self-retracing outside shared terminals, and blocked
or budget-exhausted routes. Dense graphs retain crossings and some shared
tracks; these remain aesthetic optimization work.

| Graph  | Before                         | After                        |
| ------ | ------------------------------ | ---------------------------- |
| Flat   | ![Before](graph-1-before.svg)  | ![After](graph-1-after.svg)  |
| Nested | ![Before](graph-7-before.svg)  | ![After](graph-7-after.svg)  |
| Dense  | ![Before](graph-10-before.svg) | ![After](graph-10-after.svg) |

## Fresh-seed regressions

Before: frozen baseline `f8c11d5`. After: `719ccfa642bae891ce1b95ff620e15c5885db5e9`. These cropped pairs preserve the same input, dimensions, direction, scale, and viewport. Full 30-graph metrics: [routing repair report](../../heuristics/after-routing-repair.md).

| Seed / graph | Defect                              | Before                                 | After                                |
| ------------ | ----------------------------------- | -------------------------------------- | ------------------------------------ |
| 20261102 / 2 | Label collision                     | ![Before](fresh-20261102-2-before.svg) | ![After](fresh-20261102-2-after.svg) |
| 20261102 / 7 | E12 loop crosses N6                 | ![Before](fresh-20261102-7-before.svg) | ![After](fresh-20261102-7-after.svg) |
| 20261102 / 9 | E31 short-gap retracing             | ![Before](fresh-20261102-9-before.svg) | ![After](fresh-20261102-9-after.svg) |
| 20261203 / 9 | E23 fractional-coordinate retracing | ![Before](fresh-20261203-9-before.svg) | ![After](fresh-20261203-9-after.svg) |
