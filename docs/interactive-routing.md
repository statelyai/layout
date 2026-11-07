# Interactive routing

<!-- object routing API and independent concerns from src/routing/api.ts, src/routing/types.ts and src/routing/scheduler.ts -->

Layout-coupled routing can reserve space during placement. Fixed-geometry routing
uses the positioned nodes, ports and labels. Both use the same structured route
format and native routing constraints. Full and incremental describe how much
work is performed, independently of either context.

## Path style, coordination and topology

```ts
import { routeEdges, updateRoutes } from "@statelyai/layout/routing";

let previous = routeEdges({
  graph,
  settings: {
    coordinateSpace: "world",
    clearance: 8,
    coordination: { kind: "parallel" },
    selfLoops: { sourceSide: "right", targetSide: "top", clearance: 16 },
    policy: {
      path: { kind: "rounded-orthogonal", radius: 8 },
      sourceTangent: { kind: "border-normal" },
      targetTangent: { kind: "border-normal" },
      label: { kind: "gap" },
    },
  },
});

const result = updateRoutes({ previous, graph: nextGraph, changes: editDiff });
previous = result.snapshot;
renderPatches(result.patches);
```

`policy.path` is a complete discriminated choice. Sharp paths use
`{ kind: "polyline", geometry: "orthogonal" }` (or straight, arbitrary-angle
polyline, or octilinear geometry). Rounded orthogonal paths own their geometry;
Bézier and Catmull–Rom own guide selection. The types and runtime validator reject
conflicting combinations and irrelevant options. Per-edge `policy.path` replaces
the inherited choice as a unit. Straight paths cannot detour around obstacles;
infeasible hard constraints produce diagnostics and may leave empty sections.
Fitting always checks the finished path against hard constraints.

Coordination selects independent, parallel, fan, bus or bundle planning. Shared
groups use per-edge `group` IDs or common-source defaults. Bus, fan and bundle
sections identify intentional shared trunks with `sharedId`. Render each shared
section once. Named historical strategy exports keep their existing defaults;
the object API defaults to explicit independent coordination.
Parallel coordination distributes attachment and clearance lanes. Infeasible
spacing can fall back to an independent hard-valid route with a coordination
diagnostic; it does not make otherwise feasible connections disappear.

Self-loops follow graph topology and use `selfLoops` rules. A targetless edge
uses `edges[id].topology: { kind: "label-only" }`: its route stops at its label.
`sourceLabel` connects a child route to another edge's label. Invalid or disabled
parents suppress dependent connectors.

Positioned `gap` and `through` labels attract automatic node attachments. When
both endpoints sit beside a label on opposite sides of its travel axis, entry
and exit follow that axis.
Labeled self-loops project separate stems toward the label. With a routing policy,
search treats crossings and retracing between label legs as hard conflicts outside
shared attachment regions, even when crossings between different edges cost zero.

Use `policy.label: { kind: "gap", attachment: "side-midpoint" }` to restrict
label connections to the centers of allowed sides. The default `"border"` permits
sliding along a side. The restriction applies to both label legs and connectors
using that label as `sourceLabel`, including drag updates and adopted layout hints.
Midpoint-only loops choose distinct sides when available instead of offsetting
two attachments along one side. `edges[id].labelSides` still controls allowed sides.
Automatic tangents follow the selected face normals for midpoint-only gaps;
explicit tangent vectors keep their requested direction.
Overlapping fixed labels retain their hard obstacle rectangles, allowing routes
to reach a shared boundary without requiring clearance padding between them.

## Generic endpoint constraints

`edges[id].source` and `target` accept a floating rectangle with allowed sides,
or a port with `point`, cardinal `direction`, `escape` and `owner`. A fixed port
can pass through its own owner only along its legal endpoint lead. Foreign node,
label and terminal barriers remain active.

`sourceAttachment` and `targetAttachment` describe node-local connection bounds;
`facing: "inward"` supports a compound's content boundary. Their obstacle bounds
remain independent. Supply header/caption rectangles through graph obstacle nodes
or per-edge `obstacles`; `terminalBounds` remain barriers even when optional
avoidance is disabled. Generic endpoint and obstacle fields supersede equivalent
historical fields inside `bezier`.

`sourceClearance` and `targetClearance` trim marker gaps from final geometry.
Input node/port identity is preserved. Label-only routes have no target-node gap.

