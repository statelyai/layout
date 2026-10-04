# Physical port margins during compaction

The compactor previously constrained node bodies alone. Real ELK includes physical port margins in its hitboxes. Synthetic compound boundary ports extend 5 layout units beyond their owner; omitting that reservation shifted subsequent nodes and routes by 5 units. Native compaction now reserves physical port boxes on both axes, mirrors flow margins for LEFT/UP, and preserves original node dimensions and endpoint anchors.

Margins use placed node dimensions, including when a saved phase input has no size map. Both saved dummy-cycle regressions remain passing. Placement and compaction retain separate node content and hitbox rectangles.

Forty full-geometry fixtures cover incoming/outgoing compound edges, four directions and five compaction strategies. Before ebf84cb: 0/40 matches; current: 40/40. [Fixture gallery](fixtures/index.html) preserves identical before/current/oracle inputs and equal scale; [matching image](before-after.png) shows the outgoing RIGHT/LEFT-strategy case.

The unchanged 200-graph directional corpus improves from 8/200 to **64/200** full matches: hierarchy 0 to 56/100; flat remains 8/100. Differences decrease from 16,186 to 14,620. No complete matches lost; zero native errors. Six real ELK errors remain included. [Random gallery](index.html), `before.json` and `report.json` preserve all inputs, routes, errors and differences at tolerance 5e-13. `worker-phases.json` retains the seed-1 real ELK trace used to locate the missing margin.

Full suite: **2,335 passed / 106 failed / 2,441**. No failures introduced or resolved relative to ebf84cb; 40 new tests pass. `full-suite.json` and `validation.json` preserve results and exact delta. Source/repository types, selected format/lint and package build pass. Broad parity remains incomplete; remaining routing and placement differences remain asserted.

```sh
pnpm exec vitest run test/oracle-compaction-port-margins.test.ts test/compaction-dummy-cycles.test.ts --maxWorkers=2 --exclude '.scratch/**'
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/directional-parity/report.json
```

The random gate exits nonzero until every graph matches. Original flat, hierarchy and fixed-port-loop corpora remain independent gates.

Original gates rerun: flat 32/100 (10,625 differences), hierarchy 72/100 (832), fixed-port loops 100/100 (zero differences). Zero engine errors; no complete matches lost. Full results remain in `original-*.json`.
