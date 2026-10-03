# Directional BK parallel anchors

Parity remains incomplete. Native BK cached the source's first parallel edge in
both traversal directions. ELK selects the first connection by walking the
current node's clockwise ports. The reverse sweep now independently selects the
target's connection, retaining physical anchors at both ends.

Unchanged hierarchy gate: **60 to 72/100** complete matches, **1,503 to 832**
differing values. Unchanged flat gate: **12 to 16/100**, **14,741 to 13,643**
differing values. No errors or lost matches. Fixed self-loops remain **100/100**.
All original inputs, failures and 5e-13 tolerance remain preserved.

16 newly complete cases have full geometry/route-container regressions: flat
seed 15 in all directions; hierarchy seed 24 in all directions, 23 horizontally,
and 6/14/25 vertically. All 16 fail on archived 3a42b66 and pass afterward.
Selected suite: **80/80**. Full suite: **2,129 pass / 108 fail / 2,237**, no new
failure names. Source/repository types, selected format/lint and build pass.
Production stays native; PR #32 stays draft.

[Hierarchy before/native after/real ELK](./index.html), [hierarchy replay](./report.json),
[flat comparison](./flat/index.html), [flat replay](./flat/report.json),
[self-loop replay](./self-loops.json), [red regressions](./before-regressions.json),
[green regressions](./after-regressions.json), [full suite](./full-suite.json),
[validation](./validation.json), [source hashes](./manifest.json),
[seed 1 native phase candidates](./seed-1-native-candidates.json).
Before snapshots remain [hierarchy](../port-aware-greedy/hierarchy.json) and
[flat](../port-aware-greedy/report.json). Identical inputs/viewports/scale verified.
RIGHT hierarchy seed 24 and RIGHT flat seed 15 were browser-inspected.

Seed 1 drops from 340 to 177 differences. Its chosen LEFT UP BK candidate now
matches ELK's normal-node coordinates before routing. A later blanket loop
reservation shifts lower nodes by 10 pixels. The RIGHT DOWN candidate also lacks
ELK's pre-placement loop margin. Next: model loop envelopes before placement and
remove the later blanket relocation, retaining fixed-port anchors and original
routing failures. Broad parity remains incomplete; goal active.
