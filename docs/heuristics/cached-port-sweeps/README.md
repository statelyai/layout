# Cached physical ports in native sweeps

Native sweeps now use the canonical physical-port distributor for both node ranks and port ordering. Previously, node sorting ranked only ports connected to the adjacent layer. ELK ranks every connected physical port first, including ports participating in other connections, and shares that state with distribution. A missing shared rank calculation caused candidate-order differences.

The bridge retains canonical topology, refreshes it on restoration, and synchronizes only the current and fixed layers. The rejected per-layer topology rebuild failed the existing 30-second stress check. The cached adapter passes that unchanged check; the recorded focused run took about 8.8 seconds. Fixed orders and hierarchical locks remain enforced. Production uses native TypeScript only.

The tracer now replays persistent native distributor state and the rank calculations ELK performs between calls. Node/port orders remain external inputs from real ELK. **27,670/27,670 calls match**, including input state, output state and exact physical port order, across 300 flat/hierarchical inputs. The proof starts from the first observed warm state; it does not establish whole-layout or cold-initialization parity. Six ELK exceptions remain recorded failures. [Scores and trace hashes](./scores.json) retain the outcomes; full traces remain locally and are reproducible.

| Strict random corpus         | Before | Current | Differences before / current |
| ---------------------------- | ------ | ------- | ---------------------------- |
| Default flat, 100            | 47     | 48      | 8,082 / 8,026                |
| Directional seeds 1–25, 200  | 143    | 144     | 9,183 / 9,253                |
| Directional seeds 26–50, 200 | 137    | 137     | 10,325 / 10,043              |
| Directional seeds 51–75, 200 | 134    | 136     | 9,188 / 8,052                |

Combined directional: **417/600**, **27,348** differing values, zero native exceptions. No complete matches lost. Thirteen ELK exceptions and non-finite outputs remain failing. All 82 changed rows, including 31 with more differences, remain in [delta.json](./delta.json). Parity is incomplete.

The four `*-report.json` files retain every changed input/output row as indexed updates to their named committed baseline, avoiding duplicated unchanged graphs. Applying those updates and the current summary reconstructs all 700 report rows exactly; this was checked against complete local reports. All failures remain represented, including unchanged ones in the referenced baseline.

Three new complete-geometry regressions—seed 23 RIGHT, seed 67 LEFT with constraint-locking compaction, seed 53 DOWN with LEFT compaction—fail on `0abc22b` with 53, 169 and 116 differences, then pass now. [Before evidence](./regressions-before.json) retains full inputs and outputs. Sixty-four phase snapshots also verify the shared rank method. Full suite: **2,749 passed / 101 unchanged failures / 2,850 total**; [suite delta](./suite-delta.json) confirms no new failures. Types, selected lint/format and build pass; the build retains its existing mixed-export warning.

[Six-case before/native/real ELK gallery](./fixtures/index.html) includes the three gains, two worsened cases and a hierarchical graph. [Browser proof](./before-after.png) shows seed 23 RIGHT with matching native/ELK geometry and unchanged rendering of original routes.

Reproduce:

```sh
pnpm exec tsx scripts/parity/trace-port-distribution.ts docs/heuristics/canonical-crossing-scores/flat-report.json .scratch/cached-port-states-flat.json
pnpm exec tsx scripts/parity/trace-port-distribution.ts docs/heuristics/canonical-crossing-scores/report.json .scratch/cached-port-states-directional.json
pnpm exec tsx scripts/check-flat-parity.ts .scratch/canonical-rank-flat.json
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/canonical-rank-directional.json 1 25
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/canonical-rank-expanded.json 26 50
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/canonical-rank-fresh.json 51 75
pnpm exec vitest run --exclude '.scratch/**' --maxWorkers=4
```

Parity commands continue to fail until their full gates pass. Next: compare native candidate port initialization/traversal on the remaining flat failures, then resolve downstream placement/routing differences and expand unseen coverage.

A subsequent [BK block eligibility correction](../bk-block-eligibility/README.md) resolves another placement divergence. The metrics above describe the cached-port checkpoint.
