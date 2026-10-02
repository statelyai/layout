# Random native / real ELK differential results

Native source: `ceef0b107cee294e10f1538ee9f9cea67b43e255`; actual elkjs `0.11.1`. Main fetched before this work: `81363b469e857650527548a5bd356c98727f378e`. The task branch includes that revision. **Parity gate fails.** Geometry correctness is a separate result from crossings and bends.

All 160 native layouts pass the measured geometry invariants: finite complete
orthogonal routes, no leaf-node penetrations, unrelated node/label overlaps,
edge/label penetrations, or self-retracing outside terminal regions. Border
contact and shared tracks remain possible; visual readability is not established.

Every seed generates five flat and five hierarchical profiles, including cycles, loops, parallel and cross-boundary edges, labels, variable sizes, and fixed ports. Degree is bounded at six; ports at four, one per side. All inputs and failed oracle cases remain in the reports. Fresh draws are saved before execution. They become observed cases after this run.

[140-graph replay](random-replay.md) / [raw replay](random-replay.json) and [20 freshly drawn graphs](random-fresh.md) / [raw fresh](random-fresh.json) retain per-graph metrics and every failed gate. Source revision, generator and scorer hashes, and working-tree state are recorded. The dirty marker reflects the uncommitted visual-proof folder during measurement; tracked source matches the revision.

| Native metric, same original 60 inputs ([raw before](random-before.json)) | Before `015b0b5` | After `ceef0b1` |
| ------------------------------------------------------------------------- | ---------------: | --------------: |
| diagonals                                                                 |              2.0 |             0.0 |
| nodeHits                                                                  |              4.0 |             0.0 |
| nodeOverlaps                                                              |              0.0 |             0.0 |
| labelNodeOverlaps                                                         |              0.0 |             0.0 |
| labelOverlaps                                                             |              0.0 |             0.0 |
| edgeLabelHits                                                             |              9.0 |             0.0 |
| selfRetraceLength                                                         |             50.0 |             0.0 |
| edgeCrossings                                                             |           5122.0 |          4816.0 |
| edgeOverlapLength                                                         |          11003.1 |         10967.5 |
| bends                                                                     |           8238.0 |          8383.0 |
| routeLength                                                               |        1737702.2 |       1718044.4 |

Replay: 140 graphs, 126 comparable, 0 native failures, 14 ELK failures. edgeCrossings: Stately better 31, tied 3, ELK better 92; bends: Stately better 12, tied 0, ELK better 114.

Fresh draw: 20 graphs, 17 comparable, 0 native failures, 3 ELK failures. edgeCrossings: Stately better 2, tied 1, ELK better 14; bends: Stately better 2, tied 0, ELK better 15.

Corrections include physical fixed-port ordering; a continuous Java-style random stream from cycle breaking into crossing minimization; Manhattan search for orthogonal routes; valid retry leads in subpixel gaps; hard reservations against self-retracing outside true label/terminal regions; and preservation of unrelated-node spacing during port-side alignment. Reproduced counterexamples are unit regressions.

The existing native implementation still differs from ELK across cyclic ordering, port processing, compound/cross-boundary phase coordination, and route channel allocation. The strict gate requires native geometry invariants plus crossings and bends no worse than ELK per comparable graph. An oracle failure remains unverified. Shared track length, detours, area and the human-authored aesthetic rubric remain additional quality measures; passing this finite gate would not establish universal parity.

[Matching before/after proof](../proofs/random-parity/README.md) preserves graph inputs, dimensions, direction, scale and viewport. The review gallery defaults to native / real ELK comparison.

## Fixed-face replay

[160-graph replay](fixed-face-replay.md) / [raw report](fixed-face-replay.json)
measure clean native revision `bb693a4bf6c8733fab5a8c7d59648c41dd61ec9a`
against elkjs 0.11.1 on the same 16 seeds. All 160 native geometry checks pass;
143 oracle comparisons remain, with 17 ELK errors retained. ELK wins crossings
on 114 cases and bends on 129. **Parity still fails.** Constraint orientation
and fixed-face corrections alone do not close the layout/routing gap.

