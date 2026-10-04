# Random model-order parity

The twelve ordered exterior regressions match, but they did not establish broad model-order parity. This additional strict gate uses the existing reproducible flat/hierarchical generators with `NODES_AND_EDGES` and alternates forced node ordering by seed. All container scopes receive the options. Four directions and seeds 1–25 produce 200 cases, including cycles, self-loops, labels, bounded physical ports and cross-boundary edges. No assertion or tolerance changed.

**0/200 exact matches**: 100 flat geometry mismatches and 100 real ELK exceptions. Native throws no exceptions. The corpus contains 15,712 differing values, including one error record for each reference exception. [Complete inputs, outputs and failures](./report.json). This is additional option coverage; the previous 700-case metrics remain a separate baseline. Parity remains incomplete.

[Side-by-side gallery](./index.html) shows two flat failures at identical scale. Seed 4 RIGHT has identical node geometry but 22 differing route/edge-label values. Real ELK retains n4's outgoing ports in order e4, e8, e5, e3, e6; native's post-model transform gives e4, e8, e5, e6, e3. The swapped labeled chains then use different routing anchors. [Real worker phases](./seed4-worker-phases.json), [native before/after order](./seed4-native-order.jsonl). Seed 5 RIGHT has 197 differences; its [worker trace](./seed5-worker-phases.json) records initial model sorting and both crossing stages.

The hierarchy reference exception reproduces in the installed unminified real worker: `SortByInputModelProcessor` calls `ModelOrderNodeComparator` with a missing `MAX_MODEL_ORDER_NODES` property. [Captured stack](./hierarchy-reference-error.txt). These inputs remain failures rather than being excluded or treated as matches.

A trial moved forced normal-node priority into every barycenter sweep and removed the forced post-sweep node transform. It introduced four failures among 39 existing focused checks, so the production change was reverted. [Rejected trial results](./rejected-forced-sweep-tests.json). Real ELK also applies initial model sorting and retains transitive comparator decisions; the trial omitted those coupled behaviors. Later source/RNG tracing established that ELK 0.11.1 skips first-layer randomization only on its first model-order attempt: both attempt flags share one property id. See the [subsequent native foundation](../native-initial-model-order/README.md).

Verification: the final production source equals commit `ebb65ed`; [39 focused checks pass](./focused-tests.json). Repository types, selected formatting/lint and diff checks pass. Seeds 4–5 were repeated across both families and all four directions: all sixteen inputs, results and difference arrays agree after excluding ELK's runtime object identity hash `$H`, which the geometry gate already excludes. [Repeat verification](./repeat-verification.json). The full suite was not rerun for this test-tool/documentation change; the previous full-suite evidence remains 2820 pass / 101 failures.

```sh
pnpm test:parity:model-order
pnpm exec tsx scripts/check-model-order-parity.ts .scratch/model-order-repeat.json 4 5
node scripts/parity/trace-routing-worker.mjs docs/heuristics/random-model-order/report.json .scratch/seed4-worker.json 3
node scripts/parity/trace-routing-worker.mjs docs/heuristics/random-model-order/report.json .scratch/hierarchy-worker.json 100
```

The parity commands exit 1 while mismatches/reference exceptions remain. The hierarchy trace also exits 1 at the preserved real-worker exception.

This historical baseline remains preserved. The [subsequent native foundation](../native-initial-model-order/README.md) implements initial comparators and first-attempt selection, retains authored edge order through label/long-edge expansion, and replaces the post-sweep transform for model-order barycenter sessions. Broad parity remains incomplete.
