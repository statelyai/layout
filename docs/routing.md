# Edge routing

<!-- routing public API from src/routing/index.ts and src/routing/types.ts -->

Routing consumes positioned `@statelyai/graph` values and preserves all node,
port, and existing label geometry. Routes are immutable structured geometry;
SVG strings and polyline approximations are derived views. No DOM, external
routing engine, WASM, singleton, or mutable session is required.

```ts
import { getDiff } from "@statelyai/graph";
import { orthogonalRouting, toSvgPath } from "@statelyai/layout/routing";

const previous = orthogonalRouting.route(graph, { clearance: 8 });
const { snapshot, patches } = orthogonalRouting.update(
  nextGraph,
  previous,
  getDiff(graph, nextGraph),
);

for (const route of snapshot.routes.values()) {
  for (const section of route.sections) {
    const d = toSvgPath(section.path);
    // Render each section separately; style route.status === "fallback".
  }
}
```

All built-in strategies are synchronous. `RoutingStrategy` also accepts promise
results, allowing worker-backed/custom implementations without changing the
value-based contract. Retain the snapshot in editor-local derived state. No
component needs a routing-session reference. Individual edge renderers read
that snapshot; compute updates once per geometry change, not per rendered edge.

## Incremental contract

`strategy.update(graph, previous, graphDiff, settings?)` returns
`{ snapshot, patches, base }`. `base` is the exact previous snapshot: an async
consumer must compare it with its current snapshot before accepting a result.
Revision numbers are local to a snapshot lineage, not globally unique tokens.
Updates are deterministic and never mutate a previous snapshot, allowing
branching previews, undo, and independent canvases.

`graph` is the updated graph. Supply the complete native `GraphDiff` since the
previous snapshot, including topology, ports, hierarchy, and label geometry.
The router applies its `old`/`new` fields to retained geometry and does not scan
`graph.nodes` or `graph.edges` during an ordinary update. Old geometry fields
are checked for stale updates. Missing changes cannot be detected without a
full graph comparison; supplying a complete diff is the caller's contract.

`getDiff` in the example scans the graph. For drag performance, produce the diff
from the editing operation itself. Include resolved transient positions,
measurements, snapping, resize changes, and label movement. A persisted-graph
commit emitted only at drag end is insufficient. Adapters that already resolve
world positions should select `coordinateSpace: "world"`.

Snapshots retain persistent AVL maps, spatial buckets, incident-edge indexes,
group membership, and geometry. Ordinary updates copy only changed tree paths
and spatial buckets. They invalidate incident routes and routes near both old
and new obstacle bounds. Moving a parent also updates descendant geometry;
changing a shared trunk/branch invalidates its routing group. Large obstacles,
group changes, or settings changes can legitimately affect many routes.

Unchanged routes retain identity. By default, affected routes are recalculated
from current geometry, without preserving earlier corridors. Opposite drag histories
therefore converge to the same routes. The spatial index tracks searched regions as
well as drawn geometry, so an obstacle moving away can open a better route without
requiring a full-graph recomputation.

Previous drawn paths are cached outputs only, never routing constraints. For the
same graph and settings, incremental route geometry must equal fresh routing.
Snapshots retain prior graph geometry and dependency indexes to identify affected
edges; unaffected outputs retain identity. There is no history-preservation mode.

Settings omitted on update retain the previous settings. Supplied settings
replace the settings object, using defaults for omitted fields. Configuration
changes invalidate all routes. Snapshots are in-memory values with opaque
immutable indexes; serialize routes for storage, then rebuild with `route`
after loading. Snapshots are not transferable worker messages. A worker should
own its snapshot and exchange graph diffs and route patches with the main thread.

`applyRoutePatches(routes, patches)` applies `set` and `delete` operations without
mutating the original collection. An empty patch list does not imply an unchanged
snapshot: its geometry/index state and revision may have advanced.

## Strategies

<!-- native routing strategy catalog from src/routing/index.ts -->

| Export              | Routing behavior                                        |
| ------------------- | ------------------------------------------------------- |
| `straightRouting`   | Direct line; reports fallback if it crosses obstacles   |
| `bezierRouting`     | Cubic connection; obstacle-aware curved detours         |
| `orthogonalRouting` | Rectilinear visibility grid and A* search               |
| `polylineRouting`   | Arbitrary-angle obstacle-corner visibility graph        |
| `octilinearRouting` | Horizontal, vertical, and 45-degree visibility links    |
| `curvedRouting`     | Obstacle-aware rounding of rectilinear routes           |
| `organicRouting`    | Collision-constrained elastic-string relaxation         |
| `parallelRouting`   | Distinct waypoint lanes for parallel/reciprocal edges   |
| `selfLoopRouting`   | Exterior self-loop routing; orthogonal ordinary edges   |
| `fanRouting`        | Common-source stem and branch routing                   |
| `busRouting`        | Shared orthogonal backbone with individual branches     |
| `bundleRouting`     | Shared corridor with rounded obstacle-aware connections |

