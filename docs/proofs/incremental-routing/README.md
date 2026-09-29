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
