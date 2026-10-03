# Fixed-port self-loop parity

Verified draft snapshot; broader parity incomplete. Mixed explicit/implicit
self-loops discarded their fixed port anchors, reserved space on a default north
side and reconstructed inter-node junctions from a same-node loop. Routing now
preserves both anchors and routes around the occupied perimeter in canonical
coordinates. Endpoint ownership drives loop bounds and junction exclusion.

**100/100 bounded random fixed-port self-loops match real ELK completely**, up
from 0/100 before: root/node/port geometry, route points, containers and junctions,
unchanged 5e-13 tolerance. The same original inputs are used before and after.
The generator bounds node dimensions and uses a single inset fixed port. This
supplementary gate does not represent broad flat or hierarchy parity.

132 focused comparisons pass: all four directions, all four explicit faces,
both explicit endpoint roles, plus 100 seeded inputs. A further ancestor-edge
regression verifies actual descendant attachments and finite orthogonal joined
segments. Original two-bend/label checks remain unchanged and failing. The old
ancestor route ended on the parent header; corrected routes reach the child.
The original complex fixture still triggers an error in real ELK, preserved in
`ancestor-probe.json`. A separate empty-label probe confirms native and real ELK
both ignore dimensions on labels lacking text; no new label interpretation was
introduced to satisfy the aesthetic checks.

Full local suite: **2,064 pass / 108 fail / 2,172**, no new failure names versus
the preceding prepared-scope snapshot. Two earlier compound-label failures
remain introduced relative to 21a622d; four earlier label-corridor failures
resolve. Types, selected format/lint and package build pass. Broad hierarchy
remains **24/100**, with every complete native output unchanged, zero engine
errors and 2,596 differing values. Keep PR #32 draft; no broad parity or remote
CI success claim.

[Before/after/real ELK gallery](./index.html), [complete self-loop replay](./report.json),
[original failures](./before.json), [hierarchy replay](./compound-report.json),
[full suite delta](./full-suite-delta.json), [worker observations](./worker-phases.json),
[source hashes](./manifest.json), [source and validation](./source-and-validation.tar.gz).
RIGHT/DOWN seed 1 were browser-inspected and captured at equal input, node sizes,
viewBox, scale and viewports. Observational worker output matches unmodified ELK
output after excluding transient $H identifiers.

Replay: `pnpm test:parity:self-loops`. Failures and engine errors are retained.
The saved before snapshot uses the preceding prepared-scope source archive;
no original failure, assertion or random input was weakened or resampled.

Next: remaining ancestor label/bend policies and hierarchy differences, including
non-flow-side/feedback sweepiness, nested boundaries, labels/junctions and the
public compound entry point. The active goal remains open.
