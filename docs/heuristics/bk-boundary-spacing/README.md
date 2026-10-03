# BK boundary placement and routing

Parity remains incomplete. Native BK straightening selected candidates in model
edge order; ELK follows physical port order. Native also treated tagged external
port dummies as normal nodes, requiring node spacing between boundary anchors.
ELK uses port spacing between external ports, edge spacing beside long-edge
segments, and label/port spacing beside label dummies. Both policies now follow
the real worker's port traversal and type-spacing table.

The unchanged 100-case hierarchy gate improves **24 to 50 complete matches**,
with zero engine errors and no lost matches. Differing values fall **2,324 to
1,607**. Inputs, preserved failures and 5e-13 tolerance remain unchanged.
Seed 3 now matches complete node/port geometry, joined routes and containers in
all four directions; the extra internal boundary bends disappear.

26 new complete geometry oracle regressions protect newly matching cases.
Five spacing regressions protect tagged external-port type selection, symmetry
and the larger individual port-spacing override. Existing assertions remain
unchanged. All 31 new checks fail against the archived 2064833 source and
pass against current source (51/51 focused checks). Full local suite: **2,100 pass / 108 fail / 2,208**, no new failure
names against 2064833. Types, selected format/lint and build pass. Remaining
50 hierarchy mismatches, broader flat failures, and ancestor label assertions
keep the goal active and PR #32 draft. Local suite remains red.

[Before/after/real ELK gallery](./index.html), [complete replay](./report.json),
[BK worker candidates](./worker-phases.json), [suite delta](./validation.json),
[source hashes](./manifest.json), [RIGHT proof](./seed-3-right.png),
[DOWN proof](./seed-3-down.png). Before is the published hierarchy-import-order
report. Gallery inputs/viewBox/scale match. RIGHT/DOWN seed 3 were inspected in
the browser; observed worker geometry matches unmodified real ELK.

Replay: `pnpm test:parity:compound` (expected failing until full parity).
Observe BK phases: `node scripts/parity/trace-bk-worker.mjs docs/heuristics/bk-boundary-spacing/report.json .scratch/bk-trace.json 2`.
Next: remaining hierarchy phase mismatches, then broaden the flat/hierarchical
parity gate. No production elkjs substitution or weakened assertion.