## Continue from layout

```ts
const layout = getLayeredLayout(graph, {
  routing: { strategy: orthogonalRouting, settings },
});
const handoff = getLayoutRouting(layout);
if (handoff) {
  const next = updateRoutes({
    previous: handoff.snapshot,
    graph: editedRoutingGraph,
    changes: changesSince(handoff.graph),
  });
}
```

Read the handoff once. Its graph contains resolved world geometry, including
layout-owned headers and positioned ports. Generate subsequent diffs against
that geometry. Native compound routing and native flat repairs also retain their
snapshot and constraints. A layout that did not invoke the native fixed-geometry
router has no retained snapshot. Edits to a returned layout invalidate its cached
handoff; serialized/cloned layouts do not contain private routing state.
Flat repairs initially expose the same routes as the layout output. Subsequent
updates can reference synthetic attachment ports present in the handoff graph;
use that graph when resolving endpoint references.

For other layout providers, normalize their routes using `getLayoutRoutes` and
pass them as `initialRoutes` when calling `routeEdges` on the corresponding
positioned routing graph. Adoption defaults to `preserve-valid` stability. Every
hint passes the router's geometry, endpoints, section topology, ordered waypoints,
curve, tangent and obstacle checks; rejected hints are recomputed. Do not assume
all provider paths satisfy a different router's constraints.

Canonical routing defaults to recomputing affected paths from current geometry.
Preservation deliberately depends on edit history. After drag completion,
`refineRoutes({ previous })` reconsiders every edge without retaining old
corridors, while leaving the snapshot's configured update policy intact.
Valid line corridors can retarget floating endpoints without accumulating bends.
Marker gaps retain private untrimmed hints, so repeated updates trim once. A
hard-safe guide can remain a curve fallback during preservation; its explicit
`constraint: "curve"` diagnostic remains until refinement succeeds.

## Scheduling and workers

```ts
const scheduler = createRoutingScheduler({
  snapshot: previous,
  onUpdate: ({ patches }) => renderPatches(patches),
  onError: reportError,
  schedule(flush) {
    const id = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(id);
  },
});
scheduler.enqueue({ graph: nextGraph, changes: editDiff });
// On teardown:
scheduler.dispose();
```

Diffs must describe consecutive edits. The scheduler composes them without full
graph scans, coalesces queued work, and accepts only the latest result for its
current base snapshot. It retries cumulative changes after an obsolete async
result. Failures retain pending edits for an explicit flush or a later enqueue;
they do not create an automatic retry loop.

An asynchronous `update(options, signal)` executor can run a worker adapter.
The worker owns native snapshots; exchange diffs and route patches across the
boundary. Native snapshots contain private indexes and cannot be transferred.
An executor must return the caller's exact `previous` reference as `base`.
Abort signals let cooperative executors cancel work; synchronous native routing
cannot be preempted. `maxSearchNodes` is a per-edge search limit, not a frame-time
guarantee. Keep rendering and pointer-event scheduling in the host editor.

## Performance checks

<!-- benchmark command and workloads from package.json#scripts.bench:routing, bench/routing-fixtures.ts and scripts/bench-routing.ts -->

Run `pnpm bench:routing`. Optional environment variables:
`ROUTING_BENCH_SIZES=100,1000`, `ROUTING_BENCH_FRAMES=60`,
`ROUTING_BENCH_TRIALS=5`, and `ROUTING_BENCH_FILTER=configured-1000`.
`ROUTING_BENCH_MODULE` loads another routing module for alternating comparisons.

The harness measures synchronous update latency and update plus patch application
and SVG serialization. It reports p50/p95/p99, changed-route counts, search work,
fallbacks and errors, and checks final fresh/incremental equivalence. Edit-diff
construction, initial layout, browser paint and worker transfer are excluded.
Heap deltas include garbage collection noise; they are not allocation counts.
Sparse, configured, obstacle, compound and high-degree fixtures expose different
limits. A fast fallback does not establish successful routing quality.

`pnpm bench:viz-routing` exercises the committed synthetic 150-state/300-edge
projection from Viz. It includes initial routing, node and label drags, patch
application and SVG serialization. `ROUTING_BENCH_PRESERVE=false` selects canonical
updates; `ROUTING_BENCH_CROSSING_PENALTY` and `ROUTING_BENCH_OVERLAP_PENALTY`
default to the editor's explicit `0`/`8` profile. Every run reports initial empty
routes, curve fallbacks, hard diagnostics and machine load. This adverse workload
still exceeds a frame budget; no uniform latency guarantee is claimed.

