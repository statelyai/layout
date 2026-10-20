# Independent correctness review

Reviewed `741ab54..92eb146`, root uncommitted proof scripts and fixture edits. Read-only application review. Final native auto-face/polish delta still pending.

## Confirmed finding

P2. Allowed-face correction erases automatic grouped duplicate target separation.

`src/routing/algorithms.ts` spreads duplicate targets before applying `targetSides`. When the initially preferred face is excluded, the later correction assigns `anchor(bounds, allowed[0])` to both routes. Two edges remain indistinguishable at the target despite retaining automatic attachments.

Reproduced through public `busRouting.route`, `fanRouting.route`, and `bundleRouting.route`. Source node `(20,100,60,60)`, target `(380,40,60,60)`, two identical endpoint pairs, global Bezier policy, both edges `targetSides: ['top']`. Both routes report `routed` and terminate at `(410,40)`. With `targetSides: ['left']`, endpoints correctly differ at `(380,64)` and `(380,76)`. Probe is `review-probe.ts` in this directory. Select the legal face before computing duplicate attachment offsets. Preserve named ports and explicitly positioned attachments.

## Coverage

- Authoring clearance retries, outward terminal leads, raw obstacle ownership, nested coordinates, positioned ports, required waypoints, cancellation calls, and existing bounded visibility searches.
- Native gap entry/exit normal ownership, final tangent verification, old-section reuse, local Bezier handle limits, authored waypoint retention, self-intersection rejection, Catmull synthetic-knot costs, and radius-aware leads with hard-geometry fallback.
- Grouped duplicate target selection, canonical ordering, group dependency updates, shared trunk preservation, and named-port exclusions.
- React controls, fixture ownership, node dragging, reset/configure updates, union viewBoxes, shared trunk deduplication, target arrowheads, and route diagnostics.
- Matched-input proof collection and screenshot pairing. Browser script validates finite paths and page errors; it does not itself establish visual quality or control interaction behavior.

No additional confirmed correctness blocker found in the reviewed revision. Final source delta requires review before closure.

Type System Discipline guided constraint-variant review. Test Behavior, Not Implementation guided public API reproduction and authored-geometry checks.

## Final delta review

Reviewed through `7925f199b97fcfe8cd904580068a5921566a776c`. The later source delta covers automatic terminal-face candidates, selected-face metadata, diagnostic/fallback rollback, shared search budgets, preserve-valid face reuse, smooth fitted guide joins, and same-face loop candidates.

The confirmed duplicate-target finding is fixed by `fd1c9bb`. Re-ran the public probe. Every grouped strategy now has top endpoints `(404,40)` and `(416,40)` while the left endpoints remain `(380,64)` and `(380,76)`. Named ports retain their separate hard constraints.

Independently ran eight focused regression files. All 43 tests pass. Log is `correctness-review-final-tests.log`. Tests include low search budgets, mirror/rotation, preserve-valid, normal tangents, no synthetic crossings, loop area, partial nested coordinates, ports, waypoint clearance fallback, and label obstacles.

No remaining confirmed correctness findings in this revision. This verdict covers source correctness and fixture/proof wiring. It does not establish visual parity with yEd; actual gallery review belongs to the separate visual pass.

## Terminal-clearance delta

Re-reviewed `7925f19..1068d27`. Compact Catmull guides preserve the existing final safety/tangent checks. Terminal clearance remains a finite preference; authored waypoints and self loops bypass its soft cost. Padded guide alternatives share the original remaining search budget. Same-face narrow loops retain final safety assessment at every binary-search candidate.

Ran `terminal-review-probe.ts` across 24 public API cases. Cases span four curve families, clearance 0/8/24, and search budgets 10/8000. Checked explicit outward attachment faces and normal tangents when a route exists, finite points, per-edge search budgets, and equality between obstacle-move incremental results and fresh routing. All assertions pass. Low-budget diagnostic fallbacks remain permitted.

Audited the delta for added source/test/story comments and TypeScript/lint suppressions. None added. No requested comment deletion or application edit.

No confirmed correctness finding in this delta. Organic polish remains pending final review.

## Organic final review and open corpus finding

Reviewed `1068d27..93c5829`. Found an authored collinear organic waypoint displaced by 0.662 units in the initial worker draft. The committed fix retains authored knots before simplification, locks them during relaxation and sparse sampling, and splits rounded fallback at anchors. Re-ran the public three-case waypoint probe against root source. All waypoints now have zero measured displacement. Six organic public update/budget cases pass. Five focused files add 15 passing tests, recorded in `correctness-review-organic-tests.log`.

Comment audit flags only two added narrative lines in `test/routing-organic-quality.test.ts` describing the shoulder metric. No public-contract or external-dependency exception applies. Parent notified to remove them. No added suppression found.

