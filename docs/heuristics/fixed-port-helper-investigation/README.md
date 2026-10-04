# Fixed-port helper ordering investigation

Parity remains incomplete. Replaying model-order seed 2 RIGHT on `f8a668e` reproduces **32 differing geometry values**: 16 route/bend values and 16 junction values. Real-node, physical-port and label geometry matches. This is diagnostic evidence, not a passing parity gate.

The divergence exists in expanded routes **before** long-edge joining. Native e11/e21 turn at x=140 and run along y=204; real ELK retains their shared helper chain above n2/n3 and turns at x=336. Native e12 traverses helpers at y=214/194; real ELK keeps its chain at y=60. The final merge/join is consuming already divergent helper order and geometry.

[Native phases](./native-phases.json) preserve initial order, all sweep-entry orders, premerge graph/order, dummy rectangles, expanded routes, prejoin routes and joined routes. [Real phases](./real-phases.json) preserve the same input, reference output, all 29 worker stages, sweep observations and routing decisions. Node identity is preserved through helper edge IDs; null origins alone cannot identify a helper.

The earliest observed ordering discrepancy is at sweep entry. Real ELK runs `SortByInputModelProcessor` before `NorthSouthPortPreprocessor`; native sorts the canonical graph after north/south helpers have been inserted. Native also approximates upstream helper-node comparator branches. The phase discrepancy is verified; attributing all 32 differences to that discrepancy alone is contradicted by the trial below.

Two single-variable trials were rejected and reverted:

- Shared-source-port comparison: 32 differences remain.
- Project the existing canonical graph onto original cross-axis ports before model sorting, then reattach helpers: 220 differences. This is insufficient; it does not reproduce upstream port preparation, node comparator decisions and helper creation ordering together.

[Verification](./verification.json) preserves every differing value from both trials and the restored run. Restored production matches the original 32 differences exactly. No production changes or assertions were weakened.

<!-- diagnostic commands from scripts/parity/trace-routing-worker.mjs and scripts/parity/trace-native-rng.ts -->

Reproduce the reference and current native geometry:

```sh
node scripts/parity/trace-routing-worker.mjs docs/heuristics/greedy-starting-layer/report.json .scratch/seed2-real.json 1
pnpm exec tsx scripts/parity/trace-native-rng.ts docs/heuristics/greedy-starting-layer/report.json .scratch/seed2-native.json 1
```

Native phase probes were temporary observations in `src/layered/index.ts` around edge routing, north/south restoration and long-edge joining; in `src/layered/strategies.ts` immediately after initial model sorting and at sweep entry. All observations delegated to the existing implementation. Production source was restored and replayed afterward.

Next: reproduce the upstream initial ordering on the pre-north/south graph, trace comparator decisions against the worker, then carry its ordered ports into helper creation and the sweep. Verify complete geometry and broad random corpora before retaining that implementation. Existing broad failures and worsened rows remain unchanged.

Validation: restored production source has no diff; replay reproduces the exact original 32 differences. Existing random complete-geometry regressions: **28/28 pass**. Full suite and broad corpora were not rerun because production code is unchanged.
