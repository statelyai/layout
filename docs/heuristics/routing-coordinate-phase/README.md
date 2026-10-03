# Routing coordinate phase

Seed 1 RIGHT/LEFT initially differed by a 10-pixel layer gap. ELK routes in raw BK coordinates before graph-padding normalization. Native previously computed port anchors after normalization; rounding changed the 24-to-23 segment conflict weight from 1 to 0. The native segment dependency/rank algorithm reproduces ELK's nine first-gap lanes when supplied raw anchors.

BK now records its raw coordinates alongside normalized placement. Orthogonal dependency generation, thresholds and ranks use raw anchors; published endpoints remain normalized. Split crossover positions are translated back into published coordinates. Later placement adjustments are retained.

`worker-phases.json` observes installed real elkjs 0.11.1 without replacing algorithms. Reproduce:

```sh
node scripts/parity/trace-routing-worker.mjs docs/heuristics/loop-envelopes/report.json .scratch/routing-worker.json
pnpm exec vitest run test/oracle-routing-coordinate-phase.test.ts --maxWorkers=2
pnpm test:parity:flat
pnpm test:parity:compound
```

The two complete-geometry regressions fail on archived 950714a and pass with the fix. Broad parity remains incomplete; original assertions and previous failures remain preserved.
