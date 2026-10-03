# Architecture

## Graph ownership

`@statelyai/graph` is the only public graph model. Layout reads `Graph` or
`VisualGraph` and returns `VisualGraph` plus ordinary `GraphPatch` values.
Hierarchy uses `parentId`, ports use `GraphPort`, node geometry uses
`x`/`y`/`width`/`height`, and layout edge routes use `points` and `routing`. Standalone routing consumes
the same graph and returns structured route snapshots and patches; it does not
introduce a second graph model. See [routing](routing.md).

Algorithm implementations may compile IDs to indexed arrays for hot loops.
That representation is private, temporary, and never becomes an interchange
format.

## Public layers

<!-- public entry points from package.json#exports and src/index.ts -->

1. `getLayeredLayout(graph, options)` conforms to `@statelyai/graph`'s
   `LayoutFn` convention.
2. `getLayout(request)` adds algorithm selection, execution scope,
   cancellation, patches, diagnostics, and measurements.
3. The isolated `@statelyai/layout/elkjs` entry translates ELK JSON at the
   package boundary. Native compound geometry evolves independently of the pinned compatibility policy.
4. `@statelyai/layout/routing` exports standalone strategies, immutable snapshots,
   incremental patches, and renderer-independent path utilities.
5. The pinned elkjs migration subpaths expose ESM and CommonJS adapters over an
   in-process implementation of the elkjs worker message interface.

`getLayout` and the elkjs adapter dispatch through one typed internal layout
engine; direct native layout functions are the same underlying algorithm
implementations. ELK-specific graph translation, defaults, coercion, errors,
and serialization remain local to the versioned compatibility adapter. A
shared algorithm only gains a narrow compatibility policy when its behavior
must genuinely diverge.

For example, native Random routing connects the actual endpoints, while the
pinned compatibility policy reproduces elkjs 0.11.1's source-as-target routing
quirk and provider-sized graph bounds. Box and Rectangle Packing preserve
provider-owned bounds and authored edge sections rather than accepting routes
or normalization invented by the shared fixed-geometry completion step.

## Routing snapshots

<!-- immutable routing implementation from src/routing/engine.ts -->

Standalone routing is a separate operation from node placement. Every built-in
strategy has `route` and `update`; the latter accepts the previous immutable
snapshot and a native `GraphDiff`. Persistent maps and spatial indexes copy only
changed branches. Routing state belongs to the caller's snapshot rather than a
global cache or mutable session. World-coordinate route sections represent lines,
curves, label gaps, and shared junctions. Renderers read one snapshot per geometry
revision. Full layout's existing ELK compatibility contract remains unchanged.

## Layered pipeline

<!-- built-in measured phases from src/layered/index.ts -->

```text
constraint edge orientation
  -> cycle breaking
  -> center-label dummy insertion
  -> layer assignment
  -> long-edge splitting
  -> inverted-port and north/south-port preprocessing
  -> FIRST/LAST layer-order preprocessing
  -> crossing minimization
  -> label dummy switching and side selection
  -> node placement
  -> edge routing
  -> long-edge joining and north/south-port restoration
  -> grouped edge-length compaction
  -> label dummy removal
```

Before cycle breaking, native constraint processing orients FIRST/LAST edges and
whole feedback nodes using fixed-port net flow. Mixed-flow nodes stay forward;
individual port directions do not independently reverse their edges.

FIRST/LAST ordering is applied to the crossing phase's initial layer order;
it is not reapplied after the sweep. Reapplying it discards the minimizer's result.
The internal `createLayeredScopePipeline` generator can suspend an ordinary scope
before crossing minimization and resume with an externally coordinated order.
The internal sweep session exposes first-layer randomization, individual sweeps,
node/port snapshots, restoration and a shared random stream. Standalone crossing
minimization now uses the shared hierarchy counter coordinator with one scope.
For a prepared scope tree the coordinator enters coupled children between parent
layers, sums their crossings, and retains their candidate orders together.
Bottom-up scopes run in reverse breadth-first order before their parents. The
caller supplies sweepiness classification and boundary-port synchronization.
The compatibility adapter prepares the entire boundary scope tree before
placement, coordinates parent and child port orders, then finishes children
before refreshing parent dimensions and physical ports. Child heuristics retain
their local random stream; the root counter uses the root stream. Coordinated
orders retain authored model-order and greedy-switch policies. Exact sweepiness
classification for non-flow-side and feedback ports, deeper hierarchies, labels
remain parity work. Native orthogonal junctions are emitted on physical routing segments, including same-layer inverted-port links, and retain ownership through joining, compaction and adapter serialization. Broad junction parity remains incomplete.

