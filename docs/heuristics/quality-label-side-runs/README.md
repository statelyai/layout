# Label side runs

ELK's SMART label sides (`LabelSideSelector`) walk each layer's consecutive dummy nodes. When exactly two adjacent dummies, of any kind, belong to long edges connecting the same two nodes (their `LONG_EDGE_SOURCE` and `LONG_EDGE_TARGET`, in cycle-broken direction), the first label goes ABOVE and the second BELOW. Native compared label dummies only.

Flat seed 19 RIGHT: reversed `e24` runs `n0` → `n14`, like the long edge `e22` whose dummy follows it. ELK pairs them and puts `e24`'s label above, keeping its route straight. Native put it below and the route detoured around the label: +2 bends. Native now gives long-edge dummies their long edge's endpoints in the same comparison. The affected seeds now match ELK exactly.

|                             | Corpus (1,280) | Holdout (2,800) |
| --------------------------- | -------------- | --------------- |
| LOSS                        | 71 → 51        | 269 → 245       |
| Native hard-violation cases | 0 → 0          | 20 → 20         |
| WIN/TIE → LOSS              | 0              | 0               |
| New hard violations         | 0              | 0               |

Gate elapsed: 215 s corpus, 411 s holdout.

```sh
pnpm exec vitest run --dir test test/quality-label-side-runs.test.ts --maxWorkers=1
```
