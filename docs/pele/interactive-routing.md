# Pele label dragging

<!-- createPeleRouting and Pele curve policy from src/routing/pele.ts, src/routing/pele-path.ts and src/routing/types.ts -->

`createPeleRouting(layout, settings?)` captures a fresh `getPeleLayout` result
and returns `{ graph, snapshot }`. Both root and `/routing` entry points export
this helper. Capture once, before editing geometry; stale or cloned layout caches
are rejected. Full Pele layout capabilities remain unchanged: this helper uses
the separate fixed-geometry incremental router.

```ts
import { getDiff } from "@statelyai/graph";
import { getPeleLayout } from "@statelyai/layout";
import { createPeleRouting, updateRoutes, toSvgPath } from "@statelyai/layout/routing";

const layout = getPeleLayout(input, layoutOptions);
const handoff = createPeleRouting(layout, {
  clearance: 4,
  maxSearchNodes: 1000,
});
let routingGraph = handoff.graph;
let snapshot = handoff.snapshot;

function moveLabel(edgeId: string, x: number, y: number) {
  const nextGraph = {
    ...routingGraph,
    edges: routingGraph.edges.map((edge) => (edge.id === edgeId ? { ...edge, x, y } : edge)),
  };
  const result = updateRoutes({
    graph: nextGraph,
    previous: snapshot,
    changes: getDiff(routingGraph, nextGraph),
  });
  routingGraph = nextGraph;
  snapshot = result.snapshot;
  // Apply result.patches to the editor's route collection.
}

for (const route of snapshot.routes.values()) {
  for (const section of route.sections) {
    renderPath(section.id, toSvgPath(section.path), route.status);
  }
}
```

## Viz integration contract

1. Keep the returned routing graph and snapshot together in editor-local state.
   The graph resolves nodes and labels to world coordinates and includes synthetic
   compound header obstacles. Edit this graph's label geometry using the editor's
   resolved transient world position. Never write its synthetic nodes into the
   document. State positions remain fixed throughout label dragging.
2. Emit the complete consecutive `GraphDiff` from the edit operation on each
   pointer update, including snapped positions and measured label dimensions.
   The example uses `getDiff` for clarity; it scans the graph. Native routing
   updates consume diffs without scanning the supplied graph arrays.
3. Render structured sections independently. The label is a fixed box with an
   incoming and outgoing section; joining them through the box destroys its gap.
   Legacy `edge.points` are an approximation, not the authoritative curves.
4. Keep the same snapshot after drop. An empty diff changes no route geometry.
   Avoid running full layout or switching routing strategies on drag/drop.
   Optional `refineRoutes({ previous: snapshot })` retains the Pele policy but
   explicitly reconsiders **all** routes and may change their corridors.
5. Use `createRoutingScheduler` to coalesce pointer events, or retain snapshots
   in a worker. Compare `result.base` with the current snapshot before accepting
   asynchronous results. See [interactive routing](../interactive-routing.md).

The handoff uses `routingPolicies.pele`: `curve: { kind: "pele" }`, border-normal
node tangents, fixed midpoint label gaps, obstacle avoidance, and
`stability: { kind: "preserve-valid" }`. It records per-edge attachment sides,
content-boundary attachments and actual label travel direction. Return-edge
labels therefore retain their reverse travel direction; differently directed
compound groups retain separate endpoint axes. Valid original attachment offsets
and lanes survive through seeded routes, rather than being redistributed on drag.
Header rectangles remain hard obstacles inside otherwise traversable groups.
Settings supplied to `updateRoutes` replace the previous configuration. Omit them
to retain the handoff's per-edge intent, or supply the complete configuration.

For callers already maintaining a positioned routing graph, the lower-level
contract remains `routeEdges({ graph, initialRoutes, settings })` with
`settings.policy: routingPolicies.pele`. Supply per-edge attachment sides,
label directions, content bounds and header barriers yourself. The curve policy
is configuration, independent of cached path validity. Rejected or later blocked
seed paths are rebuilt with Pele curves instead of silently selecting orthogonal
or generic Bézier output. Existing route adoption validates all hints; paths that
violate current hard constraints cannot be preserved exactly.

## Guarantees and limits

The router calls Pele's actual axis-triple path builder for its broad S-curves,
straight runs, axis changes and short marker approaches. It first tries a bounded
set of local candidates, then bounded obstacle search and padded guides. Narrow
corridors reduce the span of a turn using additional straight knots in the same
builder. Final curves pass node/label obstacle, endpoint tangent, self-intersection
and marker-gap checks. Unaffected routes retain identity; label movement also
invalidates routes intersecting its old/new obstacle bounds. Soft edge conflicts
may remain and carry diagnostics.

This is Pele **curve construction on fixed geometry**. It does not reproduce
Pele's full placement, global lane allocation or crossing optimization on each
frame. A full layout can reserve space which fixed nodes cannot provide. A
geometrically blocked or overlapping label may make a connection infeasible.
Check `route.status` and diagnostics: a safe line guide carries
`constraint: "curve"` when the requested shape cannot fit; hard failures can
return empty sections. Generic Bézier smoothing is not substituted as Pele.
After an infeasible drag, moving the label back into free space retries the
configured Pele shape. Named ports remain unsupported by full Pele layout.

Capture a new handoff after another full layout. This API is scoped to continuing
that layout's fixed-node label edits; it adds no reload/persistence behavior.

## Reproducible performance smoke

Run `pnpm exec tsx scripts/bench-pele-drag.ts`. The synthetic fixture has nine
states and 27 transitions, including return edges and self-loops. Ten warmup
updates precede 100 timed label updates. Timing covers synchronous routing only;
full layout, initial adoption, diff creation and rendering are excluded. The
script separately reports adoption time, affected/search counts, changed and
curved outputs, failures and obstacle violations. No frame-time guarantee follows
from this microbenchmark. `maxSearchNodes` bounds search per edge; nearby
obstacles or coordination changes can affect multiple edges.
