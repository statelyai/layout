# Inverted-port model-order inheritance

Parity remains incomplete. Native inverted-port expansion created new edge segments without copying their original model-order values. Initial ordering and weighted comparisons then fell back to generated-edge indices. Real ELK's `InvertedPortProcessor` copies the original edge's properties onto each helper edge. Native now carries that same original order through source/target helpers, reversed edges and previously split long edges.

The existing expansion regressions now assert a nontrivial authored order (42) survives every segment for one-layer and three-layer reversed edges. Both cases fail before the fix and pass afterward: [red](./regression-red.txt), [green](./regression-green.txt). The worker observer now records initial node-comparator decisions without replacing their implementation: [seed 2 reference observations](./worker-phases.json).

Strict model-order seeds 1–25 remain **54/200** complete matches; differing values change **5,876 → 5,878**. Five incomplete rows improve and two worsen. Seeds 26–50 remain **39/200**; differences fall **9,320 → 9,147**. Three rows improve, four worsen, and one changes geometry with the same difference count. No complete match gained or lost; zero native exceptions. The 200 ELK hierarchy exceptions remain failures, not matches. This fixes metadata inheritance; it does not fix seed 2 RIGHT's remaining 32 route/junction differences.

Across all **1,100 preserved random inputs**, only those 15 model-order rows change native output. All earlier **700 default/directional flat and hierarchical outputs remain identical**, including routes and junctions. [All deltas](./delta.json), [current model report](./report.json), [fresh model report](./fresh-report.json). Reports reference complete baselines plus indexed updates, preserving every unchanged failure and every worsened row. Seeds 1–25 rerun both engines; the other 900 rerun native against their saved real ELK 0.11.1 outputs/errors.

[Equal-scale before/native/ELK gallery](./index.html) covers all 200 first-range inputs. Browser proof shows seed 17 UP improving from 58 to 44 differences; visible differences remain: [comparison](./comparison.png).

<!-- diagnostic commands from package.json and scripts/parity/trace-routing-worker.mjs -->

Reproduce:

```sh
pnpm exec tsx scripts/check-model-order-parity.ts .scratch/model-order.json 1 25
pnpm exec tsx scripts/check-model-order-parity.ts .scratch/model-order-fresh.json 26 50
pnpm exec vitest run --dir test test/inverted-port-expansion.test.ts test/oracle-random-model-order.test.ts test/oracle-model-order.test.ts test/oracle-ordered-inverted-boundary.test.ts --maxWorkers=4
node scripts/parity/trace-routing-worker.mjs docs/heuristics/inverted-port-model-order/report.json .scratch/model-order-worker.json 1
```

Next: align helper comparator decisions, original physical port preparation and initial sorting before north/south helper insertion. The broader hierarchy, option, geometry and aesthetic parity requirements remain open; all earlier regressions remain preserved.

Validation: **71/71 focused tests**. Full suite: **2,848 passed / 101 unchanged failures / 2,949 total**; failed test names match the previous suite exactly. Source/repository types, selected lint/format and build pass (existing mixed-export warnings). [Focused results](./focused-tests.json), [suite](./full-suite.json), [failure-name comparison](./suite-delta.json).
