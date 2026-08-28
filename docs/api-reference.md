---
title: "API reference"
description: "Exports from @statelyai/layout and its package entry points"
---

## Main entry point

<!-- public exports from src/index.ts -->

Import these exports from `@statelyai/layout`.

### Layout execution

| Export                    | Description                              |
| ------------------------- | ---------------------------------------- |
| `getLayout`               | Runs a registered or inline algorithm.   |
| `getLayoutAlgorithm`      | Returns a registered algorithm by ID.    |
| `registerLayoutAlgorithm` | Adds or replaces a registered algorithm. |

### Direct layout functions

| Export                         | Options type                    |
| ------------------------------ | ------------------------------- |
| `getBoxLayout`                 | `BoxLayoutOptions`              |
| `getFixedLayout`               | `FixedLayoutOptions`            |
| `getLayeredLayout`             | `LayeredLayoutOptions`          |
| `getRandomLayout`              | `RandomLayoutOptions`           |
| `getRectanglePackingLayout`    | `RectanglePackingLayoutOptions` |
| `getSporeCompactionLayout`     | `SporeLayoutOptions`            |
| `getSporeOverlapRemovalLayout` | `SporeLayoutOptions`            |

### Algorithm objects

| Export                         | ID                |
| ------------------------------ | ----------------- |
| `boxAlgorithm`                 | `box`             |
| `fixedAlgorithm`               | `fixed`           |
| `layeredAlgorithm`             | `layered`         |
| `randomAlgorithm`              | `random`          |
| `rectanglePackingAlgorithm`    | `rectpacking`     |
| `sporeCompactionAlgorithm`     | `sporeCompaction` |
| `sporeOverlapRemovalAlgorithm` | `sporeOverlap`    |

### Execution types

| Type                     | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `AnyGraph`               | A graph with all data parameters set to unknown. |
| `LayoutAlgorithm`        | Contract implemented by an algorithm.            |
| `LayoutCapabilities`     | Features declared by an algorithm.               |
| `LayoutDiagnostic`       | Structured layout message.                       |
| `LayoutDirection`        | `up`, `down`, `left`, or `right`.                |
| `LayoutExecutionContext` | Scope, cancellation, diagnostics, and timing.    |
| `LayoutMetrics`          | Overall timing and graph counts.                 |
| `LayoutPhaseMetrics`     | Timing for one named phase.                      |
| `LayoutRequest`          | Input to `getLayout`.                            |
| `LayoutResult`           | Output from `getLayout`.                         |
| `LayoutScope`            | Full, incremental, partial, or route-only scope. |

### Layered strategy functions

| Export                            | Description                      |
| --------------------------------- | -------------------------------- |
| `breakCyclesWithDepthFirstSearch` | Produces an acyclic orientation. |
| `assignLayersByLongestPath`       | Assigns a layer to each node.    |
| `minimizeCrossingsWithBarycenter` | Creates a crossing minimizer.    |
| `placeNodesInLayers`              | Produces node rectangles.        |
| `routeEdgesOrthogonally`          | Produces orthogonal edge routes. |

### Layered types

| Type                   | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `AcyclicOrientation`   | Reversed edge IDs selected during cycle breaking. |
| `CrossingMinimizer`    | Crossing minimization function.                   |
| `CycleBreaker`         | Cycle-breaking function.                          |
| `EdgeRouter`           | Edge-routing function.                            |
| `EdgeRoutes`           | Route points keyed by edge ID.                    |
| `LayerAssigner`        | Layer-assignment function.                        |
| `LayerAssignment`      | Layer numbers keyed by node ID.                   |
| `LayeredLayoutOptions` | Options for layered layout.                       |
| `LayeredPhaseInput`    | Common input supplied to layered phases.          |
| `LayeredSpacing`       | Node and layer spacing.                           |
| `LayeredStrategies`    | Optional phase replacements.                      |
| `LayoutPadding`        | Top, right, bottom, and left padding.             |
| `LayerOrder`           | Ordered node IDs grouped by layer.                |
| `NodePlacement`        | Node rectangles keyed by node ID.                 |
| `NodePlacer`           | Node-placement function.                          |
| `NodeSize`             | Node width and height.                            |

