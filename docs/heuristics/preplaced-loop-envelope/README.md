# Preplaced self-loop envelopes

In the retained compound-options-v1 graph, seed 2 DOWN, native node positions match ELK but two cross-hierarchy bends sit nine pixels too far right. Native and real ELK Brandes–Koepf candidates match. A late east self-loop spacing fallback then moves the neighboring boundary helper, even though placement already included the owner's self-loop envelope.

The routing fallback now checks the same placement envelope marker used by the other self-loop reservation paths. It still applies to placements without a prepared envelope. Production remains native TypeScript.

<!-- strict regression from test/oracle-preplaced-loop-envelope.test.ts and after.json -->

The complete geometry regression fails before the fix with two differing bend coordinates and passes afterward with **zero differences**. [Before/native/real ELK proof](comparison/index.html) preserves the original node positions and route coordinates, with equal scale and viewport. Full inputs and oracle/native outputs remain in `before.json` and `after.json`.

The real worker phase observer was checked against a fresh uninstrumented worker. Their complete serialized outputs match, including internal hash fields. The mismatch therefore comes from the native routing fallback, not instrumentation or a different ELK placement candidate.

```sh
pnpm exec vitest run --dir test test/oracle-preplaced-loop-envelope.test.ts --maxWorkers=1
node scripts/render-compound-parity-comparison.mjs docs/heuristics/preplaced-loop-envelope/before.json docs/heuristics/preplaced-loop-envelope/after.json .scratch/loop-envelope-comparison 0
```

Frozen 80-case random options: **6 → 8 exact matches**, **8,606 → 8,579 differing values**, zero native errors and four retained oracle errors. LEFT and DOWN seed 2 gain full matches; no exact match is lost. Eight native outputs change: three reduce differences, five retain their difference count and none increases it. Full failures and deltas remain preserved.

Current-checkout focused tests: **147/147 pass**. Full suite: **3,278 passed, 109 retained failures, 3,387 total**. File-qualified comparison with the verified preceding revision shows zero newly failing existing tests and one added passing regression. Source/repository type checks, lint and build pass. Compressed raw test reports and the comparison delta are retained here. Historical tests under `.scratch` are excluded by `--dir test`.

The preceding junction-transfer revision completed all **1,280 cases: 634 exact matches**, 109,122 differing values, zero native errors and 217 retained oracle errors. This fix’s 1,100 ordinary random outputs are unchanged. Including the 80 options cases, completed coverage is **616/1,180 exact**, 49,817 differing values, zero native errors and 217 oracle errors. The final 100 complex cases are still running against frozen source. This is not overall parity.
