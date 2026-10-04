# Loop envelopes before placement

Parity remains incomplete. Native routing relocated all nodes below an implicit
loop, after BK had already selected placement. Loop connectivity also consumed
ordinary flow-port ranks, and DOWN/UP loops used a physical NORTH route instead
of the layout direction transform.

Movable implicit orthogonal loops now reserve canonical envelopes during block
alignment, compaction, class separation and deferred straightening. Placement
normalization retains that space. Routing preserves those placed rectangles and
transforms canonical loop routes in all four directions. Ordinary flow ranks and
node flow alignment exclude restored movable loop ports. Custom placers retain
the previous reservation path. Fixed/shared ports retain their existing path.

Unchanged flat gate: **16 to 22/100** complete matches, **13,643 to 11,692**
differing values, zero errors or lost matches. Hierarchy stays **72/100**, 832
differing values; fixed-port loops stay **100/100**. All inputs, failures and
5e-13 tolerance remain preserved. Production stays native.

42 complete-geometry regressions pass: 36 direction/distribution/order loop
combinations, seed 11 in all directions, and seed 14 horizontally. Archived
5bb70e5 passes nine and fails 33. Final full suite: **2,171 pass / 108 fail /
2,279**, no new failure names. Source/repository types, selected format/lint and
build pass. Initial regressions and their rerun remain preserved.

Inline loop labels retain the existing labeled-loop phase. Its heuristic asking
for a label above a DOWN loop differs from real ELK, which places that label to
the left. The oracle's label bottom is 86 while owner top is 12 for the preserved
fixture. No assertion is weakened. Inline label envelopes/ownership, explicit
mixed loop ports, other placers and broader label parity still need work.

[Before/native after/real ELK](./index.html), [all flat outputs](./report.json),
[hierarchy replay](./hierarchy.json), [fixed-loop replay](./self-loops.json),
[red regressions](./before-regressions.json), [green regressions](./after-regressions.json),
[full suite](./full-suite.json), [initial suite](./initial-full-suite.json),
[regression rerun](./regression-recheck.json), [validation](./validation.json),
[source hashes](./manifest.json), [seed 1 candidates](./seed-1-native-candidates.json),
[inline-label oracle limitation](./inline-label-oracle-limit.json),
[DOWN seed 11 full visual proof](./seed-11-down.png).
Before remains [the prior flat replay](../bk-directional-anchors/flat/report.json).
Equal inputs/viewports/scale verified; DOWN seed 11 was browser-inspected in full.

Seed 1's chosen BK candidate now agrees with ELK for every normal and long-edge
node before routing. Its first routing gap remains 10 pixels narrower. Next:
trace orthogonal segment creation, dependency/rank order and RNG ownership on
that unchanged failure. PR #32 stays draft; goal active.