### Layered option types

| Type                           | Description                                  |
| ------------------------------ | -------------------------------------------- |
| `LayeredAdvancedOptions`       | Simplified names for ELK layered options.    |
| `ElkLayeredOptionId`           | Supported full ELK layered option IDs.       |
| `ElkLayeredOptionName`         | Supported simplified layered option names.   |
| `ElkLayeredOptionValueByName`  | Value type lookup by simplified option name. |
| `CycleBreakingStrategy`        | Supported cycle-breaking strategy names.     |
| `CrossingMinimizationStrategy` | Supported crossing-minimization names.       |
| `EdgeRoutingStyle`             | Supported layered edge-routing styles.       |
| `LayeringStrategy`             | Supported layer-assignment strategy names.   |
| `NodePlacementStrategy`        | Supported node-placement strategy names.     |

### Additional strategy exports

The layered entry point also exports:

- Cycle breakers: `breakCyclesByModelOrder`, `breakCyclesByStronglyConnectedConnectivity`, `breakCyclesByStronglyConnectedNodeType`, `breakCyclesGreedily`, `breakCyclesGreedilyByModelOrder`, `breakCyclesInteractively`, `breakCyclesWithModelOrderDepthFirstSearch`, and `breakCyclesWithModelOrderBreadthFirstSearch`.
- Layer assigners: `assignLayersByLongestPathToSink`, `assignLayersByBreadthFirstModelOrder`, `assignLayersByDepthFirstModelOrder`, `assignLayersInteractively`, `assignLayersWithCoffmanGraham`, `assignLayersWithNetworkSimplex`, `assignLayersWithMinWidth`, and `assignLayersWithStretchWidth`.
- Crossing minimizers: `minimizeCrossingsWithMedian`, `minimizeCrossingsInteractively`, and `minimizeCrossingsWithModelOrder`.
- Node placers: `placeNodesInteractively`, `placeNodesWithBrandesKoepf`, `placeNodesWithLinearSegments`, and `placeNodesWithNetworkSimplex`.
- Edge routers: `routeEdgesWithPolylines` and `routeEdgesWithSplines`.

`minimizeCrossingsWithBarycenter` and `minimizeCrossingsWithMedian` accept an optional sweep count. The default is 7.

### Layered option metadata

`LayeredAdvancedOptions` contains ELK layered option names without vendor prefixes. `elkLayeredOptionDefinitions` contains option names, ELK IDs, value types, and targets. `elkLayeredEnumValues` contains valid enum values.

`toElkLayeredOptions(options)` converts direction, padding, spacing, and advanced settings to ELK option IDs. `fromElkLayeredOptionId(id)` converts an ELK option ID to its simplified public name.

### Errors

#### `LayoutError`

```ts
class LayoutError extends Error {
  readonly code: string;
}
```

`getLayout` uses `UNKNOWN_ALGORITHM` and `INVALID_GRAPH` codes.

#### `UnsupportedLayoutError`

```ts
class UnsupportedLayoutError extends LayoutError {}
```

The error code is `UNSUPPORTED_LAYOUT`.

## Layered entry point

<!-- public exports from src/layered/index.ts -->

`@statelyai/layout/layered` exports the layered layout function, algorithm,
strategy functions, and layered types listed above. It does not export the
general registry or the other built-in algorithms.

## elkjs entry point

`@statelyai/layout/elkjs` has a default `ELK` class export and these type
exports:

- `ElkConstructorArguments`
- `ElkCommonDescription`
- `ElkEdge`
- `ElkEdgeSection`
- `ElkGraphElement`
- `ElkId`
- `ElkLabel`
- `ElkLayoutAlgorithmDescription`
- `ElkLayoutArguments`
- `ElkLayoutCategoryDescription`
- `ElkLayoutOptionDescription`
- `ElkLogging`
- `ElkNode`
- `ElkPoint`
- `ElkPort`
- `ElkShape`
- `LaidOutElkNode`
