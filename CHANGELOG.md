# @statelyai/layout

## 0.3.0

### Minor Changes

- 1c05bea: Solve native compound layout from complete occupied envelopes: measured header bands, asymmetric content padding, children, and edge labels. Retain finalized compound sizes during ancestor placement and return explicit compound geometry and world-space route sections. Add inward content attachments and outward reentry hooks without changing the pinned ELK compatibility contract.
- 7fa4f37: Add native TypeScript edge routing with immutable snapshots, incremental native graph diffs, persistent spatial/dependency indexes, route patches, and explicit fallback diagnostics. Include straight, Bézier, orthogonal, polyline, octilinear, curved, organic, parallel, self-loop, fan, bus, and bundle strategies; structured line/curve/arc geometry; SVG and polyline rendering utilities; and adapters for native layout and ELK section geometry.
  
  Incremental routing produces the same geometry as fresh routing for the same graph and settings. Previous snapshots cache graph geometry, spatial dependencies, and unaffected results; previous drawn paths do not constrain routing.
  
  Account for endpoint directions in route search, complete octilinear diagonal/grid intersections, distribute shared-node attachments and duplicate-edge corridors, and prefer interior source-facing shared trunks. Incremental invalidation includes coordinated neighbors.
  
  Coordinate unrelated groups with deterministic soft crossing/overlap costs, report residual conflicts, and incrementally invalidate route dependencies. Encode source/port group keys without delimiter collisions.

## 0.2.0

### Minor Changes

- 0331017: Add native partial layout with independent node and edge selection, route/label
  permissions, affected-edge repair, and route-only orthogonal routing. Preserve
  unselected geometry and emit field-specific patches and repair diagnostics.

  Add serializable alignment, distribution, pin, linear, and waypoint constraints
  with required/soft strengths. Keep full ELK compatibility behavior unchanged.

### Patch Changes

- b7cf7c2: Route native and elkjs-compatible layout through one typed internal engine seam, align the compatibility entry's public types with elkjs 0.11.1, reproduce its Random and Box SIMPLE geometry without weakening native behavior, preserve provider output policy for non-routing algorithms, and provide its ESM and CommonJS main, bundled, API, and worker package aliases with merged layout defaults and terminal error propagation.

## 0.1.3

### Patch Changes

- 57da857: Keep inline edge-label corridors compact by treating center-label layers as edge geometry around exterior ports. Preserve the larger of normal layer spacing and port protrusion plus edge-node spacing, and center labels and endpoints across all four layout directions.

## 0.1.2

### Patch Changes

- 63e4bf8: Separate interior inline transition labels on orthogonal routes, as well as exterior labels, into collision-free cross-axis lanes. Preserve their flow coordinates and endpoint anchors when moving route tracks.

## 0.1.1

### Patch Changes

- b85b261: Make exported statechart source compatible with consumers enabling noUncheckedIndexedAccess. Preserve runtime behavior and verify indexed access with the package TypeScript configuration.

## 0.1.0

### Minor Changes

- 0c9aecf: Add opt-in ELK statechart policy compilation and bounded layout selection with initial-anchored paths, common-exit detection, scoped directions, parallel-label repair candidates and diagnostic geometry scores.

### Patch Changes

- e2cd671: Preserve node separation for fixed-port fan-out and remove cycles reintroduced by port preferences. Preserve inline-label space during compaction and use the reserved inter-rank interval when no dedicated label layer exists. Reserve labeled self-loop clearance on all assigned sides, preserve loop tracks through compaction and hierarchy restoration, and honor normalized edge/label option inheritance. Allow FIRST/FIRST_SEPARATE nodes to have self-loops. Includes minimal anonymous graph regressions in all four directions and captured integration fixtures.

## 0.0.5

### Patch Changes

- 0033c84: Keep exterior inline edge labels and their orthogonal route tracks clear of overlapping nodes and labels.

## 0.0.4

### Patch Changes

- 62f4980: Place backward edge labels beside the corridor between their endpoint layers, including dimension-only labels from compatibility adapters.

## 0.0.3

### Patch Changes

- 5605a00: Match ELK's free-port, compound-size, and inline-label placement for Viz's cycle layouts, and expose the legacy bundled-ELK subpath for drop-in package aliases.

## 0.0.2

### Patch Changes

- f30e369: Build package exports when installing directly from Git.
- 06cb351: Complete the public API reference and update the release guidance.
- 9730635: Keep fixed-side routes attached after layered post-compaction, preserve polyline and spline geometry, retain inline-label flow gaps in both directions, match ELK fan-in/fan-out port ordering, and route long cycles and self-loops outside the graph without crossing nodes or swapping flow layers.

## 0.0.1

### Patch Changes

- 1580b90: Add a flat API reference.
