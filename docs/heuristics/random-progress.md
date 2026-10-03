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

## Native center-label phase order and connected-port alignment

The [53-case frozen phase differential](center-label-native-phase-probe.json)
uses a source snapshot hashed before execution, with real elkjs 0.11.1 as oracle.
It inserts raw center-label dummies before layering, selects their sides after
crossing minimization, and removes synthetic orthogonal label junctions during
joining. All five retained heights now match bounds, normal-node positions and
route point geometry. None matches label positions under EDGE_LENGTH compaction.
All six RIGHT non-inline side-selection modes match label positions when
compaction is disabled. The full four-direction, inline/non-inline, six-mode
sweep remains preserved: zero of all 53 cases matches every measured field.
This remains an isolated prototype, not production or full serialized parity.

ELK aligns nodes within a layer using connected input/output port counts after
cycle reversal. Native used incident-edge counts and inferred flow from adjacent
layers, which misclassifies same-layer inverted-port junctions. The native phase
now retains its orientation privately and counts distinct connected ports. This
places the five-height prototype's inverted junctions at the same node centers
as ELK. The [four shared-port fixtures](shared-port-alignment-probe.json) originally
fail in every direction; RIGHT/DOWN now match flow positions, while LEFT/UP
retain a 20-pixel whole-graph extent/route-channel difference. Their absolute
assertions remain intact. The original feedback height assertion remains failed.

Focused current-source verification, excluding ignored scratch source copies:
26 passes and three failures across 29 tests. Source/repository typechecks and
changed-file lint pass. The connected-port correction and larger inverted-port
phase remain uncommitted. Earlier counts that accidentally included scratch
fixture copies must not be treated as additional source coverage.

Source tracing also confirms that ELK's EDGE_LENGTH horizontal compactor uses
weighted network simplex over node/route separation constraints; native's current
degree heuristic is not that algorithm. Faithful compaction, label-dummy
switching, spline removal and remaining direction transforms still need work.
The [completed immutable prototype replay](center-label-native-random-replay.json)
passed geometry and private-port checks on all 160 retained random inputs.
Source hashes were rechecked after terminal completion. This native-only replay
uses the same saved inputs without resampling; it does not rerun the ELK oracle.
Quality comparisons below include regressions and do not establish parity.

- edgeCrossings: 14359 → 13507; 74 improve, 76 regress.
- bends: 22875 → 22318; 94 improve, 63 regress.
- edgeOverlapLength: 36523.21666666667 → 36416.21666666668; 70 improve, 77 regress.

## Native center-label integration checkpoint

The main native pipeline now inserts center-label dummies before layering,
switches them along their proper long-edge chains after crossing minimization,
then selects sides before placement. Native switching supports all six placement
strategies, including reversed HEAD/TAIL alignment and shared layer-width updates.
The separate wrapped pipeline still needs the same center-label phase coordination.

Strengthened six-strategy oracle fixtures compare both bounds, both node
coordinates, both label coordinates, and every route point/count. All six fail
against the preserved pre-integration source and pass with the local integration.
Four label-junction regressions preserve orthogonal corners in every direction.
The later POLYLINE correction keeps its established dummy-anchor exclusion;
orthogonal corners are preserved only for orthogonal joining. The exact phase
metrics assertion includes the new preprocessing phase; no heuristic assertions
were removed or relaxed. Twenty-four focused tests pass after strengthening. A later 145-test joining/
option-fuzz run restores the two POLYLINE routing fixtures and all 100 option
draws: 144 pass, with the MEDIAN_LAYER fixture timing out at five seconds.
All six unchanged label-strategy fixtures pass on isolated retry with one
worker. The original 145-test run remains recorded with its timeout; the full
integration suite is still failed.

The [full integration run](center-label-integration-test-results.json) remains
failed: 1,653 passes and 36 failures, including two five-second timeouts. It
predates the POLYLINE joining correction and strengthened fixture/timing-contract
tests. Remaining problems include direction-dependent label placement, label
collisions, routing channel differences, and EDGE_LENGTH compaction. These source
changes remain local and uncommitted; the draft PR is not ready for merge.

[Matching before/native/real-ELK image proof](../proofs/random-parity/center-label-switching.svg)
uses the same RIGHT input, node dimensions, shared viewport and scale. The six
saved outputs and source hashes are retained beside the image. For these fixtures,
new bounds, node/label positions and route points match the oracle within the
existing coordinate tolerance. This narrow proof does not replace the failed
random parity gate or establish hierarchy/direction parity. The completed
160-input replay above belongs to the earlier frozen prototype, before switching,
and must not be attributed to this integration.

## Native directional labels and a fresh real-ELK corpus

Native label dummies previously put LEFT/UP input ports on the opposite physical
face. Four custom-initial-router fixtures now check every label port against its
declared physical boundary; LEFT/UP fail before correction, all four pass after.
Vertical label dimensions use a maximum against edge thickness, while horizontal
labels accumulate their heights. Vertical label sides map to the corresponding
physical cross-axis sides. These follow the source phase rules, without a bounds
or half-pixel adjustment. All 16 paired RIGHT/LEFT/DOWN/UP, inline/non-inline,
text/missing-text fixtures now match bounds, node/label coordinates and routes.

The compatibility importer also requires nonempty edge-label text, just like
real ELK. Dimensioned missing/empty labels preserve their authored coordinates
and sizes without reserving layout space. Sixteen exact oracle regressions fail
against unchanged 683f949 and pass in a source snapshot with only that importer
correction. [The retained validation report](empty-edge-label-import-probe.json)
also records four failed legacy assertions that expect textless label boxes to
participate in layout. Their assertions remain unchanged. The clean broader run
has 22 passes and four failures; current local phase fixtures have 42 passes.
Source/repository typechecks, changed-file lint and formatting pass.

[New matching directional image proof](../proofs/random-parity/center-label-directions.svg)
uses identical input, DOWN direction, dimensions, viewport and scale. The paired
outputs and source hashes are saved alongside it. The larger native phase,
including direction/port corrections, remains uncommitted.