`routingStrategies` exposes the same catalog by ID. Self-loop handling is also
available in every strategy. These are native implementations, not claims of
geometry/quality parity with yFiles, libavoid, or Graphviz. Existing pinned ELK
layout behavior remains in its separate compatibility adapter.

Bus, fan, and bundle membership defaults to a shared source/port. Set
`edges[edgeId].group` to form explicit groups, including many-source/many-target
nets represented by native binary edges. All ungrouped styles coordinate both directions of the same node pair.
Unnamed attachments on a shared node side are distributed deterministically;
named ports remain fixed. Duplicate connections use separate obstacle-clearance
lanes. Spacing compresses when the node side cannot fit the requested distance.
Unrelated groups are routed in stable ID order with soft crossing and parallel-overlap costs. Requested `edgeSpacing` guides candidate corridors; it is not a hard separation constraint.

Label sections reserve their already drawn leg so the return leg avoids retracing
it. If both endpoints face the same label side, the exit uses the opposite side.
Terminal leads cannot reverse immediately back over themselves. Near-identical
fractional visibility-grid tracks are merged so tiny steps cannot bypass that
constraint. Facing leads in a short aligned gap are shortened to avoid overlap.
Coincident-port loops follow the port's outward normal, trying smaller corridors
when neighboring geometry blocks the larger loop. When preferred
clearance or soft reservations prevent routing, orthogonal-family strategies
first try bounded, conflict-free two-bend corridors, then retry against actual
obstacle bounds within the remaining search budget and
attempt bounded conflict reduction without discarding the feasible path.

Native layered layout repairs flat tracks that cross node interiors, as well as
label-only collisions. Label clearance accounts for positioned port centers and
their exit leads before rerouting. Compound ports
use actual node dimensions rather than boundary-label envelopes. Parent/child
connections use inward content attachments in both directions, choosing a clear
content side when a child blocks the preferred lead. Layered completion uses a
40,000-node routing budget; standalone routing retains the default below.
The pinned elkjs adapter retains its established flat track geometry.

Shared-source groups try an interior stem toward target nodes or labels first;
exterior candidates on all four sides are ranked by estimated total connection
length. Junctions have no artificial port exit stubs. Sections connect terminals and junctions. Identical
`sharedId` values identify identical trunk geometry: draw it once. Labels still
produce separate sections with a fixed gap, and group updates are atomic. Changes to incident edges also invalidate neighboring
attachments whose placement depends on them.

## Options and fallback behavior

<!-- options from src/routing/types.ts and defaults from src/routing/model.ts -->

| Setting             | Default    | Meaning                                                                           |
| ------------------- | ---------- | --------------------------------------------------------------------------------- |
| `coordinateSpace`   | `"parent"` | Native parent-relative geometry, or resolved world geometry                       |
| `clearance`         | `8`        | Preferred obstacle clearance; attachment nodes use their actual bounds            |
| `radius`            | `10`       | Curve/rounding radius, reduced where needed for safe geometry                     |
| `edgeSpacing`       | `12`       | Shared-terminal spacing, duplicate-edge lanes, and shared corridors               |
| `bendPenalty`       | `10`       | Bend cost including terminal directions; backward turns cost four times as much   |
| `crossingPenalty`   | `80`       | Soft cost per intersection with an earlier unrelated route                        |
| `overlapPenalty`    | `8`        | Cost per unit of parallel overlap within `edgeSpacing`                            |
| `maxSearchNodes`    | `4000`     | Per-edge search expansion and visibility-graph size budget                        |
| `organicIterations` | `12`       | Elastic-string relaxation iterations                                              |
| `edges`             | `{}`       | Per-edge `sourceSide`, `targetSide`, ordered world-space `waypoints`, and `group` |

Every graph edge gets drawable geometry even when constraints are infeasible.
`Route.status` is `"routed"` or `"fallback"`; `Route.diagnostics` explains missing
geometry/ports, blocked paths, exhausted search budgets, violated constraints, or
residual crossings/overlaps (`ROUTE_CONFLICT`). Conflicts remain reported
even if their search penalties are zero.
Fallbacks preserve endpoints and authored waypoints but may cross obstacles or
violate the preferred routing style. They never silently disappear. Malformed
API settings or stale diffs throw; they are programming errors, not route failures.

