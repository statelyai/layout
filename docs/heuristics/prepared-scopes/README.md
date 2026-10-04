# Prepared hierarchy scopes

Historical snapshot, frozen before publication. Latest evidence:
[fixed-port self-loops](../fixed-self-loops/README.md).

Uncommitted; parity incomplete. The compatibility adapter prepares child and
parent scopes through crossing minimization before any placement. Coupled sweeps
align child external layers with parent port order and publish child boundary
orders back to parents. Bottom-up scopes finish first. Parent placement resumes
with completed child sizes and physical port coordinates. Root counter and child
heuristics retain the real worker's distinct random streams. Externally selected
orders retain authored model-order and greedy-switch policies.

Two flat defects were exposed by this wiring: NetworkSimplex traversal walked
global edges instead of node ports, and BK selected parallel edges in model order
while routing ignored the selected port order. Traversal now preserves per-port
edge order without rewriting model edges. Parallel alignment and implicit routing
retain selected orders. Edges sharing one physical flexible port use one anchor.

**24/100 complete random hierarchy matches**, up from 16, with no lost matches
or engine errors. Seeds 16 and 20 now match in all four directions. Original
inputs and 5e-13 tolerance are unchanged. Differing values drop from 3,354 to
2,596. Remaining 76 cases are preserved, not resampled.

**1,931 pass / 108 fail / 2,039** in the full local suite: ten existing hierarchy
failures fixed and no new failure names versus the preceding snapshot. Compared
with committed 21a622d, two earlier compound-to-descendant inline-label failures
remain introduced; four earlier label-corridor failures resolve. Source remains
uncommitted/unpushed. No clean snapshot or remote CI claim.

55 focused checks pass. New regressions cover physically ordered parallel ports,
a shared flexible fan-out port and late child-size refresh without mutating
authored input, each in all directions. Source/repository types, selected lint,
format and package build pass. Worker observations preserve unmodified oracle
output after excluding transient $H identifiers.

[Before/after/real ELK gallery](./index.html), [complete replay](./report.json),
[full suite delta](./full-suite-delta.json),
[committed baseline delta](./committed-suite-delta.json),
[worker observations](./worker-phases.json), [source hashes](./manifest.json),
[source and validation](./source-and-validation.tar.gz).
RIGHT and DOWN seed 16 were inspected and captured with equal input, dimensions,
scale and viewports across all three views. Gallery SVGs fit their columns while
retaining a common viewBox and scale.

Next: resolve the two compound-label regressions, then trace remaining hierarchy
cases. Sweepiness classification for non-flow-side/feedback ports, nested scope
mapping, labels/junctions and the public compound entry point still need broader
parity evidence. No broad parity claim.