A fresh seed was drawn and saved before execution: 3468112780. The current native
source was hashed before build, and hashes were rechecked after terminal
completion. [The complete 10-input real-ELK evaluation](vertical-center-fresh-parity/baseline.json)
retains every graph and output: zero native geometry failures, eight comparable
outputs and two hierarchical oracle errors (expected hierarchical port counts
5 and 1, but found 0). ELK wins crossings and bends on all eight comparable
cases. The strict gate fails. No graphs were discarded or resampled. These
fresh results belong to the uncommitted native phase, not the shipped importer
correction alone. Compaction, crossing minimization, route channels and compound
coordination still need substantial work.

## Weighted compaction foundation (integration rejected)

`src/layered/weighted-compaction.ts` adapts ELK's weighted constraint model to
our existing native network simplex implementation. It rounds lower bounds
upward, disables layer balancing, and connects independent constraint sources
with zero-weight auxiliary edges. Four tests include an exhaustive optimum
comparison for 64 reproducible random four-group DAGs, fractional separation,
disconnected groups, a high-weight edge tradeoff, and explicit cycle rejection.
The helper is internal and is not yet wired into the production pipeline.

A candidate integration replaced EDGE_LENGTH's degree heuristic with weighted
node/route separations and weight-100 endpoint constraints. All 28 existing
post-compaction oracle fixtures passed. The candidate also passed 62 focused
solver/compaction/label/inverted-port tests with one worker. Those fixtures
were insufficient: the [retained ten-graph compatibility probe](weighted-compaction-probe.json)
rejected integration. On saved seed 3468112780, flat graph 1 gained two bends
(24 to 26), and dense flat graph 5 gained a node hit (20 to 21). Crossings
improved on graphs 2–5; those improvements do not excuse geometry regressions.
All five hierarchical adapter outputs have unscorable missing edge sections
in both the frozen baseline and candidate. The raw outputs and conversion
errors remain saved. Real ELK also errors on graphs 7 and 9; no cases were
resampled or omitted. This adapter probe does not replace the complete native
getLayeredLayout gate reported above.

The candidate source was frozen before execution, and every recorded source
hash was checked after terminal completion. The report retains all ten inputs,
raw before/candidate/oracle outputs, metrics, errors, source hashes, snapshot
locations, and the integration patch. The snapshot includes the larger local
uncommitted phase; its results are not evidence for shipped source alone.
The rejected integration was removed from the working pipeline while keeping
the tested solver foundation. Final focused source tests pass 32/32; source
and repository typechecks and new-file formatting/lint pass. The restored broader label/feedback run has 65 passes and five failures across
70 tests; those failures remain unresolved. No green full-suite claim.

Next integration must construct rigid node/port/route groups with offsets,
canonical flow coordinates in every direction, same-edge segment helper
constraints, and the upstream endpoint/inverted-port constraints. Moving
singleton rectangles along physical x is insufficient. Preserve the failed
random examples when validating that replacement. Parity remains unproven.

## Grouped compaction phase (local integration)

The native grouped compaction helper now operates in canonical flow coordinates
for all four directions, groups north/south port leads with their owner nodes,
merges intersecting collinear segments, and creates same-edge helper constraints.
Original-edge and inverted-port weights use the active acyclic orientation and
canonical port faces. Flow spacing uses the separate node/label/edge values
from ELK's Spacings table, rather than cross-axis spacing. Four direct geometry
regressions verify that port leads remain attached, node interiors remain clear,
and no bends or diagonal segments are introduced in RIGHT/LEFT/DOWN/UP.
The helper is committed independently; its integration with the larger local
center-label/inverted-port phase remains uncommitted.

Three diagnosed constraint cycles are retained in the
[first full native probe](grouped-compaction-first-probe.json). A target-position
nudge moved normal nodes after placement without updating their associated dummy
geometry; removing it resolves two cycles in the local phase. The third came
from ordering a route column by a wide node's left border instead of its center.
Using center ordering resolves it. The original assertions remain intact.
Correct flow-axis spacing also restores the previously passing reversed-edge
oracle fixture that initially regressed during this integration.

The [final immutable phase probe](grouped-compaction-final-probe.json) reruns
all ten saved random flat/hierarchical inputs, explicitly using EDGE_LENGTH in
both engines. Full getLayeredLayout outputs, section-aware routes, metrics,
raw real-ELK outputs/errors, settings, and source hashes are preserved. Hashes
were captured before execution and verified after terminal completion. All ten
native outputs have zero measured geometry defects and no native errors.
The two hierarchical ELK errors remain separate, with no resampling.
This experiment evaluates the uncommitted native phase, not shipped source alone.

| Graph | Before crossings / bends | Grouped native crossings / bends | Real ELK crossings / bends |
| ----- | ------------------------ | -------------------------------- | -------------------------- |
| 1     | 4 / 32                   | 0 / 14                           | 0 / 13                     |
| 2     | 4 / 53                   | 3 / 30                           | 3 / 36                     |
| 3     | 12 / 100                 | 13 / 92                          | 23 / 50                    |
| 4     | 17 / 118                 | 10 / 110                         | 8 / 67                     |
| 5     | 148 / 268                | 115 / 276                        | 120 / 183                  |
| 6     | 2 / 46                   | 5 / 55                           | 3 / 28                     |
| 7     | 18 / 89                  | 19 / 102                         | Oracle error               |
| 8     | 106 / 193                | 109 / 190                        | 83 / 136                   |
| 9     | 149 / 214                | 156 / 198                        | Oracle error               |
| 10    | 389 / 287                | 397 / 311                        | 125 / 274                  |

The [matching before/native/real-ELK image](../proofs/random-parity/grouped-compaction.svg)
uses graph 1 with identical input, direction, node/label dimensions, viewport,
and scale. The complete image was visually inspected using a reduced intrinsic
size to avoid QuickLook's cropped thumbnail. Its improved small case does not
establish general parity: the per-graph crossing/bend gate still fails, and
several larger native cases regress relative to the prior phase.