P1 open. Corpus seed 2, fan/bus/bundle, rounded orthogonal radius 18, required x monotonicity produces an empty `edge-c` in current source while source741ab54 produced a feasible monotone rounded route. The exact generated graph and baseline/current routes are in `corpus-review-probe.log`. Adding an independent group override or explicit right/left faces does not restore the route. Changing require to prefer reproduces the baseline radius18 monotone route. Radius4.5 with require also succeeds. The route is feasible; this is not an authored constraint conflict.

Inferred cause is guide selection under earlier soft edge reservations. The search has no monotonic-step constraint, and rounded policy fitting only assesses the selected guide. A required-monotone alternative can therefore be absent from candidates despite being geometrically feasible. The native worker owns remediation. Its fix needs independent rerun before closing this review.

## Monotonic search remediation review

Reviewed the worker's pending internal `SearchContext.allowsStep` design and implementation. Direction checks apply before undirected cost-cache lookup in A* and also cover direct and one-bend shortcuts. They preserve one global edge orientation across all visible sections. Equal endpoint coordinates forbid movement on that axis. Predicate propagation covers cloned, compact, hard-retry, and protected-lead searches. Shifted hard-guide tracks also respect the predicate.

Reviewed shared reference handling for interior ports and automatic face trials. The predicate and finished-path assessment use the same original port or trial endpoint reference. References reset before winner metadata is finalized. Search caches are local to each synchronous call, so trial reference changes do not reuse stale directional validity.

The pending worker code restores all three exact corpus regressions to the baseline radius18 path. Root committed integration and final focused rerun remain pending before closing P1.

## Monotonic finding closed

Root `109a7a8` integrates reviewed worker `8c45faa`. Five focused files pass 17 tests. The independent 672-case corpus completes with zero empty routes and 27 diagnostic fallbacks. It checks finite geometry, hard node clearance, fresh/update equivalence, no-op updates, input ordering, fallback diagnostics, and shared trunk consistency. Log is `correctness-review-monotonic-corpus.log`. P1 closed.

The two organic test narrative comments were removed in the parent working tree. Comment audit finding closed. No comments or suppressions added by the monotonic delta.

P2 open. Explicit `targetSide` on grouped duplicate targets currently prevents spacing because `duplicateTargets` excludes any peer with `options.targetSide !== undefined`. Reproduced all three grouped strategies with two automatic edges sharing a target. Both `targetSide: 'top'` endpoints coincide at `(410,40)`; both `targetSide: 'left'` endpoints coincide at `(380,70)`. `targetSide` constrains a face, not a named or positioned attachment. Existing ungrouped spreading already permits movement along explicit faces. Allow within-face spacing while preserving the requested face; keep named ports and explicit attachment geometry exact. Probe is `explicit-face-review-probe.ts`.

## Explicit-face finding closed

Root `315a93e` fixes duplicate spacing within explicit faces. Re-ran public fan/bus/bundle probes. Top endpoints now differ at `(404,40)` and `(416,40)`. Left endpoints differ at `(380,64)` and `(380,76)`. Nine baseline/current comparisons confirm named ports, fixed frames, and explicit-top fixed frames retain exact authored endpoint positions. Probe is `locked-attachment-review-probe.ts`. Two focused files pass 16 tests, logged in `correctness-review-explicit-face-tests.log`.

Reviewed integrated organic reservation change `13538c2` and requested-curve shortcut `e9a950c`. The direct shortcut remains subject to full hard safety, explicit tangent, monotonicity, self-intersection, zero-conflict, and zero-terminal-halo checks. No new correctness issue found. Padded smooth-guide gating still requires separate visual acceptance on obstacle cases.

No added source/test/story comments or suppressions through `315a93e`. All confirmed review findings are now closed. Dense-return local tangent source delta remains pending final review.

## Final independent verdict

Source revision `fc1baa877769bae3ee192b1ce002e0701e28a576`.

Remaining confirmed findings: **0**.

Reviewed the final dense-return fit. It adjusts only a final inferred interior-knot tangent, preserves endpoint constraints, skips authored via knots, and sends candidates through the existing hard safety, derivative, self-intersection, and monotonicity checks. Final delta adds no source/test/story comments or suppressions. No application files edited by this reviewer.

Independent proof on this final source:

- 13 focused regression files, 57 passing tests. Log `correctness-review-final-fc1baa8-tests.log`.
- 24 public terminal-halo cases covering four curve families, clearance 0/8/24, low/high budgets, locked faces/tangents, finite geometry, and incremental/fresh identity.
- Six public organic waypoint/budget/incremental cases.
- Nine public baseline/current named-port and fixed-frame endpoint comparisons.

The earlier independent 672-case corpus passed on monotonic-fix source `109a7a8`. Parent is running the complete suite and corpus on final source separately. This review does not substitute test success for actual visual judgment or claim yEd parity.

Closed findings: allowed-side grouped duplicate spacing, explicit-face grouped duplicate spacing, authored organic knot displacement and rounded fallback, and avoidable empty required-monotone corpus routes. No deferred correctness finding.
