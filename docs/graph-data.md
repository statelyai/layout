---
title: "Graph data"
description: "Graph input and visual graph output fields used by layout"
---

The native APIs use the graph model from `@statelyai/graph`. They do not use
ELK JSON at the native package boundary.

## Input types

Every layout function accepts either of these values:

```ts
Graph<N, E, G, P> | VisualGraph<N, E, G, P>;
```

The generic parameters contain application data:

| Parameter | Data stored on |
| --------- | -------------- |
| `N`       | Nodes          |
| `E`       | Edges          |
| `G`       | The graph      |
| `P`       | Ports          |

The layout functions preserve these values in the returned graph.

## Node geometry

A visual node contains these required geometry fields:

```ts
{
  x: number;
  y: number;
  width: number;
  height: number;
}
```

Algorithms use existing positive `width` and `height` values when available.
Most algorithms also accept a `measure` function for nodes without usable
dimensions.

```ts
const visualGraph = getBoxLayout(graph, {
  measure: (node) => ({
    width: node.label ? node.label.length * 8 + 24 : 100,
    height: 48,
  }),
});
```

## Edge geometry

A laid-out edge may contain:

```ts
{
  x: number;
  y: number;
  width: number;
  height: number;
  points: readonly { x: number; y: number }[];
  routing: 'orthogonal' | 'polyline';
}
```

`points` contains the route in graph coordinates. `x`, `y`, `width`, and
`height` describe the edge label bounds when the graph contains label
geometry.

## Ports

Ports remain part of their owning node. Built-in algorithms that support
ports place them relative to the resulting node bounds. Edges continue to
refer to ports with their graph fields, including `sourcePort` and
`targetPort`.

Check an algorithm's `capabilities.ports` value before relying on port
placement. See [Built-in algorithms](./built-in-algorithms.md).

## Direction

Native layout direction is one of:

```ts
type LayoutDirection = "up" | "down" | "left" | "right";
```

An option supplied to the layout function takes precedence over
`graph.direction`. Algorithms use their documented default when neither is
set.

## Input mutation

Native layout functions return new graph, node, and edge objects. They do not
modify the input graph. Application data and graph IDs are retained.

The `@statelyai/layout/elkjs` compatibility class follows the elkjs API and
updates the ELK graph passed to `layout`. See
[elkjs compatibility](./elkjs-compatibility.md).
