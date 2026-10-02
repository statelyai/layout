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
cycle breaking
  -> layer assignment
  -> crossing minimization
  -> node placement
  -> edge routing
```

Each phase is replaceable through a typed strategy. Phase outputs are small,
read-only artifacts keyed by the IDs already owned by `@statelyai/graph`.

Native flat layered output gets an obstacle-aware routing repair when its tracks
cross node interiors or labels collide with nodes, labels, or port exit corridors.
Valid tracks and custom routers retain their geometry.
The repair returns cached structured label sections, just like compound routing.
The pinned elkjs provider bypasses this native repair to retain its established
flat geometry contract.

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