## Selected-only drag previews

<!-- preview scope from src/routing/api.ts, src/routing/engine.ts and src/routing/scheduler.ts -->

Omit `scope` (or use `{ kind: "affected" }`) for normal invalidation: moved
obstacles can reroute nearby unrelated edges. For temporary drag previews:

```ts
const preview = updateRoutes({
  previous,
  graph: nextGraph,
  changes: completeEditDiff,
  scope: { kind: "selected", edgeIds: draggedEdgeIds },
});
previous = preview.snapshot;
renderPatches(preview.patches);

// On drop, even if the final geometry is identical to the last preview:
const committed = refineRoutes({ previous });
previous = committed.snapshot;
renderPatches(committed.patches);
```

An empty selection defers all routing. Unknown selected edge IDs throw. Selection
expands through label families and coordination groups in both old and new
settings; those dependencies remain coherent. Unrelated route objects remain
unchanged even when a moved obstacle crosses them. Preview paths may overlap or
use stale attachment geometry until commit. Always supply the complete diff;
selection limits route computation, not geometry tracking. Topology changes,
global policy changes and direction changes use ordinary coherent invalidation
instead. `refineRoutes` explicitly recalculates all edges against retained final
geometry, without moving nodes or labels.

`createRoutingScheduler().enqueue` accepts the same scope. Coalesced selected
edits union their selections; an affected/default edit takes precedence. A worker
or custom `RoutingStrategy` must implement the optional fifth `scope` argument
to honor selected previews; third-party implementations may ignore it.
On drop, await `scheduler.flush()`, dispose the drag's scheduler, then refine
`scheduler.snapshot`. Start the next scheduler from the committed snapshot.
An empty affected update does not repair previously deferred paths.

## Preview/commit benchmarks

<!-- benchmark commands from scripts/bench-routing-preview.ts and package.json -->

`pnpm bench:routing-preview` compares affected and selected previews, alternating
modes across five measured trials after warmup. It reports per-trial median,
p95 and range for router-only and router-plus-patch/SVG work, commit latency,
affected-edge counts, fallback counts and errors. Every frame must do routing
work; unrelated selected-preview identities, patch counts, finite SVG and final
full/fresh equivalence are checked. A failed check aborts the run.

```sh
ROUTING_BENCH_SIZES=100,1000 ROUTING_BENCH_FRAMES=20 ROUTING_BENCH_TRIALS=5 pnpm bench:routing-preview
ROUTING_BENCH_FILTER=high-degree ROUTING_BENCH_CURVE=bezier pnpm bench:routing-preview
```

Supported curves are `polyline` (default), `bezier`, `catmull-rom` and
`rounded-orthogonal`. Fixtures cover sparse graphs, configured routing, fan-out
and obstacle corridors. Selection contains one or two edges; coordinated group
and label-chain closure are regression-tested separately. These measurements
exclude initial routing, input projection/diff construction, browser rendering
and correctness checks. They do not establish drag-frame latency or FPS. Run the
consumer's projection/interaction benchmark too before making a UI performance
claim. Compare work counts on busy hosts; do not treat noisy timing differences
as speedups. Existing `bench:routing` and `bench:viz-routing` cover other workloads.

## Bounded orthogonal corners

<!-- corner shaping from src/routing/corner-radius.ts, path.ts and algorithms.ts -->

Use `policy.path: { kind: "polyline", geometry: "orthogonal" }` for sharp turns, or
`policy.path: { kind: "rounded-orthogonal", radius: 10, minRadius: 2, maxRadius: 16 }`
for rounded turns. Preferred radius is clipped to the interval, then each corner
fits its adjacent segment lengths. The minimum remains hard: an infeasible
positive minimum produces a whole-edge sharp fallback with a curve diagnostic.
Both label legs use the same rule, including preserved paths and drag updates.
See the [corner policy details](routing-policies.md#paths).

Changing the global `policy.path` choice through `updateRoutes` updates the snapshot strategy and reroutes every edge when its base geometry changes, even during selected previews. Omitted optional path fields may be represented by `undefined`.
