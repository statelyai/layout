# Reusable crossing sweep coordinator

Uncommitted; parity incomplete. Native standalone barycenter and median sweeps
now use a reusable session and counter-based scope coordinator. Sessions expose
first-layer randomization, individual sweeps, shared RNG, crossing count and deep
node/port snapshots. The coordinator enters coupled children between parent
layers, counts the entire coupled subtree, and retains its candidate orders
together. Bottom-up scopes run in reverse breadth-first order and can publish
boundary order before their parent begins.

Seven focused tests cover crossing/port restoration, snapshot independence,
forward/backward child entry, shared RNG consumption, bottom-up versus coupled
traversal, and resuming actual placement/routing from the selected order. The
existing default path consumes the same random values and preserves its output.
The adapter still completes children independently. Scope assembly, exact shared
port-distributor initialization, sweepiness classification and boundary-port
mapping must be connected before native hierarchy can use this coordinator.
This is not an end-to-end hierarchy parity claim.

Frozen full suite: **1,909 pass / 118 fail / 2,027**, no new failure names versus
the preceding uncommitted snapshot. Earlier introduced hierarchy/label failures
remain. Source/repository types, selected lint/format and build pass. No clean
snapshot or remote CI claim; source remains uncommitted/unpushed.

All 100 complete native outputs, oracle outputs and original inputs are exactly
unchanged from the preceding phase fix: **16 full matches**, zero engine errors,
**3,354 differing values**, unchanged 5e-13 tolerance. The existing
[before/after/ELK gallery](../scope-crossing-order/index.html) and browser images
therefore still describe the current geometry; no fresh browser inspection is
claimed for this structural change.

[Replay](./report.json), [failure delta](./full-suite-delta.json),
[source hashes](./manifest.json), [source and validation](./source-and-validation.tar.gz).
Next: prepare all compatibility scopes before placement, connect parent ports to
child boundary dummies during crossing sweeps, then resume scopes bottom-up.
The public compound solver must adopt the same completed foundation. Goal active.
