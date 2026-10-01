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