A [separate prospective integration on unchanged committed source](grouped-compaction-clean-probe.json)
also preserves all ten results and passes geometry, but has extensive quality
regressions. It lacks the local center-label/inverted-port prerequisites.
Its hashes were captured during execution and verified afterward; the initial
script's unrelated prototype manifest is explicitly corrected in that report.
Do not treat this as a before-execution source-hash proof or promote that
standalone integration as equivalent to the larger phase.

Current focused source tests pass 66/66 across grouped geometry, weighted solver,
existing post-compaction oracle cases, directional/strategy center labels and
inverted ports. The current option-fuzz/wrapping/component/routing suites pass 132/132.
Together with the twelve additional directional profiles, that run reports
140 passes and four cross-port failures across 144 tests. Source/repository
typechecks and helper/test formatting/lint pass.
The additional [twelve directional oracle profiles](grouped-compaction-directions-probe.json)
retain all strict bounds, node, port, and section assertions: eight pass and four
north/south-port pairs fail. Their placement already differs before compaction;
proper north/south port preprocessing is missing. Existing feedback/label and
legacy textless-label failures remain unresolved. No fully green-suite claim.

The remaining constraint generator still uses pairwise collision tests rather
than ELK's complete edge-aware three-pass scanline, grouped hitbox trimming, and
fractional port adjustment. Those are required, alongside north/south port
processing and route-channel parity. Keep the goal active and the PR draft.

### Native three-pass compaction scanline (2026-10-02)

Replaced the internal grouped helper's all-pairs constraints with ELK's
candidate-neighbor sweep. Separate segment, node, and combined passes use
edge margins, minimum node margins, and port-lead spacing-ignore flags.
The sweep rejects overlapping equal-center hitboxes, with diagnostic geometry
in the error cause. Seven direct sweep tests cover visibility, transitive
constraints, touching borders, center ordering, rigid groups, invalid overlaps,
and empty intervals. The initially authored disappearing-middle expectation
incorrectly demanded a redundant outer constraint; checking the upstream
candidate algorithm showed it retains the transitive pair instead. Corrected
that new unit expectation; existing parity assertions remain unchanged.

The committed helper still has no committed production caller. Its full native
integration uses the larger local uncommitted phase pipeline. This is progress
on the native foundation, not a claim that the production integration is ready.

A frozen source snapshot captured before execution reran all ten saved random
flat/hierarchical graphs, explicitly selecting EDGE_LENGTH for both engines.
Hashes were verified after terminal completion. Before is the previous
`grouped-final-flow` experimental snapshot, not clean Git HEAD. Every input,
complete native/oracle output, error, and source hash is retained in
[scanline-compaction-probe.json](./scanline-compaction-probe.json).
Native geometry metrics remain zero across all ten; real ELK still rejects
hierarchical cases 7 and 9. Quality remains mixed:

| Graph | Previous crossings/bends | Scanline crossings/bends | Real ELK crossings/bends |
| ----- | ------------------------ | ------------------------ | ------------------------ |
| 1     | 0/14                     | 0/14                     | 0/13                     |
| 2     | 3/30                     | 10/49                    | 3/36                     |
| 3     | 13/92                    | 13/91                    | 23/50                    |
| 4     | 10/110                   | 16/115                   | 8/67                     |
| 5     | 115/276                  | 127/274                  | 120/183                  |
| 6     | 5/55                     | 5/55                     | 3/28                     |
| 7     | 19/102                   | 17/102                   | oracle error             |
| 8     | 109/190                  | 109/191                  | 83/136                   |
| 9     | 156/198                  | 154/198                  | oracle error             |
| 10    | 397/311                  | 339/308                  | 125/274                  |

Largest graph overlap length falls from 1531.5 to 99.5. Per-graph crossing/bend
regressions still fail the strict parity gate; no resampling or aggregate-only
success claim. ELK itself has measured node hits in cases 3 and 8.

Current broader validation: 198 pass, two unchanged feedback test assertions
fail out of 200. The vertical cycle now throws invalid scanline hitboxes, which
real ELK already rejects on that exact input; native graceful layout remains
unfinished. Targetless-sink placement still fails. Separate exact grouped
oracle run: eight pass, four cross-port failures unchanged. Source and repo
TypeScript checks pass. No full-suite or remote CI claim.

A new synthetic merged cross-port-column regression also fails with invalid
hitboxes. Its complete strict test source is saved in the probe and retained
locally as `test/grouped-merged-port-column.test.ts`. Do not infer that feeding
already-compacted oracle output back into an intermediate phase is an
ELK-valid pipeline input. Investigate the missing north/south preprocessing,
merged owner grouping, and fractional offsets; do not add arbitrary bends or
weaken attachment assertions to make it green. Full parity remains unproven;
goal active, PR draft.

### North/south port phase and rejected full integration (2026-10-02)

Native `north-south-ports.ts` now creates zero-size same-layer port dummies,
shares a dummy across incoming/outgoing edges of one port, preserves reversed
edge roles and segment/label identity, and records owner layout units and
successor constraints. It preserves seeded random state and reserves unique
private IDs. Side-switch permission suppresses the owner ordering constraint.
Mixed-role dummy ports are input before output. The reconnect helper restores
orthogonal/polyline endpoints with the dummy-row bend and keeps the caller's
routes intact. Dedicated north/south self-loops and splines remain incomplete.

Twenty focused phase tests pass: ten direction/reversal/sharing/route/ID cases
and ten saved random flat/hierarchical input invariant checks. Combined with
scanline/grouped/weighted helpers the current focused run passes 35 tests.
The 20 new phase tests and source typecheck also pass on a clean eb56c69 source
snapshot with only the new helper added, independently of the larger local WIP.
These phase invariants do not prove hierarchy layout parity. Current source
and repository TypeScript checks and focused formatting/lint pass.

