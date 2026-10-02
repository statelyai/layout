# Heuristic review corpus

<!-- generator behavior and bounds from scripts/generate-heuristic-corpus.mjs -->

Generate ten seeded graphs with native Stately layered layout and real elkjs
layered comparisons:

```sh
pnpm build
node scripts/generate-heuristic-corpus.mjs 20261001
```

Open `generated/index.html` for numbered graphs, Stately/ELK tabs, zoom controls,
hover IDs, and editable observations. Tabs support arrow keys, Home, and End.
Both engines receive the same graph, node/label sizes, direction, fixed port
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
