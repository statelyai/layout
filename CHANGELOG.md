# @statelyai/layout

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
