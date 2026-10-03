# Model-order physical-port ranks

Forced model ordering incorrectly disabled greedy crossing reduction. Removing that shortcut exposed another mismatch: node ordering discarded the physical-port maps; retaining them exposed flexible ranks computed for the previous node arrangement. Native model ordering now retains the maps and redistributes flexible ports in the new backward sweep order, using the preceding sweep's rank convention. Fixed port orders remain constrained.

Additional exterior graphs improve from **4/12 to 12/12 exact geometry matches** against real elkjs 0.11.1. The twelve inputs use two backward source ports, two to four targets, and all four directions. These cases are separate from the random 700-case corpus. [Before report](../inverted-loop-clearance/ordered-boundary-report.json), [current report](./ordered-boundary-report.json), [equal-scale gallery](./index.html), [browser proof](./before-after.png).

All 27 existing model-order checks pass, including five port-influence checks that regressed when stale ranks were retained. Those five assertions compare node order, not full geometry. The twelve new regression tests assert complete geometry. [Combined results](./regressions.json).

The 700 reproducible random comparisons are unchanged, including every complete graph and difference array: default flat **51/100**, directional **145/200**, expanded **140/200**, fresh **137/200**. Each report references the previous committed corpus with no changed rows. Thirteen reference exceptions and nonfinite outputs remain failures; the previous eleven worsened incomplete cases remain preserved. **Parity remains incomplete.**

Full suite: **2820 passed / 101 unchanged failures / 2921 total**. [Suite delta](./suite-delta.json) records twelve added passing checks and no changed existing results. Source/repository types, selected lint/format and build pass; the existing mixed-export warning remains.

```sh
pnpm exec vitest run test/oracle-model-order.test.ts test/oracle-ordered-inverted-boundary.test.ts --exclude '.scratch/**' --maxWorkers=1
pnpm exec vitest run --exclude '.scratch/**' --maxWorkers=4
pnpm exec tsx scripts/check-flat-parity.ts
pnpm exec tsx scripts/check-directional-compaction-parity.ts
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/expanded.json 26 50
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/fresh.json 51 75
```

Next: extend random coverage to model-order options and compare the first divergent crossing/placement stage. Native model ordering still applies a post-sweep node transform rather than ELK's complete initial comparator and model-weighted sweep selection. Wider model-order parity is not established by these twelve matches.
