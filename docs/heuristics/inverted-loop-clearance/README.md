# Inverted-port channels

The native inverted-port branch used endpoint anchors to choose its turn, omitting occupied-layer self-loop clearance and the canonical orthogonal channel rank. The channel pass now includes same-layer links on both flow faces and the first/last exterior boundaries. Cycle breaking also changes which physical endpoint is the source: the native integration now retains that direction instead of using authored direction for same-layer links.

Default DOWN seeds 3/23 and directional seeds 43 RIGHT, 33 LEFT, 43 LEFT and 63 RIGHT now match complete real ELK geometry. Seed 63 RIGHT previously had 66 differing values. The [equal-scale gallery](./fixtures/index.html) and [browser proof](./before-after.png) retain before/native/ELK geometry; [real worker phases](./fixtures/worker-phases.json) capture seed 63 RIGHT.

| Strict corpus                | Before matches | Current matches | Before differences | Current differences |
| ---------------------------- | -------------- | --------------- | ------------------ | ------------------- |
| Default flat 100             | 49             | 51              | 8014               | 7649                |
| Directional seeds 1–25, 200  | 145            | 145             | 9203               | 8870                |
| Directional seeds 26–50, 200 | 137            | 140             | 10002              | 9413                |
| Directional seeds 51–75, 200 | 136            | 137             | 7950               | 7535                |

Combined directional: **422/600**, **25818** differing values, zero native exceptions. No complete match is lost; eleven incomplete rows have more differences. All 102 changed rows, including those worsened cases, are retained in [delta.json](./delta.json). Each sparse report stores indexed updates to its named committed BK-block baseline. Recursive reconstruction of all 700 comparison rows was verified exactly. Thirteen ELK exceptions and non-finite reference results remain failing. **Parity remains incomplete.**

A separate compaction interaction left degenerate self-loop corners at stale coordinates when the owner moved. Unowned collinear-loop corners now move with the node; existing collected spans retain their prior compaction ownership. Eight tests covering four directions and LEFT/RIGHT compaction fail before the correction and pass after. [Before results](./degenerate-loop-before.json) preserve that evidence.

Canonical in-layer records also exposed duplicate junction processing: a fallback record claimed a junction, then a second record erased it. Fallback records now exclude edges already covered by canonical routing. Seed 33 RIGHT with LEFT compaction retains its original complete-geometry assertion and passes.

Validation:

- [54 regressions](./regressions.json): six clearance/spacing cases, four gained directional cases, eight degenerate-loop ownership cases and 36 exterior-channel compatibility cases. The compatibility cases already pass before the boundary integration; they do not independently prove that new behavior. [Reversal-before results](./reversed-regressions-before.json) show two failures before physical-direction handling, with all four passing afterwards.
- [252 targeted checks](./combined-targeted-tests.json) include 200 existing shared-port comparisons.
- Full suite: **2808 pass / 101 unchanged failures / 2909 total**. [Suite delta](./suite-delta.json) confirms no new failures. Source/repository types, selected lint/format and build pass; the existing mixed-export warning remains.
- Additional forced-node-order exterior graphs: [4/12 matches, eight failures](./ordered-boundary-report.json). These twelve inputs are additional coverage, outside the 700-case table. Two backward source ports and two to four target nodes expose remaining placement and routing disagreement without excessive port counts.

```sh
pnpm exec vitest run test/oracle-inverted-loop-clearance.test.ts test/oracle-inverted-boundary-channels.test.ts test/oracle-inverted-reversed-channel.test.ts test/compaction-degenerate-self-loop.test.ts --exclude '.scratch/**' --maxWorkers=4
pnpm exec vitest run --exclude '.scratch/**' --maxWorkers=4
pnpm exec tsx scripts/check-flat-parity.ts
pnpm exec tsx scripts/check-directional-compaction-parity.ts
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/expanded.json 26 50
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/fresh.json 51 75
```

Next: trace the first divergent stage in the ordered exterior graphs, then remaining incomplete flat/hierarchical cases and the eleven worsened rows. Canonical physical-port traversal, placement/alignment and wider options still require comparison against real ELK.
