# Greedy starting-layer traversal

Parity remains incomplete. ELK scans the starting layer once per greedy sweep, then repeatedly scans each later layer until that layer stops improving. Native previously converged the starting layer immediately. That extra pass changed the following layers' local optimum and left seed 1 with 80 differing geometry values in RIGHT despite aligned barycenter/RNG behavior.

The corrected traversal matches **all 169 observed adjacent-node pair decisions**, including pair sequence and accepted/rejected swaps, on seed 1 RIGHT. Native previously made 166 decisions; its first divergence occurred at event 4, when it rescanned layer 0 while ELK entered layer 1. [Real worker decisions](./worker-phases.json), [before native](./before-native-decisions.jsonl), [corrected native](./native-decisions.jsonl), [verification](./decision-verification.json). The earlier single-pass trial missed the intended loop and was inconclusive; the corrected trial and production loop were verified explicitly.

Strict model-order seeds 1–25 improve **50/200 → 54/200**, with differences **6,512 → 5,876**. Seed 1 now matches complete geometry in all four directions. No match lost; no new worsened cases. Fresh seeds 26–50 remain **39/200**, 9,320 differences. Each run retains 100 ELK hierarchy exceptions as failures; zero native exceptions. All earlier **700 complete comparisons remain unchanged**, after normalizing only ELK runtime object identifiers in exception text. [Delta](./delta.json), [700-case verification](./unchanged-700.json).

[Current report](./report.json) and [fresh report](./fresh-report.json) store preserved baseline references plus complete indexed updates; only four of the 400 option rows changed. The report reader reconstructs all rows and rejects cycles, invalid/duplicate indices and changed inputs. Earlier complete failures remain accessible through [the preceding baseline](../model-order-interpolation/README.md). [Equal-scale before/native/ELK gallery](./index.html) renders all 200 current cases; browser proof confirms seed 1 RIGHT.

Validation: **67/67 focused checks**, including 28 full-geometry random regressions. Full suite: **2,848 passed / 101 unchanged failures / 2,949 total**. Source/repository types, selected lint/format and build pass; existing mixed-export warnings remain. [Focused checks](./focused-tests.json), [full suite](./full-suite.json). Sparse report reconstruction reproduces native output and the real worker's decision sequence.

Reproduce:

```sh
pnpm test:parity:model-order
pnpm exec tsx scripts/check-model-order-parity.ts .scratch/model-fresh.json 26 50
pnpm exec vitest run --dir test test/oracle-random-model-order.test.ts test/oracle-model-order.test.ts test/oracle-ordered-inverted-boundary.test.ts
pnpm exec vitest run --dir test --maxWorkers=4
node scripts/parity/trace-routing-worker.mjs docs/heuristics/greedy-starting-layer/report.json .scratch/seed1-real.json 0
pnpm exec tsx scripts/parity/trace-native-rng.ts docs/heuristics/greedy-starting-layer/report.json .scratch/seed1-native.json 0
```

Next: trace remaining fixed/non-flow-port failures, unify port preparation across pipelines, and finish helper/comparator and weighted-setting branches. Continue valid reference hierarchy families, existing suite failures and unseen random coverage. Previously worsened rows remain preserved; this fix does not resolve broad parity.
