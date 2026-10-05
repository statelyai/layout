# Compound candidates

Crossing-minimization settings help on different compound graphs. For an INCLUDE_CHILDREN layout with nested compounds, the elkjs facade now lays out four candidates: the default (two-sided hierarchical greedy switch), ELK's own default (greedy switch off), and random seeds 2 and 3. It keeps the best by measured quality. Graphs that set the greedy-switch option explicitly, and graphs without nested compounds, run once as before.

`src/elkjs/layout-quality.ts` measures a result in this order:

1. Defects: routes through leaf nodes, routes folding onto themselves, diagonals, labels covering nodes or each other, routes through other edges' labels.
2. Then crossings, edge overlap, bends, route length and area, with 2% tolerance on lengths and area.

The same measure now drives the post-compaction fallback.

|                             | Corpus (1,280) | Holdout (2,800) |
| --------------------------- | -------------- | --------------- |
| LOSS                        | 35 → 23        | 198 → 105       |
| WIN                         | 336 → 492      | 897 → 1,238     |
| Native hard-violation cases | 0 → 0          | 8 → 4           |
| WIN/TIE → LOSS              | 0              | 3               |
| New hard violations         | 0              | 0               |

Corpus soft totals versus ELK: crossings 13,441 vs 14,110 and overlap below ELK. Holdout: crossings, overlap, bends and route length are all at or below ELK; area is above. Regressed holdout seeds (edge overlap): compound-options 1024 RIGHT, 1037 RIGHT, 1083 LEFT.

Cost: compound layouts take about four times as long. Gate elapsed: 839 s corpus and 1,996 s holdout, previously about 220 s and 410 s.

```sh
pnpm exec vitest run --dir test test/quality-compound-candidates.test.ts --maxWorkers=1
```
