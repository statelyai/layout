---
title: "Layered layout"
description: "Configure the native layered layout pipeline"
---

`getLayeredLayout` places nodes into layers and routes edges between them.

## Signature

```ts
function getLayeredLayout<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options?: LayeredLayoutOptions,
): VisualGraph<N, E, G, P>;
```

## Options

```ts
interface LayeredLayoutOptions {
  direction?: LayoutDirection;
  spacing?: Partial<LayeredSpacing>;
  padding?: number | Partial<LayoutPadding>;
  constraints?: LayoutConstraints;
  measure?: (node: GraphNode) => NodeSize;
  crossingSweeps?: number;
  strategies?: LayeredStrategies;
}
```

| Option           | Default                   | Description                          |
| ---------------- | ------------------------- | ------------------------------------ |
| `direction`      | Graph direction or `down` | Direction in which layers advance.   |
| `spacing.node`   | `40`                      | Space between nodes in one layer.    |
| `spacing.layer`  | `60`                      | Space between adjacent layers.       |
| `padding`        | `0` on every side         | Space around the result.             |
| `constraints`    | —                         | Graph layout constraints.            |
| `measure`        | `100` by `50` fallback    | Supplies dimensions for a node.      |
| `crossingSweeps` | `4`                       | Barycenter minimization sweep count. |
| `strategies`     | Built-in strategies       | Replacements for individual phases.  |

`padding` may be a number or an object with `top`, `right`, `bottom`, and
`left` fields.

```ts
const visualGraph = getLayeredLayout(graph, {
  direction: "right",
  spacing: { node: 24, layer: 72 },
  padding: { top: 16, right: 24, bottom: 16, left: 24 },
});
```

## Layer constraints

The layered implementation reads the `layer` constraint from
`LayoutConstraints`. The callback returns the assigned layer for a node.

```ts
const visualGraph = getLayeredLayout(graph, {
  constraints: {
    layer: (node) => (node.id === "start" ? 0 : undefined),
  },
});
```

## Processing phases

The pipeline runs these phases in order:

1. Cycle breaking
2. Layer assignment
3. Crossing minimization
4. Node placement
5. Edge routing

The built-in strategy exports are:

| Phase                 | Export                            |
| --------------------- | --------------------------------- |
| Cycle breaking        | `breakCyclesWithDepthFirstSearch` |
| Layer assignment      | `assignLayersByLongestPath`       |
| Crossing minimization | `minimizeCrossingsWithBarycenter` |
| Node placement        | `placeNodesInLayers`              |
| Edge routing          | `routeEdgesOrthogonally`          |

## Replace a strategy

Supply only the phases that need replacement. Other phases continue to use
the built-in implementations.

```ts
import { getLayeredLayout, routeEdgesOrthogonally, type EdgeRouter } from "@statelyai/layout";

const routeEdges: EdgeRouter = (input, orientation, placement) => {
  return routeEdgesOrthogonally(input, orientation, placement);
};

const visualGraph = getLayeredLayout(graph, {
  strategies: { routeEdges },
});
```

Strategies exchange read-only maps and sets keyed by graph entity IDs. Their
types are listed in [API reference](./api-reference.md).

## Output

The result contains:

- Node position and size.
- Positioned ports when ports are present.
- Orthogonal route points for each edge.
- Edge routing set to `orthogonal`.
- Edge label bounds centered on the route midpoint.

## Limitations

The current native layered implementation accepts flat graphs. It throws
`UnsupportedLayoutError` when a node has `parentId`.

The built-in `layeredAlgorithm` supports full layout. It does not currently
declare incremental, partial, or route-only support.
