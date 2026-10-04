# Native boundary layer preprocessing

Uncommitted work; **not parity and not regression-free**. The unchanged
100-case hierarchy gate has **12 complete matches**, zero engine errors and
**3,665 differing values**. The preceding experiment had 8 matches and 4,683
differences; all original inputs and 5e-13 assertions remain unchanged.

Real worker phase traces exposed three distinct defects:

- Separate boundary dummies and their edges entered native layer assignment.
  ELK detaches them first. Native assignment now uses the internal graph,
  restores leading/trailing boundary layers, and propagates FIRST/LAST to nodes
  connected only to one boundary kind. Nodes connected to both retain freedom.
- Every descendant crossing in one direction shared a proxy. ELK merges only
  edges incident to the same descendant port. Implicit endpoints receive their
  own boundaries; shared explicit ports honor mergeHierarchyEdges. Boundary
  creation walks descendants rather than root-edge order. Generated IDs avoid
  punctuation-normalization collisions.
- Orthogonal track allocation consulted synthesized node-origin endpoints for
  fixed-coordinate ports. Allocation now reads their actual coordinates;
  movable ports retain sweep ordering. Wrong tracks could reserve an extra gap
  even when exported route points appeared correct.

Full seed 1 and seed 2 geometry and containers now match real ELK in all four
directions. Four new whole-geometry regressions preserve seed 2. The existing
selected-port regressions and 1,024 boundary-transfer oracle states also pass.
The real worker traces are observational; production does not call elkjs.

Frozen suite: **1,892 pass / 118 fail / 2,010**. Relative to committed 21a622d:
**12 introduced failure names, 4 fixed**. Relative to the preceding uncommitted
experiment, fixed-port post-compaction attachment resolves. Ten introduced
failures concern hierarchy options; two concern compound-to-descendant labels.
No assertion was weakened. Source/repository TypeScript, selected lint and build
pass. Main was fetched and remains the branch's original fork point. No clean
snapshot, new browser inspection or remote CI proof is claimed.

The basic hierarchy fixture exposes the remaining phase gap: native leaves a
above b, while ELK puts b above a through coordinated parent/child crossing
sweeps. Moving b into the correct trailing internal layer is necessary but does
not replace that coordination. Hierarchy labels and junction restoration remain
incomplete. The public compound solver still needs the shared foundation.

[Complete replay](./report.json), [equal-scale comparison](./index.html),
[failure-name delta](./full-suite-delta.json), [source hashes](./manifest.json),
[source/validation archive](./source-and-validation.tar.gz), and
[all intermediate replays and real worker traces](./intermediate-replays-and-worker-traces.tar.gz)
retain successful and failing evidence. Source remains uncommitted pending the
introduced hierarchy failures. Goal remains active.