A full-source integration experiment adds preprocessing before crossing,
zero-size north/south placement, and endpoint restoration before compaction.
The candidate groups each owner's dummies around it after crossing minimization;
this is explicitly an approximation, not the missing upstream constrained
barycenter/greedy-switch algorithm. **All 12 strict directional oracle cases
pass**, including the four previously failing cross-port profiles, with no
assertion changes. Bounds, every node coordinate, full ports and full edge
sections are compared. The corrected candidate also passes all 132 broader
option/wrapping/component/routing fixtures and its source TypeScript check.
The production pipeline still has no new helper caller; current worktree's
four cross-port oracle assertions therefore remain red.

The first frozen candidate accidentally inserted the main-path edit into the
wrapped path, causing eight wrapping failures and source type failures. Its
124/132 result, complete source, outputs and error log remain retained. The
corrected immutable candidate restores that path and fixes the missing type
import. Source hashes were captured before testing and verified after all
processes completed. These are source snapshots, not Git worktrees.

All ten corrected full native random layouts complete with zero measured
geometry defects, but quality fails the per-graph gate:

| Graph | Before crossings/bends | Candidate crossings/bends | Real ELK crossings/bends |
| ----- | ---------------------- | ------------------------- | ------------------------ |
| 1     | 0/14                   | 1/15                      | 0/13                     |
| 2     | 10/49                  | 10/58                     | 3/36                     |
| 3     | 13/91                  | 56/109                    | 23/50                    |
| 4     | 16/115                 | 15/117                    | 8/67                     |
| 5     | 127/274                | 158/261                   | 120/183                  |
| 6     | 5/55                   | 6/51                      | 3/28                     |
| 7     | 17/102                 | 20/98                     | oracle error             |
| 8     | 109/191                | 92/216                    | 83/136                   |
| 9     | 154/198                | 150/211                   | oracle error             |
| 10    | 339/308                | 365/329                   | 125/274                  |

Before is the scanline experimental snapshot, not clean Git HEAD. The largest
candidate graph was observed live with sustained CPU activity before finishing;
no repeated run or artificial timeout was used to replace its result. Both
oracle hierarchical errors remain separate; no resampling or assertion changes.

Retained evidence:

- [Corrected full native probe](./north-south-compaction-probe.json)
- [First failed integration](./north-south-compaction-first-probe.json)
- [All 12 exact directional comparisons](./north-south-directions-probe.json)
- [Reproducible before/first/corrected source snapshots and replay scripts](./north-south-candidate-sources.tar.gz)
- [Matching before/native/real-ELK visual](../proofs/random-parity/north-south-ports.svg)

The visual was inspected at identical viewport and scale. RIGHT cross ports
change from native 114 x 74 to candidate 64 x 94, matching real ELK 64 x 94.
The narrow success does not justify promoting the full candidate. Port actual
layout-unit constraints and barycenter associates into crossing minimization
next, then rerun these inputs and strict oracle fixtures. Full parity unproven;
goal active, PR draft. No full-suite or remote CI claim.

### Native constrained crossing minimization (2026-10-02)

Port Forster constraint-group merging, stable layout-unit membership, normal-node
constraints, recursive barycenter associates and greedy-switch restrictions.
The initial resolver threw on 134 of 512 seeded intermediate graphs: rebuilding
constraint counts lost the mutable group references retained by ELK. The corrected
resolver matches the unmodified installed elkjs worker on all 512 cases, comparing
complete node order and every resulting barycenter exactly. This is an internal
phase comparison, not complete graph parity. The development-only VM oracle
records its worker hash; production imports no elkjs.

Clean HEAD plus only the new phase/helper/tests passes 31 focused tests and source
TypeScript. The larger local pipeline now passes all 12 exact directional grouped
profiles, resolving four cross-port failures, with unchanged assertions. The
source/repository integration remains uncommitted.

The full integration comparison before the custom-route fix: 1,667 passes /
116 failures before; 1,668 passes / 115 failures after. Five failures resolved;
three Email Drafter cases and custom-route preservation regressed. Post-compaction
was orthogonalizing custom routes, and the old assertion compared against a
mutated caller map. The local fix compacts placement before the custom callback
and strengthens the assertion to preserve the original map and every route point.
After that fix: **1,670 passes / 114 failures / 1,784 tests**. Three new Email
Drafter regressions and 111 shared failures remain. Real ELK also violates that
fixture's endpoint-flow label interval heuristic, and rejects LEFT with invalid
scanline hitboxes. Full inputs/outputs/errors remain saved; no label clamping or
assertion weakening. Source TypeScript passes for the fixed local integration.

The corrected immutable ten-graph native experiment has no measured geometry
defects, but the quality gate still fails:

| Graph | Before crossings/bends | Corrected crossings/bends | Real ELK crossings/bends |
| ----- | ---------------------- | ------------------------- | ------------------------ |
| 1     | 1/15                   | 1/15                      | 0/13                     |
| 2     | 10/58                  | 8/57                      | 3/36                     |
| 3     | 56/109                 | 15/88                     | 23/50                    |
| 4     | 15/117                 | 9/108                     | 8/67                     |
| 5     | 158/261                | 108/271                   | 120/183                  |
| 6     | 6/51                   | 6/51                      | 3/28                     |
| 7     | 20/98                  | 15/97                     | oracle error             |
| 8     | 92/216                 | 94/218                    | 83/136                   |
| 9     | 150/211                | 135/199                   | oracle error             |
| 10    | 365/329                | 376/321                   | 125/274                  |

Before is the prior cross-port candidate, not clean Git HEAD. Six graphs improve
crossings; graphs 8 and 10 regress. Two hierarchical oracle errors remain separate;
no resampling. Full random parity and a green suite remain unproven; PR stays draft.
Next: preserve port/edge visitation order in associated barycenters and compare
label/cross-port intermediate placement against ELK before promoting integration.

Evidence under [crossing-constraints](./crossing-constraints/):

