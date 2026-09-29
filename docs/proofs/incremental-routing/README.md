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
- Catalog rendered all twelve strategies. Straight/Bézier showed their expected
  obstacle-crossing fallbacks; the ten obstacle-aware/group strategies had no
  fallback sections on this fixture. Browser reported no page errors.

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
