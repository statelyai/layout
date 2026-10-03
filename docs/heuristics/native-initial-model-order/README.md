# Native initial model-order foundation

Parity remains incomplete. The native model-order barycenter pipeline now sorts initial nodes/physical ports, preserves authored edge ranks through label/long-edge expansion, applies forced node priority during sweeps, and selects attempts using model-weighted crossings. It replaces the post-sweep node transform for these sessions. Free-port sides used by this pass follow cycle-broken connectivity. Other pipelines retain their existing side handling; port preparation still needs a unified foundation.

The strict randomized model-order gate improves **0/200 → 42/200**; differing values decrease **15,712 → 9,135**. All 42 gains are flat graphs. The 200-case total includes 100 real ELK hierarchy exceptions, which remain failures. No native exceptions. [Complete outputs](./report.json), [before baseline](../random-model-order/report.json), [delta](./delta.json), [equal-scale before/native/ELK gallery](./index.html). Ten incomplete flat rows worsen and remain fully preserved in the delta; no complete match is lost.

A fresh run, seeds 26–50, produces **39/200** exact matches, 10,051 differing values, zero native exceptions and 100 real ELK hierarchy exceptions. [Complete fresh outputs](./fresh-report.json). These option runs add coverage beyond the earlier 700-case baseline; they do not establish broad parity.

ELK 0.11.1 assigns FIRST_TRY_WITH_INITIAL_ORDER and SECOND_TRY_WITH_INITIAL_ORDER the same property id (`firstTryWithInitialOrder`, installed worker lines 46472–46473). Clearing the flags after attempt one causes later attempts to randomize. The earlier two-attempt assumption was wrong. Its weighted-counter activation also checks node influence twice (worker line 51165); port influence alone does not activate that counter. The native implementation follows this version's behavior.

The small crossed-graph observation matches all **51 RNG call kinds**, and all **50 comparable primitive results**, including float and boolean normalization. GWT's long object is not compared by value. [Real observations](./real-rng.json), [native observations](./native-rng.json), [verification](./rng-verification.json). This isolated trace proves attempt/RNG alignment for that input, not broad layout parity.

Validation: **55/55 focused checks** (16 new full-geometry random comparisons, 27 existing model-order comparisons and 12 existing boundary comparisons). The full existing suite is **2,820 passed / 101 failed / 2,921 total**, equal to its published baseline. That run preceded the 16 added tests; the focused run verifies them separately. [Full suite](./full-suite.json), [focused checks](./focused-tests.json). Seven exterior compatibility failures reproduce at committed HEAD with exactly the same failing cases: [HEAD](./exterior-head.json), [current](./exterior-current.json). They were mistakenly investigated as new regressions; the changes do not introduce them. Source/repository types, selected lint/format and build pass. Broad suite failures remain unresolved.

Reproduce from repository root:

```sh
pnpm test:parity:model-order
pnpm exec tsx scripts/check-model-order-parity.ts .scratch/model-fresh.json 26 50
pnpm exec vitest run --dir test test/oracle-random-model-order.test.ts test/oracle-model-order.test.ts test/oracle-ordered-inverted-boundary.test.ts
pnpm exec vitest run --dir test
node scripts/parity/trace-routing-worker.mjs docs/heuristics/native-initial-model-order/rng-input.json .scratch/real-rng.json
pnpm exec tsx scripts/parity/trace-native-rng.ts docs/heuristics/native-initial-model-order/rng-input.json .scratch/native-rng.json
```

Next: trace the first divergent helper-node/port order in retained model-order failures and finish the comparator branches; address weighted objectives, shared/free and non-flow ports across wider settings. Continue incomplete flat/hierarchical placement/routing, existing failures, the ten worsened option cases and unseen random coverage. Keep real ELK reference exceptions visible while adding hierarchy families the oracle can lay out.

The subsequent [interpolation repair](../model-order-interpolation/README.md) fixes unknown barycenters in the preserved initial attempt and expands the strict baseline to 50/200. This folder retains the preceding 42/200 evidence.
