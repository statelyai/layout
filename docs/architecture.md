# Architecture

## Graph ownership

`@statelyai/graph` is the only public graph model. Layout reads `Graph` or
`VisualGraph` and returns `VisualGraph` plus ordinary `GraphPatch` values.
Hierarchy uses `parentId`, ports use `GraphPort`, node geometry uses
`x`/`y`/`width`/`height`, and edge routes use `points` and `routing`.

Algorithm implementations may compile IDs to indexed arrays for hot loops.
That representation is private, temporary, and never becomes an interchange
format.

## Public layers

1. `getLayeredLayout(graph, options)` conforms to `@statelyai/graph`'s
   `LayoutFn` convention.
2. `getLayout(request)` adds algorithm selection, execution scope,
   cancellation, patches, diagnostics, and measurements.
3. The `/elkjs` compatibility adapter translates at the package boundary. ELK
   option names do not enter the native API.

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

## Compatibility target

Compatibility has three independently measured levels:

1. Input/output API compatibility through the `/elkjs` adapter.
2. Algorithmic invariants and deterministic behavior.
3. Geometry comparison against elkjs with tolerances and quality metrics.

Exact coordinates are not treated as the only correctness criterion: crossing
count, bends, area, constraint violations, and displacement matter too.
