# Quality baseline

From here on the target is layout quality equal to or better than real ELK; exact-geometry parity reports are diagnostics only. `scripts/parity/quality-gate.ts` replays native on retained corpora and scores both engines with `scripts/heuristic-quality.mjs`.

- **Hard** (native must be 0): missing nodes/routes, nonFinite, diagonals, nodeOverlaps, nodeHits, labelOverlaps, labelNodeOverlaps, edgeLabelHits, selfRetraceLength.
- **Soft**, lexicographic: edgeCrossings, edgeOverlapLength, bends, routeLength, area (2% tolerance on lengths and area). A seed is WIN/TIE when native is no worse at the first differing metric.

Baseline at `94cf44a`:

|                             | Corpus (1,280)  | Holdout 1001–1100 (2,400, four generators) |
| --------------------------- | --------------- | ------------------------------------------ |
| WIN / TIE / LOSS            | 101 / 818 / 144 | 174 / 1,527 / 271                          |
| Oracle errors               | 217             | 428                                        |
| Native hard-violation cases | 225             | 476                                        |
| ELK hard-violation cases    | 242             | 446                                        |
| Soft totals ≤ ELK           | overlap only    | overlap only                               |

Native hard violations in the corpus: same-port self-loop spikes (124 cases), routes through nodes (79), other retraces (27), label/node overlaps (4), label hits (2), one diagonal. Most are shared with ELK. LOSS seeds are decided by edge crossings (108), bends (22), overlap (12), route length (1), area (1).

Holdout seeds come from the same generators (`check-*-parity.ts`, seeds 1001–1100) and are never used for diagnosis. The complex-compound holdout is still pending.

```sh
pnpm exec tsx scripts/parity/quality-gate.ts out.json docs/heuristics/quality-corpus/*.json.gz
pnpm exec tsx scripts/parity/quality-gate.ts holdout.json docs/heuristics/quality-holdout/*.json.gz
```
