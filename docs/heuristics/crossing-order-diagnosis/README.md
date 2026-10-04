# Crossing-order diagnosis

Parity remains incomplete. Production source is unchanged from `2f605d0`.

Seed 17 RIGHT diverges before compaction. Native places the inverted e10 target and ordinary e7 dummy above n0; real ELK places their merged group below n0. Likewise, native puts e7's inverted target above n1, while ELK keeps it below. The native top group consequently retains a zero-height inverted dummy; ELK's top e1/e5 group retains a one-pixel long-edge dummy. Changing retained dimensions would hide the ordering difference: ELK's merger does not resize its survivor.

The successful before/after compaction traces are in [the preceding proof](../port-aware-tracks/worsened-compaction-trace.json). A failed-solver fallback does not explain these cases.

Native crossing scores omit terms present in ELK's `AllCrossingsCounter`: same-layer crossings and north/south port crossings. An experimental same-face interval counter was tested in both sweep selection and greedy switching. It changes layouts but does not increase complete matches:

| Corpus                             | Before | Experiment | Differing values before / experiment |
| ---------------------------------- | ------ | ---------- | ------------------------------------ |
| Default flat, 100                  | 43     | 43         | 8,957 / 8,908                        |
| Directional flat/hierarchical, 200 | 141    | 141        | 9,938 / 9,973                        |

No complete matches were gained or lost. Individual incomplete cases improve and worsen. The experiment was rejected and reverted; reduced aggregate differences do not prove parity. Six reference exceptions remain failures in the directional gate; native exceptions remain zero.

[diagnosis.json](./diagnosis.json) preserves the exact input, native pre/post-merge order, BK candidates, real ELK stages, and every changed experiment row with full input/output/differences. [rejected-experiment.patch](./rejected-experiment.patch) reproduces the tested candidate against the baseline commit. Apply only in a disposable checkout, then run:

```sh
pnpm exec tsx scripts/check-flat-parity.ts .scratch/counter-flat.json
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/counter-directional.json
```

Next: compare native and ELK scores on identical candidate node **and port** orders, including north/south counting. Separate score disagreement from different initial port traversal before implementing a replacement counter. The missing terms are confirmed; their sufficiency as the cause of this layout divergence is unproven.
