# Quality holdout 2

Tests now embed rows of the first holdout (`quality-holdout/`, seeds 1001–1100), so it is no longer unseen. It stays as a regression corpus. This holdout takes over: the same five generators (`scripts/check-*-parity.ts`: flat, model-order, directional-compaction, compound-options, complex-compound) with seeds 1101–1200, 2,800 cases. Never diagnose on these seeds.

```sh
pnpm exec tsx scripts/parity/generate-quality-holdout.ts docs/heuristics/quality-holdout-2 1101 1200
pnpm exec tsx scripts/parity/quality-gate.ts holdout.json docs/heuristics/quality-holdout-2/*.json.gz --jobs 8
```

The generator runs each parity check over the whole seed range and keeps each row's input and real-ELK output. Real ELK (GWT) carries state from one layout to the next in a process, so its output depends on the call sequence: regenerate whole ranges, not single seeds. Regenerating seeds 1001–1100 this way reproduces `quality-holdout/` exactly.

Baseline:

|                             | `main` (0.4.0)    | Mixed-port model guard |
| --------------------------- | ----------------- | ---------------------- |
| WIN / TIE / LOSS            | 1,321 / 961 / 90  | 1,323 / 961 / 88       |
| Oracle errors               | 428               | 428                    |
| Native hard-violation cases | 3                 | 1                      |
| ELK hard-violation cases    | 1,178             | 1,178                  |
| Crossings (native / ELK)    | 51,762 / 51,984   | 50,152 / 51,984        |
| Bends (native / ELK)        | 154,412 / 153,316 | 153,848 / 153,316      |

The remaining hard case is a 40px self-retrace (model-order 1128 UP, flat family), also on `main`. `main` also has a 5px self-retrace on seed 1112 UP (flat, and model-order's flat family) that the guard removes.
