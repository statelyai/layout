# Hyperedge dummy merging

Real ELK merges adjacent long-edge dummies belonging to the same connected physical hyperedge before placement. Native previously placed and routed every dummy separately, even when edges shared a port. The new phase follows port connectivity, keeps label-chain source/target restrictions, redirects segment endpoints without discarding original edge identities, and preserves selected port orders. Routing groups merged dummy ports into one hypersegment.

Junction reconstruction now considers only routing tracks actually spanned by a straight edge. It also retains intersections of straight backbones with intermediate tracks after long-edge joining removes collinear anchors. Previously physical-port fan-outs missed branch junctions and gained junctions beyond a straight edge's extent.

All 24 focused complete-geometry fixtures match real elkjs 0.11.1: 3/4/5-node fan-outs in all four directions, with explicit shared ports or implicit merging. Archived c802afe passes 12 and fails 12; current passes all 24. `red.json`/`green.json` preserve those results. The fixture gallery's before geometry comes from archived a3758d0, whose subsequent feedback-only changes do not affect these acyclic inputs.

The unchanged random flat gate remains 32/100, but differing values decrease from 11,231 to 11,070. Hierarchy remains 72/100; fixed loops remain 100/100. No previous complete matches lost. Full suite: 2,205 passed, 108 existing failures, no introduced failure names versus c802afe. Source/repository types, selected format/lint and package build pass. Browser inspection of the five-node physical-port fixture confirms native and real ELK at equal scale.

`report.json` preserves all 100 random flat inputs, native/oracle outputs and differences. `worker-phases.json` observes real ELK for random seed 2 RIGHT. `fixtures/` preserves complete focused inputs and both engine geometries. The first merge-only replay (10,885 differences) and final corrected junction replay (11,070) remain in `.scratch/`; the committed final report includes the actual current source.

```sh
pnpm exec vitest run test/oracle-hyperedge-dummy-merger.test.ts --maxWorkers=2
pnpm test:parity:flat
pnpm test:parity:compound
pnpm test:parity:self-loops
node scripts/parity/trace-routing-worker.mjs docs/heuristics/feedback-straightening/report.json .scratch/seed-2-worker.json 1
```

Broad parity remains incomplete. Fixed-port north/south layout, margins, labels and compound divergences still require work. Original assertions and failed inputs remain preserved.
