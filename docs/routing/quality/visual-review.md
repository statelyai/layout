# Final independent visual judgment

sourceRevision `fc1baa877769bae3ee192b1ce002e0701e28a576`.

Reviewed at 2026-10-20T15:23Z. Opened every actual rendered contact sheet, comparison/page-1.png through page-16.png, with this revision printed in each after panel. Compared all 46 matched native cases against baseline 741ab54. Also reopened all five complete before/after image pairs under authoring/ and checked authoring/summary.json.

No open avoidable visual artifacts found in these reviewed cases. The prior simple-curve source hooks, Bézier shoulders, cramped returns, dense-route intersection, organic-route crossings, tiny loops, and oversized inferred Catmull detour are resolved in the final images. The rounded family now produces a rounded route instead of an angular constraint fallback. Shared trunks remain clear while duplicate target branches remain visible.

Experience First set the gate at readable rendered routes, including shape and separation. Prove It Works required viewing the actual final images. Test results, browser story counts, and another reviewer's conclusions were not substitutes for this visual judgment.

This is acceptance of these fixtures at the recorded revision. It does not establish global optimality, all-input routing quality, or parity with yEd. Static images do not establish incremental reuse or interactive behavior.

## Native cases

PASS means acceptable visible shape for the stated case. REQUIRED CONSTRAINT means a conspicuous bend, crossing, or detour follows the requested semantics and is acceptable for that case.

| Case                     | Verdict             | Final rendered evidence                                                                       |
| ------------------------ | ------------------- | --------------------------------------------------------------------------------------------- |
| midpoint                 | PASS                | Smooth S curve and centered passive label. No source hook.                                    |
| tangents                 | PASS                | Explicit oblique source tangent transitions smoothly into horizontal target entry.            |
| label-tangents           | PASS                | Smooth top label entry and independent right exit. Old bottom hook is gone.                   |
| obstacles                | PASS                | Compact clear obstacle arc without the old source hump.                                       |
| catmull-rom              | REQUIRED CONSTRAINT | Smooth large zigzag follows the authored waypoints.                                           |
| rounded                  | PASS                | Rounded corridor and useful final horizontal lead.                                            |
| crossings                | PASS                | Smooth broad crossing-avoidance detour. Top source departure removes the local hook.          |
| monotonic                | PASS                | Rounded monotonic route has readable terminal turns.                                          |
| bundle                   | PASS                | Shared trunk draws once and target branches remain readable.                                  |
| label-follow             | PASS                | Smooth S curve restored. Label follows its midpoint.                                          |
| label-fixed              | PASS                | Smooth source departure and clear route around fixed label.                                   |
| label-through            | PASS                | Smooth passage through the authored label center.                                             |
| label-gap                | PASS                | Two smooth route sections reach the label boundaries.                                         |
| automatic-ports          | PASS                | Compact smooth obstacle arc rather than the temporary box detour.                             |
| fixed-ports              | PASS                | Fixed named ports retain smooth obstacle clearance.                                           |
| opposing-faces           | PASS                | Broad exterior return has visible clearance above both terminal borders.                      |
| same-face-loops          | PASS                | Larger envelopes remain readable around the arrowheads.                                       |
| tight-corridor           | PASS                | Straight line uses the open corridor without gratuitous bends.                                |
| multiple-obstacles       | PASS                | Compact smooth internal weave clears all staggered obstacles.                                 |
| parallel-branches        | PASS                | Duplicate edges and branch arrowheads remain visibly separated.                               |
| shared-bundle            | PASS                | Duplicate target branches are visible and shared trunk remains singular.                      |
| reversed-edges           | PASS                | Opposite directions use separate lines with clear arrowheads.                                 |
| incremental-moves        | PASS                | Initial route clears the obstacle smoothly. Independent edge remains simple.                  |
| high-curvature-obstacle  | PASS                | Both self-crossing lobes are gone. Retained high-curvature descent is readable.               |
| restricted-label-sides   | PASS                | Previously empty route now has smooth permitted top entry and right exit.                     |
| catmull-fixed-ports      | PASS                | Fixed-port source wiggle is gone. Authored interior zigzag remains smooth.                    |
| dense-same-face          | PASS                | Smooth exterior returns have clear spacing. The prior b/c intersection is gone.               |
| loop-near-obstacle       | PASS                | Tall loop is readable within the narrow gap and clears the obstacle.                          |
| strategy-straight        | REQUIRED CONSTRAINT | Explicit straight routes retain their expected orange obstacle crossings.                     |
| strategy-bezier          | PASS                | Rounded catalog routes stay clear and separated.                                              |
| strategy-orthogonal      | PASS                | Crisp catalog turns, separated parallel paths, and readable loop.                             |
| strategy-polyline        | PASS                | Simple diagonal guides clear the obstacle.                                                    |
| strategy-octilinear      | PASS                | Consistent diagonal corners and separated target lines.                                       |
| strategy-curved          | PASS                | Smooth rounded catalog paths and visible loop.                                                |
| strategy-organic         | PASS                | Smooth parallel Review arcs retain separation. The temporary two-crossing regression is gone. |
| strategy-parallel        | PASS                | Parallel catalog routes stay visibly separated.                                               |
| strategy-self-loop       | PASS                | Catalog loop has a useful readable envelope.                                                  |
| strategy-fan             | PASS                | Shared source trunk remains intact and duplicate target endpoints are distinct.               |
| strategy-bus             | PASS                | Continuous bus and visible duplicate target branches.                                         |
| strategy-bundle          | PASS                | Shared geometry draws once and target branches remain distinct.                               |
| coordination-0           | REQUIRED CONSTRAINT | Visible crossing follows zero crossing penalty.                                               |
| coordination-800         | REQUIRED CONSTRAINT | Broad clear detour follows the high crossing penalty.                                         |
| curve-polyline           | PASS                | Angular guide passes through the staggered corridor without extra lobes.                      |
| curve-bezier             | PASS                | Smooth internal weave replaces the temporary lower V detour.                                  |
| curve-catmull-rom        | PASS                | Smooth compact internal weave replaces the outer arch and source sag.                         |
| curve-rounded-orthogonal | PASS                | Rounded alternate exterior route has clean turns and target entry.                            |

All 46 cases have final verdicts. There are 42 PASS and 4 REQUIRED CONSTRAINT, with zero open avoidable findings in this set.

## Authoring cases

All five pairs were reopened at the final revision. The summary records identical inputs and frames. The visible clearance change agrees with the recorded values. Preserved node positions and required waypoint behavior remain separate from native curve-family acceptance.

| Case                      | Verdict                 | Final rendered evidence                                                                                                     |
| ------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| gallery-partial           | PASS                    | Horizontal exterior source lead and visible obstacle clearance. Recorded margin improves from 1px to 8px.                   |
| gallery-route-only        | PASS                    | Same clear exterior source lead and obstacle spacing. Recorded margin improves from 1px to 8px.                             |
| nested-route-only         | PASS                    | Nested route has clear exterior leads and unchanged parent/child frames. Recorded margin improves from 1px to 8px.          |
| gallery-required-waypoint | REQUIRED CONSTRAINT     | Tiny step near obstacle top-left preserves exact waypoint 275,62. Margin improves from 1px to 4px where 8px is constrained. |
| gallery-nested-leaf       | PASS FOR PLACEMENT ONLY | Parent and child frames remain unchanged. This graph has no edges and supplies no routing-quality evidence.                 |