- [512 intermediate inputs, first errors and corrected exact outputs](./crossing-constraints/forster-direct-probe.json)
- [Complete corrected random inputs/outputs/errors](./crossing-constraints/crossing-units-corrected-native-probe.json)
- [12 exact directional profiles](./crossing-constraints/crossing-units-corrected-directional-probe.json)
- [Final full-suite failure delta](./crossing-constraints/final-full-suite-delta.json)
- [Email Drafter native/before/ELK diagnostic](./crossing-constraints/email-crossing-unit-probe.json)
- [Source snapshots and replay scripts](./crossing-constraints/sources-and-replays.tar.gz)

Frozen experimental manifests were captured before their runs and rechecked.
The custom-route-fixed integration archive captures the final source afterward;
it is not a pre-execution attestation. Archive contains source/test trees only,
with no absolute dependency/resource symlinks. Clean phase checks are separate
from the rejected larger pipeline. No remote CI or released parity claim.

### Port visitation and cross-port ordering (2026-10-02)

The native barycenter helper visited all fixed-layer ranks before all same-layer
neighbors. ELK interleaves them in port/incident-edge order, so recursion and
partial sums can change, especially in same-layer cycles. An unmodified real
elkjs LPort/LEdge oracle compares all scores and the next random value on 512
seeded ordered port graphs: **284 exact before, 512 exact after**. Self-loops
remain ignored; associates are visited after incident edges. The local sweep
now supplies ordered visits, preserving edge order inside each shared port.

Cross-port dummy creation also had a distinct ordering bug: native used global
edge encounter order for both layer seed and barycenter associates. ELK creates
input, output, then mixed-role dummies per side, and northern insertion reverses
the creation order in the layer. The fixed-position helper now preserves those
two separate orders. On 256 seeded RIGHT mixed-role north/south port sets,
complete layer and associate order changes from **41 exact to 256 exact**,
against the actual installed NorthSouthPortPreprocessor. This is a phase test;
full directional/hierarchical fidelity remains incomplete.

Clean HEAD plus only the committed phase/helper changes passes **33 tests**
(including the existing 512 exact constraint-group comparisons) and source
TypeScript. Larger pipeline callers remain local/uncommitted. Local directional
grouped profiles remain exact, and source/repository TypeScript and changed-file
format/lint pass.

Both complete native ten-graph experiments retain full before/after/ELK inputs,
outputs, errors and pre-execution frozen source hashes. Crossings and bends are
unchanged on all ten graphs after either correction. Native geometry counters
still report zero defects, but the strict random quality gate remains red. These
are faithful phase corrections, not evidence of full layout/routing parity.

Final sequential full local suite: **1,672 passes / 114 failures / 1,786 tests**.
Exactly the same 114 failure names remain as before this turn. A concurrent run
had 115 failures, including the 512 constraint oracle timing out at the unchanged
5,000ms limit while the full random replay was running. Preserve that failure;
after both jobs finished, the clean focused run and sequential full rerun pass
that same oracle without timeout changes. No assertions or tolerances weakened.

A next routing reproducer is saved: generated default DAG seed 56 matches ELK
placement but native edge e2-3 uses six points where ELK uses four. This isolates
an extra native routing detour to inspect next; no cause or fix claimed yet.

Evidence under [port-visitation](./port-visitation/):

- [512 ordered barycenter inputs and exact before/after/oracle outputs](./port-visitation/ordered-barycenter-direct-probe.json)
- [256 cross-port creation/layer orders](./port-visitation/cross-port-order-direct-probe.json)
- [Complete barycenter random replay](./port-visitation/ordered-barycenter-native-probe.json)
- [Complete cross-port random replay](./port-visitation/cross-port-ordered-native-probe.json)
- [Full-suite failure delta](./port-visitation/full-suite-delta.json)
- [Seed 56 full input/native/ELK routing reproducer](./port-visitation/dag-56-routing-probe.json)
- [Frozen source snapshots and replays](./port-visitation/sources-and-replays.tar.gz)

Source manifests were checked after every process terminated. Archive contains no
absolute dependency symlinks. Both ordering oracle probes record the unmodified
worker hash. PR remains draft; goal active. No full-suite green, remote CI or
complete parity claim.

## Orthogonal cycle ordering and shared routing RNG

Native selected the opposite edge when splitting a critical routing cycle on
saved default DAG seed 56. Ported ELK's weighted segment ordering: its backwards
dependency selects the split source. All 512 seeded dependency graphs match
actual unmodified elkjs worker marks, backwards dependencies and next random
value exactly. This ports cycle ordering; the full segment splitter, merged
hypersegments and regular dependency routing still need work.

Seed 14 exposed skipped greedy-switch RNG initialization and a later graph copy
losing the advanced state. Native now uses seven default crossing attempts,
consumes greedy-switch initialization/direction draws and carries the shared RNG
through inherited phase inputs. All 100 default random DAGs match complete
ELK placement and route geometry, including both saved failures.

Validation: 117 focused local tests pass; clean HEAD plus this selected production
change passes 105 focused tests and source TypeScript. Source/repository TypeScript
passes locally. Full sequential local suite: **1,674 pass / 113 fail / 1,787**.
Compared with the preceding 114 failures, seed 56 resolves; no failures introduced.
No assertion or timeout changes.

The same ten full flat/hierarchical random inputs improve graph 3 from 15
crossings/88 bends to 14/87 and graph 5 from 108/271 to 104/266. Its area drops
from 5,863,526.5 to 4,625,360. The other eight inputs have unchanged quality
scores. Two hierarchy oracle errors remain separate. The broader gate still
fails. This
is concrete default DAG progress, not complete parity. Larger integration remains
local; PR remains draft and the goal active. Next: port the full orthogonal
segment splitter and regular-cycle handling, then replay the saved broader corpus.

Evidence: [512 complete direct oracle comparisons](./orthogonal-cycles/direct-probe.json),
[full random replay](./orthogonal-cycles/native-random-probe.json),
[full-suite delta](./orthogonal-cycles/full-suite-delta.json),
[seed 14 before](./orthogonal-cycles/dag-14-before.json) and
[after](./orthogonal-cycles/dag-14-after.json),
[seed 56 before](./orthogonal-cycles/dag-56-before.json) and
[after](./orthogonal-cycles/dag-56-after.json),
[frozen sources and replay scripts](./orthogonal-cycles/sources-and-replays.tar.gz).

