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
