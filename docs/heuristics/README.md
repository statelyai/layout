# Heuristic review corpus

> Raw parity and gate evidence (per-round reports, renders, logs) lives on the
> [`heuristics-evidence`](https://github.com/statelyai/layout/tree/heuristics-evidence/docs/heuristics)
> branch; links in these READMEs to files that are missing here resolve there.
> This directory keeps the READMEs, the quality corpora (`quality-corpus/`,
> `quality-holdout/`), the latest gate rows (`quality-compound-candidates/*.json.gz`)
> and the files tests read.

<!-- generator behavior and bounds from scripts/generate-heuristic-corpus.mjs -->

Generate ten seeded graphs with native Stately layered layout and real elkjs
layered comparisons:

```sh
pnpm build
node scripts/generate-heuristic-corpus.mjs 20261001
```

Open `generated/index.html` for numbered graphs, a default side-by-side Compare view, Stately/real-ELK tabs, zoom controls,
hover IDs, and editable observations. Tabs support arrow keys, Home, and End. Both layouts remain visible in Compare; zoom applies equally. Each graph has a shared geometry metric table, including intersections, crossings, shared track length, and bends. Native diagnostics are separate from shared measurements.
The oracle is the installed `elkjs/lib/elk.bundled.js` runtime, never the Stately compatibility facade. Its version is visible and saved in the corpus and exported notes. Both engines receive the same graph, node/label sizes, direction, fixed port
positions, and node/layer spacing. Each pair uses one shared viewport/scale.
ELK hierarchy uses `INCLUDE_CHILDREN`; compound padding reserves the same
36px header and 24px inset. Engine-specific defaults otherwise remain in effect.
Notes are stored in browser local storage when
available; download review notes to preserve or share them.
`generated/corpus.json` records inputs, seeds, options, source revision,
output geometry, section-aware routes, and raw ELK output. Stately SVGs preserve
its explicit label gaps; ELK sections render directly. Per-engine captions show
blocked routes, budget failures, diagonal segments, and route conflicts. These
counts are diagnostics, not
a full aesthetic score. Judge routing as well as nodes and labels.

Five flat and five hierarchical profiles vary density, direction, cycles,
self-loops, parallel edges, sizes, ports, and hierarchy depth. Hierarchical
profiles include cross-boundary and parent/child edges. Leaf sizes are
80–160 × 48–100; nodes have at most four ports (one per side) and degree six.
The disconnected profile reserves an isolated leaf. Profile constraints
stratify coverage; these are not uniformly sampled arbitrary graphs.
Layout failures are recorded and cause a nonzero exit, never resampled.

The initial acceptance goal is ELK-level human readability on identical inputs,
including edge routing. Passing validity checks alone does not establish parity.
Compare crossings, retracing, shared tracks, bends, detours, label clearance,
node placement, and compactness separately; an aggregate score must not hide a
regression in a critical criterion. Use the authored rubric for visual judgment,
then validate on fresh held-out seeds across the same complexity profiles.
ELK's own defects are not acceptable correctness targets, and unavoidable
crossings remain graded penalties. Record parity as unproven until that review
and held-out evaluation pass.

Author the aesthetic rules before changing the algorithm. For each rule,
record severity, applicability, exceptions, and an example graph/element ID.
Keep validity invariants separate from graded aesthetic penalties. Crossings
are a penalty, not a universal pass/fail rule. Preserve failing seeds, minimize
counterexamples, and evaluate improvements on fresh held-out seeds as well as
this review corpus. Ten examples bootstrap the rubric; they cannot establish
general layout quality. Other native algorithms need capability-specific
checks when the testing harness is extended.

## ELK baseline

```sh
pnpm build
node scripts/benchmark-heuristic-layout.mjs
# Draw 60 fresh graphs; save seeds before running; fail on parity gaps.
node scripts/benchmark-heuristic-layout.mjs docs/heuristics/generated/fresh --random-seeds 6 --check-parity
# Replay those exact seeds (ten complexity profiles per seed).
node scripts/benchmark-heuristic-layout.mjs docs/heuristics/generated/replay SEED1 SEED2 --check-parity
```

The runner builds current Stately source before generating and scoring 30 graphs: review seed `20261001` plus fresh seeds
`20261102` and `20261203`, each with the same ten complexity profiles. Optional
arguments are output directory followed by base seeds. For example:

```sh
node scripts/benchmark-heuristic-layout.mjs .scratch/baseline 20261001 20261102 20261203
```

The generator also accepts an optional output directory after its seed.
The benchmark writes `baseline.json`, `baseline.md`, and one comparison gallery
per seed under `generated/baseline/`. Layout failures remain recorded and cause
exit status 1. Frozen initial measurements are in [baseline.md](baseline.md)
and [baseline.json](baseline.json); these are evidence, not passing targets.
Fresh samples become observed evaluation cases after running; future acceptance
requires additional unseen seeds and human review.

Both engines use `scripts/heuristic-quality.mjs`. It projects nested coordinates
into world space and reports missing nodes/routes, non-finite geometry,
diagonals, unique edge/leaf penetrations, unrelated node overlaps, label
collisions, edge/label penetrations, collinear self-retracing, proper crossings,
shared track length, bends, visible route length, and total geometry area.
Crossings are unique interior intersections per edge pair; endpoint touches
and T-junctions are not counted. Shared lengths are unioned per edge pair;
intentional sharing within 12px of a common endpoint node is excluded.
Self-loop retracing excludes that same terminal region. Each engine's own label
rectangle is clipped out of its route, so ELK's continuous paths and Stately's
label gaps are scored consistently. Container containment is allowed; label
collisions are checked against leaves. Crossings and shared tracks assume
orthogonal paths; diagonals are a separate validity failure. Bend counts use
explicit direction changes within sections. Lengths and areas use layout units.

Engine diagnostics do not affect scores. Summary comparisons include only cases
where both engines return a layout; failures remain listed separately. Reports
retain individual metrics,
engine failures, source revision, working-tree state, elkjs version, and scorer
and generator hashes. They do not measure runtime or establish aesthetic parity.

The [routing repair report](after-routing-repair.md) and [raw results](after-routing-repair.json) preserve the same 30 inputs and scorer after the correctness fixes. The initial baseline remains unchanged. Matching visual proof is in [native routing repair](../proofs/native-routing/README.md).

<!-- random comparison gate from scripts/benchmark-heuristic-layout.mjs -->

The optional `--check-parity` gate requires all native geometry invariants to
pass, and native crossings and bends to be no worse than real ELK on each graph.
It retains oracle failures as unverified cases. It exits nonzero for any gap;
`baseline.json` records every failed check. `--random-seeds N` draws unsigned
32-bit seeds and saves `seeds.json` before running. The benchmark still builds
current source and runs actual elkjs; it never substitutes the native facade.
Passing this finite gate is necessary evidence, not universal parity or a
replacement for the authored aesthetic rubric. No tolerance was introduced to
make existing failures pass.

The [160-graph random evaluation](random-progress.md) records the current native
phase/routing corrections, a replay of observed counterexamples, and a fresh
random draw against real ELK. The strict parity gate still fails on crossings
and bends. Full per-graph results and matching visual proof remain available.

The [constraint orientation probe](constraint-orientation-probe.md) retains ten further measurements, including larger-case quality regressions. It precedes the later fixed-endpoint repair; parity still fails.

The [compaction port-margin proof](compaction-port-margins/README.md) records 40 new full-geometry matches and 56 newly matching random hierarchy graphs. Broad parity remains incomplete.

The [long-edge joining proof](long-edge-compaction-joining/README.md) preserves ELK segment bends after compaction, including retraced sections. Directional full matches improve from 64 to 74/200; broad parity remains incomplete.

The [compound boundary-spacing proof](compound-boundary-spacing/README.md) replaces blanket spacing and compensating child shifts with ELK routing-track reservations. Directional full matches improve from 74 to 80/200; broad parity remains incomplete.

The [fixed-port loop proof](fixed-port-loop-pairs/README.md) records 48 face-pair/direction regressions matching real ELK, with no new full-suite failure. Broad random parity remains incomplete.

The [loop-envelope compaction proof](compaction-loop-envelopes/README.md) improves directional full matches from 122 to 132/200, with zero native errors and five resolved suite failures. Broad parity remains incomplete.

The [label routing clearance proof](label-routing-clearance/README.md) improves directional full matches from 132 to 134/200 and original flat matches from 32 to 34/100. Seeds 26–50 add 200 preserved random comparisons; combined exact matches are 266/400, with zero native errors. Broad parity remains incomplete.

The [shared cross-port adjacency proof](shared-cross-port-adjacency/README.md) corrects BK straightening on detached port rows through physical edge append order. Combined exact matches remain 266/400; differing values improve by ten, with no matches lost. Broad parity remains incomplete.

The [loop track clearance proof](loop-track-clearance/README.md) reserves fixed-loop flow envelopes during routing and preserves endpoint clearance through reversed edges and trailing bends. Combined matches remain 266/400; differing values improve by 579. Seed 22 now matches all node positions and route sections; junction metadata remains different.

The [native junction proof](native-junctions/README.md) moves branch generation into physical routing and retains junctions through joining and compaction. Seeds 22 and 33 RIGHT become complete matches; combined coverage improves to 268/400, with no complete matches lost.

The [movable loop label proof](movable-loop-labels/README.md) reserves exterior labels before placement and preserves directional alignment and stacked routing clearance. Combined strict matches improve to **270/400**, zero native errors and no complete matches lost. All 38 new regressions fail before and pass now; no existing suite failures change. Broad parity remains incomplete.

The [loop label compaction proof](loop-label-compaction/README.md) retains label envelopes in visibility hitboxes. Combined strict matches improve to **272/400**, with no lost complete matches or changed existing suite failures. Expanded seed 44 DOWN/UP worsens and remains preserved for the next BK diagnosis. Broad parity remains incomplete.

The [smart vertical label proof](smart-vertical-labels/README.md) fixes a second transposition of smart label anchors. Combined strict matches improve to **274/400**. Seed 44 cross-axis geometry now matches; 20 flow-axis differences remain in each vertical direction. Expanded seed 34 UP gains five differences; all failures remain recorded.

The [cycle-aware compaction proof](cycle-connection-locking/README.md) corrects connection locks to use physical cycle-broken adjacency. Combined strict matches improve to **278/400**, with no lost complete matches or increased differences. Seed 44 now matches all directions. Its scoped vertical tests now assert complete geometry.

The [mixed loop bounds proof](mixed-loop-bounds/README.md) restores ordinary long-edge cross-axis bounds even when an unrelated self-loop is present. Default flat exact matches improve to **42/100**; all 600 directional results remain byte-identical to their retained evidence.

The [port-aware track proof](port-aware-tracks/README.md) fixes seed 22 RIGHT routing and junctions. Default flat matches improve to **43/100**; directional exact matches remain **412/600**. Two incomplete compaction cases worsen and remain preserved.

The [initial model and port-helper alignment proof](prepared-model-order/README.md) sorts before north/south helper insertion, preserves physical order and excludes port helpers from BK inner segments. Across 1,100 retained inputs, strict matches rise **566 → 573**, no complete matches are lost and 16 worsened rows remain recorded. Seed 2 RIGHT now matches nodes and routes; eight junction differences remain. Broad parity remains incomplete.

The [physical junction ownership proof](mixed-port-junction-order/README.md) preserves merged incident-edge order and mixed-port restoration after joining. Strict matches rise **573 → 601** across the same 1,100 inputs, with no matches lost. Nineteen new complete-geometry regressions cover all four directions; 58 worsened incomplete rows remain recorded. Broad parity remains incomplete.
