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

| Type                     | Description                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `AcyclicOrientation`     | Reversed edge IDs selected during cycle breaking.                                        |
| `CrossingMinimizer`      | Crossing minimization function.                                                          |
| `CycleBreaker`           | Cycle-breaking function.                                                                 |
| `EdgeRouter`             | Edge-routing function.                                                                   |
| `EdgeRoutes`             | Route points keyed by edge ID.                                                           |
| `LayerAssigner`          | Layer-assignment function.                                                               |
| `LayerAssignment`        | Layer numbers keyed by node ID.                                                          |
| `LayeredLayoutOptions`   | Options for layered layout.                                                              |
| `LayeredPhaseInput`      | Common input supplied to layered phases.                                                 |
| `LayeredSpacing`         | Node and layer spacing.                                                                  |
| `LayeredStrategies`      | Optional phase replacements.                                                             |
| `CompoundLayoutOptions`  | Per-compound header, content padding, direction, and minimum content size.               |
| `CompoundLayoutGeometry` | Parent-relative outer bounds and local header/content rectangles.                        |
| `CompoundEdgeAttachment` | Content or outer endpoint boundary intent.                                               |
| `CompoundVisualGraph`    | Native output with compound geometry and world-space route sections.                     |
| `LayoutPadding`          | Top, right, bottom, and left padding.                                                    |
| `LayerOrder`             | Ordered node IDs grouped by layer; optional physical port state retained between sweeps. |
| `NodePlacement`          | Node rectangles keyed by node ID.                                                        |
| `NodePlacer`             | Node-placement function.                                                                 |
| `NodeSize`               | Node width and height.                                                                   |

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

`createLayeredScopePipeline` and `LayeredCrossingPhase` are internal coordination
exports. The generator yields the prepared input, orientation, assignment and
standalone minimizer before placement/routing; resume with a `LayerOrder` to
complete the scope. Some compound, component and no-layout paths finish without
yielding. This seam does not yet coordinate the adapter's hierarchy sweeps.

`@statelyai/layout/layered` exports the layered layout function, algorithm,
strategy functions, and layered types listed above. It does not export the
general registry or the other built-in algorithms.

`LayeredLayoutOptions.compound(node)` reserves each compound's complete occupied
geometry before ancestor placement. `edgeAttachment(edge)` selects inward
content boundaries or outward reentry hooks. `getLayeredLayout` returns
`compoundGeometry` and `compoundRoutes` maps in addition to the visual graph.
Node positions/outer bounds are parent-relative; label positions and route
sections are world-relative (`edgeCoordinateSpace: "world"`). Unlabeled edges
have finite zero-sized label rectangles. Authoring discards full-layout geometry
and route caches; `getLayoutRoutes` also checks cached sections against current
geometry before using them. Ancestor/descendant labels are always reserved
beside the child boundary; this is structural rather than a label option. See [native compound geometry](../README.md#native-compound-geometry)
and the [matched visual proof](images/native-compound/README.md).

`LayeredLayoutOptions.routing` accepts `{ strategy, settings }` for a synchronous
post-layout replacement. Initial routes are discarded before the strategy receives
finalized world-space geometry. The result preserves all node/port/label/compound
placement and caches the replacement's structured routes. `getLayout` currently
supports this option for unconstrained full layout only. Async or scoped replacements
can use standalone routing after layout. `strategies.routeEdges` remains an initial
phase override.

## elkjs entry point

`@statelyai/layout/elkjs` has a default `ELK` class export and these type
exports:

- `ElkConstructorArguments`
- `ELK`
- `ElkCommonDescription`
- `ElkEdge`
- `ElkEdgeSection`
- `ElkExtendedEdge`
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
- `ElkPrimitiveEdge`
- `ElkShape`
- `LayoutOptions`
- `LaidOutElkNode`

Edge labels with `noLayout: true`, or with no `text`, `width` or `height`, are
preserved in compatibility output but do not reserve layout space. Unlike ELK, a
label with only `width` and `height` does reserve space, so apps that render
label text themselves get clear labels.

The compatibility package also exposes the elkjs 0.11.1 migration subpaths
`lib/main.js`, `lib/elk-api.js`, `lib/elk.bundled.js`, `lib/elk-worker.js`, and
`lib/elk-worker.min.js`. `elk-api.js` requires `workerUrl` or `workerFactory`;
`main.js` and `elk.bundled.js` provide the in-process worker fallback. Every
migration subpath supports ESM import and CommonJS require.

## Authoring constraints

<!-- authoring constraint exports from src/constraints.ts and src/index.ts -->

`c.align`, `c.distribute`, `c.pin`, `c.linear`, and `c.waypoint` construct
serializable `LayoutConstraint` values for `getLayout({ constraints })`.
Exports include `GeometryReference`, `GeometryAttribute`, `ConstraintStrength`,
`AlignConstraint`, `DistributeConstraint`, `PinConstraint`, `LinearConstraint`,
and `WaypointConstraint`.

See [authoring layout](authoring-layout.md) for partial scope permissions,
constraint strengths, failure behavior, and route-only defaults.

## Standalone routing

<!-- routing exports from src/routing/index.ts and src/elkjs/routes.ts -->

`@statelyai/layout/routing` (also exported from the root) provides
`routingStrategies`, the twelve named `*Routing` strategies, `applyRoutePatches`,
`pathFromPoints`, `pathFromSplinePoints`, `flattenPath`, `roundCorners`,
`toSvgPath`, `getPathBounds`, `getPathLength`, `getPointAtLength`,
`getTangentAtLength`, `getLayoutRoutes`, `routeToPolylines`, and
`routeToGraphPatch`. `@statelyai/layout/elkjs` additionally exports `getElkRoutes`.

Every native strategy supports synchronous `route(graph, settings?)` and
`update(graph, previousSnapshot, graphDiff, settings?)`. The extensible
`RoutingStrategy` interface also permits promises. Results preserve fixed
geometry and contain explicit fallback status. See the [routing reference](routing.md)
for signatures, snapshot ownership, options, capabilities, and limitations.