The search is bounded and deterministic. Curve clearance recursively subdivides overlapping control hulls and actual arc
sweeps instead of treating their bounding boxes as occupied. Unresolved numerical
contacts are conservatively rejected; tight corridors may remain piecewise linear. Curves are not guaranteed
where the requested radius cannot fit. Route selection is deterministic. Search prices length, bends, unrelated crossings, and parallel overlaps within its bounded visibility graph. Finite costs retain a compact crossing when avoiding it requires an excessive detour. This is a deterministic greedy strategy, not a global crossing optimum. Straight routes, fixed ports, and authored waypoints may leave conflicts. Intentional shared trunks are exempt and counted once. Shared-terminal peers retain their existing lane coordination; crossing/overlap costs also apply outside their common attachment region. Curve conflict costs use a 0.5-unit polyline approximation.

Reservations are derived from canonical routes for the current graph in stable edge-group order, never from drag history. Spatial reads include empty corridors; additions, removals, priority changes, and moved routes invalidate later dependent groups. Unaffected canonical outputs may be reused.

## Geometry and rendering

A `RoutePath` has a start point and explicit line, quadratic, cubic, or SVG-style
elliptical arc segments. A `Route` contains sections with node/port, label, or
junction endpoints. All returned route coordinates are world coordinates.

```ts
import {
  flattenPath,
  pathFromPoints,
  roundCorners,
  toSvgPath,
  getPathBounds,
  getPathLength,
  getPointAtLength,
  getTangentAtLength,
  routeToPolylines,
} from "@statelyai/layout/routing";

const rounded = roundCorners(path, { radius: 8 });
const svg = toSvgPath(rounded);
const points = flattenPath(rounded, { tolerance: 0.5 });
const lineSvg = toSvgPath(pathFromPoints(points));
const separatePolylines = routeToPolylines(route, { tolerance: 0.5 });
```

`flattenPath` adaptively approximates curves rather than connecting only their
endpoints. It throws if `maxSegments` cannot meet the requested tolerance.
`getPathBounds` returns conservative control-hull/ellipse bounds. Length, points
at length, and tangents are numerical approximations using the same flattening
tolerance. `roundCorners` rounds line-to-line corners, clamps to adjacent segment
lengths, and preserves existing curves. It does not know obstacles: use a curved
routing strategy when clearance must be checked. `toSvgPath(path, { radius })`
is shorthand for rounding then serialization; `precision` defaults to 6 digits.

## Existing layout and ELK adapters

`getLayoutRoutes(visualGraph)` converts the output of any native layout provider
into structured world-coordinate routes. Orthogonal/polyline points become lines;
ELK-style `splines` control triples become cubic segments. This normalizes routes
already computed by layout; it does not rerun a layout algorithm on fixed nodes.

`getElkRoutes(elkGraph, { routing })` from `@statelyai/layout/elkjs` converts ELK
sections, ports, containing coordinate frames, and hyperedge junction topology.
Routing can also be read from ELK layout options. Supply `routing: "SPLINES"`
when spline control encoding is not recorded on the result.

`routeToGraphPatch(route, { tolerance, offset })` produces an ordinary native
`GraphPatch` for a single-section route. Supply the native parent offset when
writing world coordinates into a parent-relative edge. It refuses multi-section
routes rather than silently discarding label gaps or branching. Render those
through `routeToPolylines` or the structured sections instead.

## Verification and interactive example

`test/routing*.test.ts` covers all strategies, incremental updates, obstacles,
labels, ports, hierarchy, branch groups, curve geometry, and layout adapters.
The large-graph test forbids access to graph arrays during an update and verifies
one affected edge among 1,000 routes. This checks work locality, not a wall-clock
latency guarantee.

Storybook's **Routing / Incremental / Playground** supports node/label dragging,
strategy selection, fallback styling, a lines-only renderer, and update metrics.
**Catalog** displays all strategies on the same fixture.

## Content boundary attachments

<!-- RouteAttachment and EdgeRoutingSettings from src/routing/types.ts -->

`edges[id].sourceAttachment` and `targetAttachment` accept a node-local
`bounds` rectangle and `facing: "inward" | "outward"`. This separates an
attachment boundary from the node's outer obstacle. Routes with an explicit attachment
may traverse that endpoint's interior; other node and label obstacles remain
active. Compound layout supplies header obstacles so inward routes cannot
cut through the header. Named port positions remain relative to the outer node.
