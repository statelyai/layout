# Physical hierarchy boundary sides

Native compound preparation left boundary ports FREE. Real ELK fixes their owning nodes to FIXED_SIDE after introducing hierarchy dummies. Native now applies that phase state whenever actual crossings create boundaries and restores authored constraints in the public graph. Fixed-side port sorting now uses canonical sides after direction normalization, matching the worker's processing order. The [diagnostic trace and rejected first trial](../hierarchy-fixed-sides/README.md) preserve the root-cause evidence, fifteen transient regressions and their correction.

Across **1,200 unchanged retained random inputs**, complete matches remain **628/1,200** with none lost. Differing values decrease **102,041→99,176**. Native exceptions remain zero; all **213 real-ELK exceptions remain failures**. This does not establish parity.

The **100 deeper hierarchy inputs** retain **20 complete matches**, with differences **61,058→57,938**, zero exceptions in either engine. Fifty-five incomplete cases improve and twenty-one worsen. The original 1,100 inputs retain all 608 matches; every output is unchanged except incomplete model seed 2 LEFT, which worsens 16→271 differing values. All twenty-two worsened inputs and outputs remain in [original deltas](./delta.json) and [complex deltas](./complex-delta.json), backed by complete sparse reports and unchanged baselines.

A new strict 48-case matrix covers ports, feedback and parallel edges in all directions, with default/FREE/FIXED_ORDER/FIXED_POS compound constraints. Complete matches improve **4→26**, none lost; all **22 remaining failures** remain active assertions. Fifteen additional strict direction regressions prevent the first trial's lost LEFT matches. [Matrix before/after and direction evidence](../hierarchy-fixed-sides/README.md).

Full suite: **2,938 passed / 123 failed / 3,061 total**. The original 101 failed names remain unchanged; the additional 22 failures are newly exposed matrix cases: [suite](./full-suite.json), [comparison](./suite-delta.json). Source/repository types, selected lint/format and build pass with existing mixed-export warnings. Production remains native TypeScript; real elkjs 0.11.1 is development-only.

[Equal-scale before/native/real gallery](./complex-comparison/index.html#0) retains every complex case, including worsenings. The worker observer delegates to the installed real algorithm and a fresh unobserved run is byte-identical. Latest main fetched and fork verified; PR targets main.

The next minimized failure is [vertical boundary routing](./vertical-bend-repro.json), with [real worker phases](./vertical-bend-worker-phases.json). Its node/port/container geometry matches, but two bend coordinates differ and form diagonal endpoint segments. Stronger authored compound constraints account for the other remaining matrix gaps. The full parity goal remains active.

<!-- diagnostic commands from test/oracle-hierarchy-fixed-sides.test.ts, test/oracle-hierarchy-canonical-port-sort.test.ts and scripts/check-complex-compound-parity.ts -->

```sh
pnpm exec vitest run --dir test test/oracle-hierarchy-fixed-sides.test.ts test/oracle-hierarchy-canonical-port-sort.test.ts
pnpm exec tsx scripts/check-complex-compound-parity.ts .scratch/complex-hierarchy.json 1 25
pnpm exec vitest run --dir test --maxWorkers=4
```