## Complete orthogonal segment splitting and regular-cycle routing

Replaced the approximate critical-cycle detours and direction-specific regular
cycle removal with a native port of ELK's segment dependency creation, critical
split selection, free-area rating/consumption, dependency reconstruction,
regular-cycle reversal and topological track numbering. The core supports
multiple incoming/outgoing connections and split partners. The production adapter
still creates one segment per edge; grouping shared ports into hypersegments
and matching compound boundary handling remain necessary.

All **1,024** seeded mixed segment graphs match the actual unmodified elkjs worker
for complete split geometry, dependency order/weights/types, slots and next RNG
value. Includes source-only, target-only and merged connections; 99 cases split.
The second 512 include fractional and negative coordinates. The first JSON
probe reported 925 equal cases because it compared object key insertion order;
deep strict comparison matches all 1,024, consistent with the unchanged Vitest
assertion. The original probe is retained in the archive.

Initial integration introduced five LEFT routing failures. Native's physical
left-to-right endpoints did not match ELK's logical flow. Converting endpoint
roles and reflecting slots resolves all five without assertion changes. Preserve
the initial full-suite result: 1,670 pass / 118 fail / 1,788. Corrected sequential
full suite: **1,675 pass / 113 fail / 1,788**, with exactly the preceding 113
failure names. All 247 focused local pipeline checks pass; clean HEAD plus this
selected production change passes 236 tests and source TypeScript. Local source
and repository TypeScript also pass.

The same ten saved full random inputs retain zero measured native geometry
defects. Graph 10 improves from 376 to 375 crossings, with 321 bends unchanged;
the other nine retain identical metrics. Two hierarchy oracle errors remain
visible. The broad quality gate still fails: graph 10 has 375 crossings/321
bends versus real ELK's 125/274. PR remains draft; full parity is unproven.

[Complete 1,024 oracle inputs/outputs](./segment-engine/direct-probe.json),
[full native random replay](./segment-engine/native-random-probe.json),
[initial/corrected full-suite delta](./segment-engine/full-suite-delta.json),
[same-scale Stately / real ELK diagrams](./segment-engine/index.html),
and [frozen source/replay archive](./segment-engine/sources-and-replays.tar.gz).
Browser verification confirmed paired diagrams and visible oracle errors.
Next: build the same connected shared-port hypersegments as ELK, then align
compound boundary preprocessing and replay the broader parity corpus.

## Shared-port hypersegments, crossing counts and junctions

Native connected-port creation now follows ELK traversal and segment grouping.
Its shared-port crossing estimate replaces the per-edge estimate for merged
connections; the old counter forced extra sweeps despite ELK reporting zero
crossings. Native ELK-compatible output also emits deduplicated junction metadata.

All 512 grouping boundaries and 512 crossing-count boundaries match the actual
unmodified worker. All 200 end-to-end shared-port graphs (50 seeds × four
directions) match root/node/port geometry, complete routes and junction coordinates.
Before this change, 48/200 matched. Inputs have 2–4 nodes per layer and at most
four connections per port. This establishes that subset, not general parity.

Full suite: 1,877 pass / 113 fail / 1,990; the same 113 failure names as before.
Selected changes on clean HEAD pass 238 focused tests and source TypeScript.
Local source/repository TypeScript pass after correcting a numeric-id test message.

The full saved corpus exposes two new native compaction cycles: graph 3
(seed 3468128618) and graph 5 (3468144456). These are retained as failures,
with the native error visible beside real ELK. Graph 10 also worsens from
375 crossings/321 bends to 384/326 versus ELK's 125/274. Two existing ELK
hierarchy errors remain visible separately. Full parity still fails.
An exploratory physical-order compaction change resolves graph 5 but leaves
graph 3 failing; it is preserved separately and has not been adopted.

[1,024 direct worker comparisons](./hypersegments/direct-probe.json),
[200 full shared-port inputs/outputs](./hypersegments/shared-port-random.json),
[full corpus replay](./hypersegments/native-random-probe.json),
[unchanged full-suite failures](./hypersegments/full-suite-delta.json),
[same-scale native / real ELK proof](./hypersegments/index.html),
and [source/replay archive](./hypersegments/sources-and-replays.tar.gz).

Next: fix compaction ownership/order for inverted-port and label dummies without
dropping constraints, then align compound boundary preprocessing. PR remains draft.

## Join compaction dummies and retain current port topology

Full phase integration now includes center-label insertion/switching, inverted
ports, north/south ports, associated crossing constraints and grouped compaction.
The two saved compaction crashes were caused by compacting LONG_EDGE/inverted
dummies that ELK joins before its compactor. Native compaction now joins unary
chains while retaining LABEL nodes and maps moved tracks back to expanded routes.
No separation or ordering constraints are dropped to break cycles.

Stronger boundary checks exposed a second mismatch: label switching could treat
NORTH_SOUTH_PORT dummies as LONG_EDGE destinations, while restoration consulted
the graph from before switching. Labels now stay off those port dummies and
restoration uses the current expanded graph. The original corrupted boundaries
and failing tests are preserved. Corrected boundaries come from the same random
inputs after fixing preprocessing; their finite/cross-axis/orthogonality/point-count
assertions are unchanged. Both remain cyclic with the old compactor and pass
with joined compaction. No graph was resampled.

Full local and clean selected-source suites both report **1,882 pass / 110 fail /
1,992**. Three preceding email-drafter DOWN/RIGHT/UP failures resolve; no new
failure names. Source/repository TypeScript, selected-file lint and package
build pass. Full parity still fails; the 110 failures remain required work.

The same ten full random inputs all complete with zero measured native geometry
defects. Graph 3 (3468128618) and graph 5 (3468144456) no longer crash. Graph 1
improves 1→0 crossings, graph 4 5→2, and graph 9 149→140. Graph 10 remains
384 crossings/326 bends versus ELK's 125/274; compound parity remains unresolved.
The two existing ELK hierarchy errors are retained separately.

