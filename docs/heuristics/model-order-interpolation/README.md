# Model-order barycenter interpolation

Parity remains incomplete. The first model-order attempt preserves initial node order, so unknown barycenters must interpolate from neighboring nodes rather than consume random floats. Stately previously treated every first sweep as unordered. That changed helper order immediately and shifted later random consumption. Each scope now retains its own initial-order flag until its counter-based attempt finishes; external-port layers also retain their prescribed order.

Seed 1 RIGHT initially sorts identically to ELK, including physical ports. During its first forward sweep, native node `n4` received barycenter **4.472172018878783**, while ELK interpolated **10.489933095233496**. Consequently native placed `n4` before the `e9` helper; ELK retained the helper first. [Before native barycenters](./before-native-barycenters.jsonl), [real comparator observations](./real-barycenter-comparisons.json). The RNG observer now includes bounded integer draws, which the earlier seed-1 trace omitted. After repair all **469 observed call kinds** and **467 comparable results** match, including integer bounds; two GWT long values are not compared. [Real worker/RNG](./worker-phases.json), [native RNG](./native-rng.json), [verification](./rng-verification.json). Seed 1 still has 80 differing geometry values in RIGHT: RNG alignment does not establish layout parity.

Strict model-order seeds 1–25 improve **42/200 → 50/200**, with differences **9,135 → 6,512**. Seeds 6 and 16 gain full geometry parity in all four directions; no complete match is lost. Eighteen incomplete rows worsen and remain preserved. [Complete outputs](./report.json), [before](../native-initial-model-order/report.json), [delta](./delta.json), [equal-scale before/native/ELK gallery](./index.html).

Fresh seeds 26–50 remain **39/200**, with differences **10,051 → 9,320**. No complete match gained or lost; fifteen incomplete fresh rows worsen. [Fresh complete outputs](./fresh-report.json), [fresh delta](./fresh-delta.json). Each run includes 100 real ELK hierarchy exceptions, retained as failing comparisons. No native exceptions.

All earlier **700 complete comparisons remain unchanged**, verified against reconstructed committed baselines after normalizing only ELK runtime object identifiers in error text: [verification](./unchanged-700.json). Default flat remains 51/100; directional sets remain 145/200, 140/200 and 137/200. Their failing gates remain visible.

Validation: **63/63 focused checks**, including 24 full-geometry random regressions. Full suite: **2,844 passed / 101 unchanged failures / 2,945 total**. Source/repository types, selected lint/format and build pass; existing mixed-export warnings remain. [Focused checks](./focused-tests.json), [full suite](./full-suite.json). Browser proof confirms identical geometry for seed 6 RIGHT.

Reproduce:

```sh
pnpm test:parity:model-order
pnpm exec tsx scripts/check-model-order-parity.ts .scratch/model-fresh.json 26 50
pnpm exec vitest run --dir test test/oracle-random-model-order.test.ts test/oracle-model-order.test.ts test/oracle-ordered-inverted-boundary.test.ts
pnpm exec vitest run --dir test --maxWorkers=4
node scripts/parity/trace-routing-worker.mjs docs/heuristics/model-order-interpolation/report.json .scratch/seed1-real.json 0
pnpm exec tsx scripts/parity/trace-native-rng.ts docs/heuristics/model-order-interpolation/report.json .scratch/seed1-native.json 0
```

Next: trace final physical-port and placement differences in seed 1 despite aligned RNG, plus the remaining fixed/non-flow-port cases. Continue unified port preparation, helper/comparator branches, weighted settings, valid reference hierarchy families and existing suite failures. Retain all worsened cases; do not relax the geometry gate.

The subsequent [greedy traversal repair](../greedy-starting-layer/README.md) brings seed 1 to full parity in all directions and improves this strict gate to 54/200. This folder retains its earlier 50/200 evidence.