The full suite at that revision reports 1657 passes and two timeouts: review
graph 8 and the ChangeAwareArrayList compatibility stress fixture. Both still
time out on an unchanged isolated retry. These are unverified checks, not passes.

## Fixed-coordinate correction

Clean revision `bc4e7e2694e013b2f17d0d1a08c863e25e8767d9` preserves
implicit FIXED_POS/FIXED_RATIO coordinates during repair and prevents search
from consuming its own terminal leads. The 30-case affected flat pilot passes,
including seed 155921 / graph 5, which previously exposed a 2px self-retrace
in the coordinate prototype. Source/repository types and 208 focused tests pass.

[Fresh ten-graph evaluation](fixed-coordinate-fresh.md) /
[raw report](fixed-coordinate-fresh.json): seed 1495461400 was drawn and saved
before execution. All ten native geometry checks pass, with no engine errors.
ELK wins crossings on seven and bends on nine. **Parity still fails.** These
observed cases are retained for future replay; they are no longer holdouts.

The subsequent [native-only 160-input diagnostic replay](fixed-coordinate-native-replay.json)
passes all native geometry checks and finds no synthetic endpoint-reference leaks.
It reuses exact saved inputs/options and the prior real ELK oracle measurements.
It started from the working tree subsequently committed as bc4e7e2; a cosmetic
unused-binding rename followed module loading. This is not a clean frozen
full-engine benchmark; the fresh comparison above is independently frozen.

edgeCrossings: total 14359 → 14219; 56 cases improve, 43 regress. Against retained oracle outputs: 25 native wins, 7 ties, 111 ELK wins.

bends: total 22875 → 22810; 48 cases improve, 44 regress. Against retained oracle outputs: 15 native wins, 0 ties, 128 ELK wins.

Seventeen oracle errors remain unverified. **Parity remains incomplete.**

## Inverted-port phase in progress

The native candidate adds same-layer inverted-port dummies before crossing
minimization. Eight real-ELK fixtures cover inverted source/target ports in all
four directions. The initial full run reports 1665 passes and seven failures:
five feedback regressions and two 5-second timeouts. The ELK bug #7 timeout
passes on unchanged isolated retry; the option-fuzz timeout remains unverified.

[Initial random probe](inverted-port-first-probe.json) retains 25 evaluated
inputs and the first failure, seed 155921 / graph 5 (two node overlaps).
Source hashes and dirty base revision are recorded. No resampling. The native
long-edge splitter had exempted fixed-side feedback edges, violating proper
layering after inverted-port insertion. Removing that exemption eliminates the
overlap in the minimized case and restores three feedback fixtures. Four
expansion tests now cover reversed fixed-side edges spanning one and three
layers, endpoint identity, label-dummy retention, and the proper-layer invariant.

Commit `493045b` fixes a separate label-separation defect: moving only one
fragment of a track creates diagonals at retained dummy junctions. Move the
complete collinear track. The regression fails before the change; 22 focused
and compatibility tests pass afterward. The candidate also preserves feedback
turns through post-compaction and chooses label tracks across retained junctions.
Its vertical feedback fixture now passes unchanged, including orthogonality
and clearance outside the route envelope.

The candidate still fails the two-node feedback oracle's exact height:
10 versus ELK's 10.5. It remains uncommitted and is **not parity**. Source and
repository typechecks and changed-file lint pass. A new native-only 160-input
replay is running from the candidate loaded before the subsequent label-track
selection correction; it must not be reported as validation of the final source
or as a frozen real-ELK comparison. Keep both the initial failure and later
results. The strict parity gate remains failed.

A [label-height differential probe](feedback-label-height-probe.json) isolates
the remaining feedback mismatch. Both engines use the same retained input;
label heights vary across 0, 1, 2, 4, and 8. Zero-height bounds match (50 × 9.5).
The height mismatch grows with actual labels: native/ELK heights are 10/10.5,
10.5/12, 14/16, and 22/24. ELK shifts the feedback lane as label height grows;
the native candidate does not reserve equivalent space. The gap is therefore
larger than a rounding discrepancy. Native label position also differs. Next:
trace and port center-label dummy insertion/placement, preserving this sweep
and the original exact assertion.