[Full replay](./joined-compaction/native-random-probe.json),
[full-suite delta](./joined-compaction/full-suite-delta.json),
[same-scale native / real ELK diagrams](./joined-compaction/index.html),
and [source/validation archive](./joined-compaction/sources-and-replays.tar.gz).

Next: align compound boundary preprocessing and the remaining label/feedback
geometry against real ELK. Keep PR draft and the goal active.

## Reproducible compound phase baseline

Added a strict 100-case hierarchy gate (`pnpm test:parity:compound`): 25 fixed
seeds × four directions, retaining every cross-boundary input and complete
native/real ELK outputs. At native commit `93293b0`, zero complete matches,
5,612 differing values and zero engine errors. Numeric comparisons retain the
existing 12-decimal oracle tolerance. Endpoint/container ownership and complete
route sections are included, not just crossings or bends.

The real worker trace proves the compound pipeline bypasses component packing
and uses external-port dummies, shared hierarchy phase boundaries and
parent-port geometry transfer. A partial component-only fix was tested and
reverted because it broke the existing explicit descendant-port case. No
production change or claim of hierarchy parity was retained.

[Inputs, differences, rejected experiment and phase diagnosis](./compound-baseline/README.md)
and [100 equal-scale native / real ELK comparisons](./compound-baseline/index.html)
are retained. The native external-port hierarchy foundation remains required.

## Native external-port identity and inherited direction

Native external-port dummy construction matches the installed real worker on
1,536 seeded boundaries, including all factory fields. Compound crossings now
have explicit fixed-position boundary ports and separate-layer constraints,
with origin metadata preserved through native graph conversion. Restoration
uses the child router's actual selected endpoint instead of a midpoint. Child
scopes inherit direction; statechart path scoring honors inheritance and
explicit overrides.

Four direction regressions derived from saved seed 1 fail on `2ddaa1f` and pass
now. The unchanged 100-case hierarchy gate drops from 5,612 differing values to
5,176, with no engine errors and still zero complete matches. The intermediate
5,169 count precedes separate-layer constraints; source-equivalent constraints
are retained despite that aggregate increase. No input is resampled.

Local and clean selected-source suites: **1,891 pass / 110 fail / 2,001**,
identical existing failure names. Six new tests pass. Source/repository
TypeScript, selected lint/format and build pass. An initial clean worker-oracle
runtime error is retained; the unchanged oracle test passes alone and in the
complete final two-worker snapshot run.

[Full source and validation evidence](./external-ports/README.md) and
[100 equal-scale comparisons](./external-ports/index.html) remain red for full
parity. Child-to-parent boundary geometry transfer, internal route joining,
coordinated hierarchy phase scheduling and the public compound solver's shared
foundation remain required.

## Compound boundary transfer experiment (uncommitted)

The unchanged strict hierarchy gate now has **8/100 complete matches**, zero
engine errors and 4,683 differing values. Native boundary transfer matches the
real worker on 1,024 seeded cases. Full seed 1 geometry matches in all four
directions. Layer margins and child/parent route joining replace coordinate
repair shims; four existing wide-port label corridor failures resolve.

The frozen suite reports **1,887 pass / 119 fail / 2,006**: 13 introduced
failure names and 4 fixed relative to the committed baseline. This remains
uncommitted work pending coupled hierarchy sweeps, route metadata restoration
and post-compaction fixed-port attachment. Types, selected lint/format and build
pass; no clean snapshot or fresh browser proof is claimed.

[Complete retained experiment and failure delta](./boundary-transfer/README.md).

## Separate boundary preprocessing and fixed-coordinate routing (uncommitted)

Real ELK traces show separate boundary nodes removed before layer assignment,
FIRST/LAST inferred for otherwise isolated incident nodes, and merging confined
to each descendant port. Those native phases now preserve boundary identity and
use actual fixed-port coordinates for track allocation. Movable ports retain
layer-sweep order. The unchanged 100 inputs now yield **12 complete matches**,
zero errors and **3,665 differing values**. Seed 2 fully matches in all directions.

Frozen suite: **1,892 pass / 118 fail / 2,010**. Compared with committed 21a622d:
12 introduced hierarchy/compound-label failures and four fixed label corridor
failures. Previous uncommitted fixed-port attachment failure resolves. Source/
repository TypeScript, selected lint and build pass. Main remains current. Work
remains uncommitted; coupled crossing schedules and route metadata restoration
are next. No clean snapshot or current browser proof is claimed.

[Full replay, real worker traces and exact failure delta](./boundary-layering/README.md).

## Crossing phase ordering and resumable scopes

The [scope crossing-order proof](./scope-crossing-order/README.md) retains the
unchanged 100 hierarchy inputs: 16 complete matches, zero engine errors, 3,354
differing values. FIRST/LAST ordering now precedes crossing minimization; it no
longer overrides the chosen order afterward. Seed 18 passes complete geometry
and route-container regressions in four directions. The internal generator can
suspend ordinary scopes before crossing minimization and resume with a supplied
order; the compatibility adapter has not yet adopted coordinated parent/child
sweeps. The real-worker observation was checked against uninstrumented ELK.

Final suite: 1,902 pass / 118 fail / 2,020, with no new failure names relative
to the preceding uncommitted snapshot. Earlier hierarchy and label regressions
remain. Types, selected format/lint and build pass. RIGHT/DOWN seed 18 have
matching before/after/ELK browser image proof. Source remains uncommitted; broad
parity is incomplete and the goal stays active.

## Reusable sweep coordinator

[Source, replay and validation](./sweep-coordinator/README.md) preserve the
internal sweep sessions and shared counter coordinator. Standalone minimization
uses that coordinator. Prepared scope trees can enter coupled children between
parent layers and retain their node/port candidates together; seven focused
tests pass. The adapter has not yet connected its hierarchy scopes or boundary
ports to this coordinator, and shared distributor initialization remains open.

