# Incremental routing verification

Local Storybook/browser checks on 2026-09-29. These are local source proofs;
they do not establish publication or hosted deployment.

- `Routing/Incremental/Playground`: dragged Start through two pointer-move frames.
  The final frame reported three recomputed routes, two reused routes, and three
  patches. Independent retained `M 130 382 L 380 382`.
- Moving the publish label reported one recomputed route, four reused routes,
  and one patch. Its two separate path sections remained visible.
- Curved renderer produced five curve-bearing path sections. Enabling the
  lines-only renderer produced six visible line-only sections, including the
  split label route, with no curve commands.
- Catalog rendered all twelve strategies. The initial run showed Straight/Bézier
  fallbacks. The Bézier fallback was a bug, corrected and rechecked below. Browser reported no page errors.

Screenshots:

- [Strategy catalog](catalog.png)
- [Curved paths](curved.png)
- [Lines-only approximation](flattened.png)
- [After dragging](drag.png)

Automated tests additionally forbid graph-array reads during a one-node update
in a 1,000-edge graph, check one affected/recomputed route and one patch, and
check bounded local obstacle candidates. This proves locality rather than a
wall-clock latency guarantee. Every strategy shares the immutable update engine
and has addition, deletion, no-op, drag, and impossible-route tests.

## Artifact regression checks

After the reported artifacts, repeated actual pointer drags through 31 frames for
both orthogonal and curved strategies. Both retained all routes with no fallback,
no dangling retraced segments, and no accumulating staircase. Final updates each
recomputed three incident routes, reused two, and emitted three patches.
The independent route retained `M 130 382 L 380 382`.

Bézier now routes every edge in the playground without fallback. Direct curves
use geometric collision checks; obstructed curves search for a curved detour.
The publish label-to-node attachment is horizontal without the previous tiny jog.

- [Bézier obstacle detours](bezier-fixed.png)
- [Orthogonal after 31 drag frames](orthogonal-drag-fixed.png)
- [Curved after 31 drag frames](curved-drag-fixed.png)

Automated regressions run 80 incremental drag frames for each of orthogonal and
curved, check bounded segment counts and no reversals, verify a clear cubic whose
bounding box overlaps an obstacle, an obstructed cubic detour, label alignment,
and true/false collisions for cubic, quadratic, and arc geometry.

Rechecked the full catalog after the fix: only straight routing had fallbacks
(two obstructed sections); the other eleven strategies had none. Lines-only
rendering after dragging had zero curve commands and zero fallback sections.
The browser reported no page errors.

## History independence and diagonal drag regression

Default updates now match fresh routing across opposite endpoint drag histories
for all twelve strategies. Each strategy also has obstacle-movement differential
tests with parallel/group peers; unrelated route identity is retained.
An 80-frame diagonal drag regression exercises opt-in preservation and checks that
orthogonal bend counts cannot grow into a staircase. Earlier checks only moved
one coordinate and missed this pattern.

Browser verification: dragging Review from below and above to exactly the same
coordinates produced byte-identical SVG paths for every edge. A subsequent
40-frame diagonal Start drag retained compact orthogonal paths, with three routes
recomputed, two reused, and no browser errors.

- [Same endpoint reached from opposite directions](history-independent.png)
- [After 40 diagonal drag frames](diagonal-drag-fixed.png)

## Final routing contract

History preservation has been removed from the API and strategy implementations.
Previous paths are used only as cached outputs for identity reuse and patches.
Strategies receive current geometry and settings, never previous drawn paths.
Mixed node/label drag tests compare every frame with fresh routing for all twelve
strategies while retaining unrelated route identity. The earlier opt-in stability
checks above describe intermediate versions, not the final public contract.

## Routing quality pass — 2026-09-30

Added endpoint-aware search costs (including stronger backward-turn penalties)
and both horizontal and vertical grid intersections for octilinear diagonals.
The label-to-Publish hook now takes a forward diagonal followed by a horizontal
attachment. Duplicate connections receive distributed node attachments, staggered
attachment lengths, and distinct obstacle-clearance lanes. Shared-side incident
edges receive distributed unnamed attachments; positioned ports remain fixed.

Shared-source bus/fan/bundle routes now try an interior stem toward target nodes
or labels before exterior alternatives ranked by estimated connection length.
Junctions no longer inherit artificial port exit stubs. Catalog browser checks
showed zero fallback sections for all eleven obstacle-aware/group strategies;
straight retained its two expected obstacle-crossing fallbacks. No page errors.

Regression tests cover duplicate-path separation, octilinear attachment hooks and
lane crossings, interior shared corridors, branching beside an obstacle, neighbor
invalidation when a target switches sides, and label-only update locality. Existing
all-strategy incremental/fresh comparisons and 1,000-edge locality checks remain.

- [Updated strategy catalog](quality-catalog.png)
- [Octilinear label attachment after dragging](quality-octilinear.png)

This is local visual and geometric proof. It does not establish globally optimal
crossing minimization or minimum edge separation everywhere: unrelated routes can
still cross or share a corridor, and grouped routes intentionally share geometry.