## Compound boundary roundoff

The [proper-layer diagnostic replay](inverted-port-proper-first-failure.json)
stops at case 110, seed 1791673957 / graph 10: one diagonal and one leaf hit.
This failure survives the subsequent label-track correction. It is retained
without resampling; 50 planned inputs were not evaluated. No source hashes were
captured at that replay's start, so its dirty-source provenance is limited.

The ancestor-to-child edge E36 attaches to the parent's content boundary a few
ulps inside the child's top edge. The router treats legal travel along that
boundary as penetration and emits a diagonal fallback. Commit `05834b3` applies
the existing 1e-10 intersection tolerance to parallel rectangle-boundary checks.
Two minimized source/target tests fail before the correction and pass afterward.
All 216 routing/compound tests, source/repository types, and changed-file lint
pass. The [same original counterexample](compound-boundary-roundoff-probe.json)
now has zero geometry failures, including diagonals and node hits.

A new 160-input diagnostic loads an immutable task-local source snapshot;
its manifest records every source hash before execution. It includes the
uncommitted inverted-port phase and committed roundoff correction. It remains
a native-only diagnostic using retained prior measurements, not a new frozen
real-ELK comparison. Center-label insertion remains an isolated prototype;
its label positions and route joins still differ from ELK. **Parity is incomplete.**

## Completed frozen native replay

The [hashed source snapshot replay](inverted-port-roundoff-replay.json) completed
all 160 original inputs without geometry failures or synthetic-port leaks.
Every source hash was rechecked after completion. This snapshot includes the
uncommitted inverted-port phase and the roundoff correction; it does not include
the isolated center-label prototype. No inputs were resampled.

Against retained native measurements, total crossings decrease from 14,359 to
13,410 and bends from 22,875 to 22,009. Crossings improve on 82 cases but regress
on 62; bends improve on 98 but regress on 53. Shared edge-track length increases
from 36,523.22 to 36,822.78, with 83 cases regressing. Geometry validity therefore
does not establish aesthetic parity.

Against the retained real-ELK measurements, ELK still wins crossings on 105 and
bends on 128 of the 143 comparable inputs; 17 prior oracle errors remain separate.
This is a native-only diagnostic, not a fresh full-engine benchmark. The strict
parity gate remains failed. The remaining center-label prototype mismatch is
already visible before routing: at label height 1 the feedback label is at
y=6 versus ELK's 6.5, and post-compaction chooses a different horizontal position.
Continue porting the native label and placement phases without altering assertions.

## Minimum edge spacing

Direct instrumentation of real elkjs 0.11.1 confirms that its two center-label
dummies use edge-edge spacing 2 even when the input requests 1. ELK's
GraphConfigurator clamps this graph option to a minimum of 2 before its phases.
Native layered preprocessing now applies the same clamp without mutating caller
options. A five-value long-edge oracle regression covers 0, 1, 1.9, 2 and 4;
the three sub-minimum cases fail before the correction and pass afterward.
A clean source snapshot containing only this correction passes all 55 spacing,
individual-spacing and direction/feedback tests. Current uncommitted phase work
still reports 54 passes and the original exact 10 versus 10.5 feedback failure.
Source/repository typechecks and changed-file lint pass.

The [isolated label prototype sweep](center-label-minimum-spacing-probe.json)
now matches real-ELK bounds at all five retained heights: 50 × 9.5, 50 × 10.5,
50 × 12, 50 × 16 and 50 × 24. This is not production label parity: label x
positions, route joins, label switching/removal and exact phase timing still
differ. The source hashes for this prototype were captured after its probe;
it predates the compound-boundary roundoff correction. Preserve that distinction
from the completed pre-clamp 160-input native replay.
