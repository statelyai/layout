# Port-aware greedy switching

Parity remains incomplete. Seed 1 matched ELK's sweep order before native greedy
switching swapped a normal node and a long-edge dummy. The native counter used
node centers and discarded crossings between different ports on the same node.
It now counts selected physical port order, keeping shared named ports together.
Self-loop connectivity no longer consumes crossing sweep ranks, matching ELK's
preprocessor detachment. This does not yet port all in-layer, north/south and
hierarchy parent-port counters.

Unchanged flat inputs: **12/100** complete matches, **14,813 to 14,741** differing
values, no errors or lost matches. RIGHT seed 1 improves 360 to 340 differences;
it still differs in placement and routing. Hierarchy remains **60/100**, 1,503
differences; mixed fixed self-loops remain **100/100**. All failures and the
5e-13 tolerance remain preserved. Production stays native.

Both new crossing regressions fail on archived 299f0bc and pass afterward.
Full suite: **2,113 pass / 108 fail / 2,221**, no new failure names. Source and
repository types, selected lint/format and package build pass. Existing failures
remain red; no broad parity claim.

[Before/native after/real ELK](./index.html), [all flat outputs](./report.json),
[prior outputs](./before.json), [hierarchy replay](./hierarchy.json),
[self-loop replay](./self-loops.json), [suite](./full-suite.json),
[red regressions](./before-regressions.json), [green regressions](./after-regressions.json),
[validation](./validation.json), [source hashes](./manifest.json),
[seed 1 oracle phase observations](./worker-phases.json).

RIGHT seed 1 was browser-inspected at equal scale. The next divergence is
placement/routing after the selected crossing order; fixed-side/in-layer and
deep hierarchy coverage still need work. PR #32 stays draft; goal active.
