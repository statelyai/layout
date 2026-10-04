# Canonical crossing scores

Native sweep selection omitted same-layer and north/south crossings. It now uses a canonical port counter with ELK's hyperedge estimate. Two-sided greedy swaps use the corresponding edge-pair objective. Candidates without selected port orders retain their existing fallback. Graph conversion is reused across greedy swaps.

Both objectives match installed real ELK on **3,544 identical candidates / 7,088 score comparisons**, observed over 300 flat/hierarchical inputs. Repeated observations are checked for consistent scores. The development tracer observes real worker orders and calls its existing counter functions; production uses native TypeScript only.

Layout parity remains incomplete:

| Strict corpus                | Before | Current | Differences before / current |
| ---------------------------- | ------ | ------- | ---------------------------- |
| Default flat, 100            | 43     | 47      | 8,957 / 8,082                |
| Directional seeds 1–25, 200  | 141    | 143     | 9,938 / 9,183                |
| Directional seeds 26–50, 200 | 137    | 137     | 11,223 / 10,325              |
| Directional seeds 51–75, 200 | 134    | 134     | 10,265 / 9,188               |

Combined directional: **414/600**, zero native exceptions. No complete matches lost. Thirteen ELK exceptions and non-finite reference layouts remain failing. Individual incomplete cases worsen; [delta.json](./delta.json) lists every changed row. Complete inputs, outputs and differences remain in each report. Success thresholds and assertions are unchanged.

Four new complete-geometry regressions cover seeds 3/23 LEFT/UP: all fail on `93d073f` and pass now. Sixty canonical snapshots test both counter objectives and input preservation. Full repository suite: **2,682 passed / 101 unchanged failures / 2,783 total**. Source/repository types, selected lint/format and package build pass.

The first integration incorrectly reused hyperedge estimates for greedy swaps and ignored the existing fallback when port-order data was absent. It introduced shared-port/model-order regressions. [Rejected assertions](./rejected-integration.json) and [reproduction patch](./rejected-integration.patch) retain that failure; the corrected integration passes all 323 targeted checks, including 200 shared-port cases and model-order checks. An initial unrestricted test invocation also included archived `.scratch` trees; the reported full-suite result excludes them explicitly.

[Six-case before/current/ELK gallery](./fixtures/index.html) includes four gained matches and two remaining failures. [Original 200](./index.html), [expanded 200](./expanded/index.html), and [fresh 200](./fresh/index.html) show equal-scale comparisons without modifying routes. [Browser proof](./before-after.png) shows seed 23 UP.

Reproduce:

```sh
pnpm exec tsx scripts/parity/trace-crossing-scores.ts docs/heuristics/port-aware-tracks/flat-report.json .scratch/crossing-flat.json
pnpm exec tsx scripts/parity/trace-crossing-scores.ts docs/heuristics/port-aware-tracks/report.json .scratch/crossing-directional.json
pnpm exec tsx scripts/check-flat-parity.ts
pnpm exec tsx scripts/check-directional-compaction-parity.ts
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/directional-expanded.json 26 50
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/directional-fresh.json 51 75
pnpm exec vitest run --exclude '.scratch/**' --maxWorkers=4
```

The score proof is isolated from layout parity. One-sided greedy and wrapped/unzipped paths retain their existing scoring. Further work must align native candidate port traversal and ordering, then address the remaining geometry/compaction failures and broaden unseen coverage.
