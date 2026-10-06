# Route retraces

Two routing rules remove most native `selfRetraceLength` violations:

- **Same-port self loops** closed as a 10 px out-and-back spike (ELK does the same). They now close a small square beside the port: out, along the side, back to the port line, into the port.
- **Spurs.** Post-compaction can leave an orthogonal route doubling back along one line. Interior bends where a route reverses along one axis are removed; terminal segments keep their port direction, and routes without a spur are emitted unchanged.

The gate now ranks a layout without hard violations above one with them (decided with David, 2026-10-04).

|                             | Corpus (1,280) | Holdout (2,400) |
| --------------------------- | -------------- | --------------- |
| LOSS                        | 120 → 96       | 249 → 224       |
| WIN                         | 125 → 232      | 196 → 411       |
| Native hard-violation cases | 225 → 85       | 476 → 235       |
| WIN/TIE → LOSS              | 0              | 0               |
| New hard violations         | 0              | 0               |

Soft totals versus ELK (corpus, native/ELK): crossings 14,780/14,110, overlap 3,262,178/3,593,273, bends 53,022/50,489, route length 11,635,031/11,253,518, area 543,673,422/521,894,427. Only overlap is at or below ELK. Gate elapsed: 273 s corpus, 180 s holdout.

A third change, keeping north/south port dummies next to their owner after forced model order, removed node hits in the corpus but turned one holdout TIE into a LOSS. It was not kept.

Exact-geometry oracle tests that now conflict with these quality wins are listed in [conflicting-oracle-tests.txt](https://github.com/statelyai/layout/blob/heuristics-evidence/docs/heuristics/quality-route-retraces/conflicting-oracle-tests.txt) (35). They are kept as diagnostics.

```sh
pnpm exec vitest run --dir test test/quality-route-retraces.test.ts --maxWorkers=1
```