Full suite: 1,909 pass / 118 fail / 2,027; no new failure names. The complete
100-case native/oracle outputs are exactly unchanged: 16 matches, zero errors,
3,354 differing values. Earlier introduced hierarchy and label failures remain.
Types, selected lint/format and build pass. Source remains uncommitted and goal
active; no new visual or end-to-end hierarchy improvement is claimed.

## Prepared compatibility hierarchy scopes

[Current source and evidence](./prepared-scopes/README.md) supersede the preceding
coordinator snapshot. The adapter now prepares all scopes before placement,
coordinates boundary port orders, and resumes parents with finished child sizes.
Root and child random streams match observed worker ownership. Port-aware
NetworkSimplex traversal, parallel BK alignment and shared-port anchors fix ten
hierarchy failures. Selected port orders survive implicit routing.

Full local suite: 1,931 pass / 108 fail / 2,039; no new failures this turn.
Two earlier inline compound-label regressions remain versus committed 21a622d.
55 focused tests, types, selected lint/format and build pass. Random hierarchy
matches improve 16 to 24 of 100; no lost matches or engine errors, unchanged
inputs/tolerance, differing values 3,354 to 2,596. Fresh RIGHT/DOWN seed 16
before/after/ELK browser proof is saved. Source remains uncommitted/unpushed;
parity incomplete and goal active.

## Fixed-port self-loop anchors

[Current source and proof](./fixed-self-loops/README.md) correct mixed
explicit/implicit self-loop anchors, occupied-side reservations and endpoint
ownership for bounds/junctions. A new 100-case bounded random self-loop gate
improves **0 to 100 exact matches** with unchanged inputs and tolerance. 132
all-direction oracle comparisons and an actual descendant-anchor/orthogonality
regression pass. Existing ancestor label/two-bend assertions remain red and
unchanged; the original complex fixture's real ELK error remains preserved.

Full local suite: **2,064 pass / 108 fail / 2,172**; no new failures. Types,
selected format/lint and build pass. Hierarchy replay remains **24/100**, with
all complete native outputs unchanged. RIGHT/DOWN seed 1 have matched
before/after/real-ELK browser proof. This verified WIP is published on draft
PR #32; broader parity and the active goal remain incomplete.

## Hierarchy import and boundary order

[Source and proof](./hierarchy-import-order/README.md) align constrained-node
restoration before long-edge splitting, ancestor-first implicit port creation,
and clockwise input-boundary port publication with real ELK. Seed 3's child
matches in all four directions; five new regressions pass. Parent placement and
joined routes remain different and preserved in the complete random gate.

Hierarchy: **24/100 matches**, zero errors or lost matches, differing values
**2,596 to 2,324** with unchanged inputs/tolerance. Full local suite **2,069 pass /
108 fail / 2,177**, no new failure names. Types, selected format/lint and build
pass. Matched-scale seed 3 browser proof saved. Broad parity remains incomplete.

## BK straightening and external-port spacing

[Source and proof](./bk-boundary-spacing/README.md) correct physical port order
for straightening and type-specific external boundary spacing. Root placement
and joined routes now match seed 3 across all four directions. The preserved
hierarchy gate improves **24 to 50/100 complete matches**, no errors or lost
matches, **2,324 to 1,607 differing values**. Inputs/tolerance remain unchanged.

31 new regressions pass. Full local suite **2,100 pass / 108 fail / 2,208**, no
new failure names. Types, selected format/lint and build pass. RIGHT/DOWN seed 3
have equal-scale before/after/ELK browser proof. Broader parity remains incomplete.

## BK compaction thresholds and flat corpus

[Source and proof](./bk-compaction-thresholds/README.md) replace independent
straightening shifts with ELK's compaction thresholds, block state and deferred
retries. Hierarchy improves **50 to 60/100**, zero errors/lost matches, **1,607 to
1,503 differing values**. Ten new full-geometry regressions fail before and pass
after. RIGHT/DOWN seed 4 match in browser comparisons.

New bounded flat corpus covers ports, cycles, self-loops and labels: **10 to
12/100 matches**, no errors/lost matches, **15,081 to 14,813 differences**, same
inputs/tolerance. All failures remain preserved. Final local suite **2,111 pass /
108 fail / 2,219**, no new failures; two initial timeouts clear unchanged in
isolation and in the final complete run. Types, selected format/lint and build
pass. Broad parity remains incomplete and the goal active.

## Port-aware greedy switching

[Source and proof](./port-aware-greedy/README.md): remove self-loop connectivity
from crossing ranks and count selected neighboring ports during greedy swaps.
Flat gate remains 12/100, differences 14,813 to 14,741, no lost matches/errors.
Hierarchy 60/100 and fixed self-loops 100/100 unchanged. Two red/green regressions;
full suite 2,113 pass / 108 fail, no new failures. Parity incomplete; next trace
placement/routing after crossing order and remaining in-layer/hierarchy counters.

## Directional BK parallel anchors

[Proof](./bk-directional-anchors/README.md): reverse BK alignment independently
selects the current target's first clockwise port connection. Hierarchy improves
60 to 72/100 and flat 12 to 16/100, zero errors/lost matches. All 16 new full
geometry regressions fail before and pass after. Full suite 2,129 pass / 108
existing failures. Next: pre-placement loop margins and post-placement blanket
loop relocation; seed 1's chosen placement now agrees before routing.

## Loop envelopes before placement

[Proof](./loop-envelopes/README.md): movable implicit loops reserve canonical
margins before BK alignment/compaction and route through the direction transform.
Their restored ports no longer consume ordinary flow ranks. Flat improves 16 to
22/100 (13,643 to 11,692 differences), no errors/lost matches; hierarchy 72/100
and fixed loops 100/100 unchanged. 42 full geometry regressions pass, 33 red on
5bb70e5. Full suite 2,171 pass / 108 existing failures. Inline loop label behavior
remains in its old phase; original assertions unchanged. Next: seed 1's first
orthogonal routing gap, 10 pixels narrower despite matching chosen BK placement.
