# BK block straightening eligibility

Native BK placement recomputed ELK's `od` flag from every block member. ELK initializes the flag to true and changes it only when vertical alignment adds a node: it stays true only if that added node is a long-edge dummy. A singleton normal root therefore retains true. Native incorrectly excluded its same-layer connection from compaction thresholds and deferred straightening.

The native alignment now retains the same flag history. Seed 3 RIGHT previously placed N2 at y150; real ELK places it at y102. The node and three connected route coordinates now match. Real RIGHT/UP placement uses raw y−120; native previously used −72. The retained [real placement trace](./worker-placement.json) records the singleton flag, root, margins and candidate geometry; [native candidates before](./native-before-candidates.json) record the divergence.

| Strict corpus                | Before | Current | Differences before / current |
| ---------------------------- | ------ | ------- | ---------------------------- |
| Default flat, 100            | 48     | 49      | 8,026 / 8,014                |
| Directional seeds 1–25, 200  | 144    | 145     | 9,253 / 9,203                |
| Directional seeds 26–50, 200 | 137    | 137     | 10,043 / 10,002              |
| Directional seeds 51–75, 200 | 136    | 136     | 8,052 / 7,950                |

Combined directional: **418/600**, **27,155** differing values, zero native exceptions. All 25 changed rows are retained in [delta.json](./delta.json); none has more differences and no complete match is lost. Thirteen ELK exceptions and non-finite reference layouts remain failing. Parity remains incomplete.

Each `*-report.json` stores indexed updates to its named committed baseline. Recursive application reconstructs all 700 complete comparison rows exactly, verified against the full local reports. This preserves changed inputs/outputs and references every unchanged failure without duplicating its graphs.

Five complete-geometry regressions cover default, RIGHTUP, RIGHTDOWN, LEFTUP and LEFTDOWN alignment. Default and RIGHTUP fail on `9ea96a1` with four differences; all five pass after the fix. [Before results](./regressions-before.json) preserve full graphs. All 200 shared-port checks and three earlier port-rank regressions pass. Full suite: **2,754 passed / 101 unchanged failures / 2,855 total**; [suite delta](./suite-delta.json) confirms no new failures. Source/repository types, selected lint/format and build pass; the existing mixed-export warning remains.

[Before/native/ELK gallery](./fixtures/index.html) includes the gained match, an improved incomplete case, an unchanged failure and hierarchy. [Browser proof](./before-after.png) shows seed 3 RIGHT; original routes and equal scale are preserved.

```sh
pnpm exec vitest run test/oracle-bk-block-eligibility.test.ts --exclude '.scratch/**' --maxWorkers=1
pnpm exec vitest run --exclude '.scratch/**' --maxWorkers=4
pnpm exec tsx scripts/check-flat-parity.ts .scratch/bk-block-flat.json
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/bk-block-directional.json 1 25
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/bk-block-expanded.json 26 50
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/bk-block-fresh.json 51 75
node scripts/parity/trace-bk-worker.mjs .scratch/current-flat-report.json .scratch/bk-block-worker.json 2
```

The trace input is the previous complete flat report reconstructed from `../cached-port-sweeps/flat-report.json`. Strict parity gates still fail. Next: trace the remaining flat failures through crossing initialization, block alignment and routing, and broaden unseen coverage.
