# Physical hierarchy boundary state

Parity remains incomplete. The previous hierarchy corpus consisted of shallow DAGs without ports or cycles. A separate v1 generator now exercises up to three nested compound levels, 1–6 ports per port-bearing leaf (at most two on one side), fixed sides/positions, labels, cycles, loops, parallel edges and cross-boundary edges. Node dimensions and fixed port spacing remain bounded. Existing generators and retained failures are unchanged.

The new corpus exposed a native exception: hierarchy alignment interpreted directed incoming/outgoing edge order as physical boundary order. Feedback reversal can leave a WEST boundary port with only outgoing edges. Native then found no incoming ports and threw `Incomplete hierarchical port order`; real ELK sorts the physical port identities regardless of edge direction. [Diagnosis](./boundary-diagnosis.json), [delegating real worker observations](./worker-phases.json).

Crossing snapshots now retain canonical physical port identities. Parent-to-child alignment uses those identities and retains the complete-boundary assertion. Child-to-parent publication updates physical boundary slots, then derives both directed edge orders from the resulting physical order. Snapshot restoration and finalization preserve independent copies of the physical state. The existing full sweep-state equality assertions remain unchanged, with additional alias checks.

Across the new **100 graphs**, native exceptions fall **76 → 0**; real ELK also has zero exceptions. **8/100 complete geometry matches** before and after. The remaining 92 complete-output mismatches are retained. Differing-value counts rise from 1,750 to 61,202 because formerly thrown cases now produce geometry; exception rows had counted as one difference and cannot be ranked against geometry counts. [Before](./complex-full-before.json), [after](./complex-report.json), [delta](./complex-delta.json).

The first 20 cases previously had 16 native exceptions. [Alignment-only trial](./alignment-only-trial.json) preserves an incomplete implementation that removed those exceptions but broke physical publication; the final implementation also restores the original seed 4 node/route geometry, leaving its existing three bounds differences.

All **1,100 prior inputs remain byte-for-byte unchanged**, with **608 strict matches**, **40,983 differing values**, zero native exceptions and 213 retained oracle exceptions counted as failures. Sparse [deltas](./delta.json) reference the complete previous reports. Combined coverage: **616/1,200 exact matches**, zero native exceptions, 213 oracle exceptions. These numbers do not establish parity.

Four new end-to-end regressions preserve every original node, port, edge and container ownership and require finite routed geometry through feedback reversal in all directions: [red](./regression-red.json), [green](./regression-green.json). They test the fixed exception/topology, not full ELK geometry. Fourteen focused tests also retain complete sweep-state equality through restoration and finalization: [focused](./focused.json). The new random gate continues comparing every node, port, label, route and junction at 5e-13 tolerance without exclusions.

[Equal-scale before/native/real gallery](./complex-comparison/index.html#0) preserves all 100 graphs, including the failed-before seed 1 and its 777 remaining differences. [Browser proof](./complex-comparison/comparison.png). The earlier suite with four failures caused by omitted final physical state is retained in [unfinished-state-suite](./unfinished-state-suite.json); those assertions exposed a real omission and were not weakened.

<!-- commands and fixture limits from scripts/check-complex-compound-parity.ts and scripts/parity/complex-compound-corpus.ts -->

Reproduce:

```sh
pnpm exec tsx scripts/check-complex-compound-parity.ts .scratch/complex-hierarchy.json 1 25
pnpm exec vitest run --dir test test/hierarchy-physical-port-state.test.ts test/layered-sweep-session.test.ts
node scripts/parity/trace-compound-worker.mjs docs/heuristics/physical-hierarchy-boundaries/complex-report.json .scratch/complex-worker.json 0
```

Next: retain measured bounds through nested compound normalization, then compare remaining cycle/helper/physical-port phases against real ELK. Seed 4 already differs only in three nested bounds fields. The full parity goal remains active.

Validation: **2,885 passed / 101 unchanged failures / 2,986 total**; [suite](./full-suite.json), [failure-name comparison](./suite-delta.json). Source/repository types, selected lint/format and build pass, with existing mixed-export warnings. Latest main fetched; fork point and PR base remain main.