Brandes-Koepf compaction applies straightening thresholds while placing blocks,
tracks completed blocks and used connections, and queues unresolved boundary
edges. After class shifts it retries those edges within available space in either
direction. Threshold and retry candidates follow physical port order. Tagged
external dummies use port/edge/label spacing rather than normal-node spacing.

Fixed-port self-loops retain the explicit anchor and the implicit endpoint's
flow-side anchor. The perimeter route is computed in canonical coordinates and
mapped to the selected direction. Loop reservations follow the actual port face;
port-to-node self-loops are excluded from inter-node junction and extra-pixel
bounds reconstruction by resolving endpoint ownership.

Each main phase is replaceable through a typed strategy. Phase outputs are small,
read-only artifacts keyed by the IDs already owned by `@statelyai/graph`.

Native flat layered output gets an obstacle-aware routing repair when its tracks
cross node interiors or labels collide with nodes, labels, or port exit corridors.
Valid tracks and custom routers retain their geometry.
The repair preserves the initial face of fixed implicit endpoints, using the
initial outward lead to disambiguate corner attachments. FIXED_POS and FIXED_RATIO
implicit attachments retain their coordinates via private routing-only ports;
those ports never appear in public nodes, edges, or cached endpoint references.
Route search reserves its own terminal leads against collinear retracing,
including soft search and hard/optimization retries. It returns cached
structured label sections, just like compound routing.
The pinned elkjs provider bypasses this native repair to retain its established
flat geometry contract.

Layered layout completes its initial placement and routing before applying an
optional `routing: { strategy, settings }` replacement. The replacement receives
world-space geometry with initial paths and route caches removed. It owns every
new edge route while node, port, label, and compound geometry stay fixed. The
existing `strategies.routeEdges` hook remains part of initial layout. Replacement
through `getLayout` currently requires unconstrained full layout; standalone
routing handles other execution scopes and async strategies.

## Compatibility target

Compatibility has three independently measured levels:

1. Input/output API compatibility through the isolated `elkjs` adapter.
2. Algorithmic invariants and deterministic behavior.
3. Exact normalized geometry comparison against elkjs as the compatibility
   target, with floating coordinates compared after rounding to 12 decimal
   digits only when operation order differs.

Native layout additionally tracks quality metrics such as crossing count,
bends, area, constraint violations, and displacement. Those metrics may justify
native improvements, but they cannot substitute for exact elkjs compatibility.

Native inverted-port preprocessing follows long-edge splitting and precedes
crossing minimization. Fixed endpoints facing against canonical flow receive
same-layer long-edge dummies, including reversed edges and both endpoints.
Their private ports retain canonical input/output sides in every direction.
Crossing order and placement therefore see the required in-layer connections;
joining maps all segments back to the authored edge. Orthogonal routing uses
the same exterior corridor for the in-layer segment, rather than routing it
around the entire graph as feedback. Custom initial routers receive the expanded
graph just as they receive ordinary long-edge dummies.

Fixed-side feedback edges also retain proper long-edge splitting. Skipping their
intermediate layers made Brandes–Koepf alignment invalid once inverted-port
dummies were added; a retained random counterexample exposed node overlaps.

Grouped EDGE_LENGTH compaction sees normal nodes and LABEL dummies, with unary
LONG_EDGE and inverted-port chains joined first. Segment movement maps back to
private expanded routes before public joining. North/south port dummies remain
port constraints, not eligible label-switch destinations; their restoration uses
the current graph after label switching. This follows ELK processor order rather
than treating every internal dummy as an independently compactable node.

External-port dummy construction now preserves ELK's pre-direction-transform
size, anchor, border offset, side, layer/edge constraints and order/ratio metadata.
An internal symbol carries that origin through native graph conversion and
phase object spreads without adding public JSON fields. The compatibility
adapter creates an explicit boundary port and separate-layer constraint for its
implicit compound crossings; it reconnects the actual selected child-route
endpoint rather than a descendant midpoint. Child scopes inherit layout
direction, and statechart path scoring follows the same inheritance.

This is partial hierarchy integration. Native hierarchical port positioning,
parent-port geometry transfer, internal/external route joining and coordinated
scope phase scheduling remain required. The public compound solver still has a
separate scope/routing path; it must share the completed hierarchy foundation.

Movable self-loop exterior labels contribute directional envelopes before BK placement. Stacked routes include preceding label extents, and physical loop sides determine label alignment after direction transforms. Self-loop bounds omit the generic center-label pixel. Inline labels, additional loop orderings and mixed fixed-port labels remain broader parity work.
