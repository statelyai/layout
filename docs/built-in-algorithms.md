---
title: "Built-in algorithms"
description: "Registered layout algorithms and direct layout functions"
---

The package registers seven algorithms. Each algorithm is also exported as an
object and has a direct layout function.

## Capability table

| ID                | Direct function                | Hierarchy | Ports |
| ----------------- | ------------------------------ | --------- | ----- |
| `layered`         | `getLayeredLayout`             | No        | Yes   |
| `box`             | `getBoxLayout`                 | No        | Yes   |
| `fixed`           | `getFixedLayout`               | Yes       | Yes   |
| `rectpacking`     | `getRectanglePackingLayout`    | No        | Yes   |
| `random`          | `getRandomLayout`              | No        | No    |
| `sporeCompaction` | `getSporeCompactionLayout`     | No        | Yes   |
| `sporeOverlap`    | `getSporeOverlapRemovalLayout` | No        | Yes   |

All current built-in algorithms support full layout. None currently declares
support for incremental, partial, or route-only layout.

## Direct function behavior

Direct functions have this general form:

```ts
function getLayoutFunction(graph: Graph | VisualGraph, options?: Options): VisualGraph;
```

They return the visual graph directly. Use `getLayout` to receive patches,
diagnostics, metrics, scope validation, and cancellation support.

## Layered

`getLayeredLayout` assigns nodes to layers and routes orthogonal edges. It
supports cycles, self-loops, ports, four directions, layer constraints, and
replaceable processing strategies. It rejects graphs with nested nodes.

```ts
const visualGraph = getLayeredLayout(graph, {
  direction: "right",
  spacing: { node: 40, layer: 60 },
  padding: 20,
});
```

See [Layered layout](./layered-layout.md) for all options.

## Box

`getBoxLayout` places nodes in rows. Nodes are ordered by priority, existing
position in interactive mode, and area.

```ts
interface BoxLayoutOptions {
  direction?: LayoutDirection;
  measure?: (node: GraphNode) => NodeSize;
  spacing?: number;
  padding?: number | Partial<LayoutPadding>;
  aspectRatio?: number;
  interactive?: boolean;
  expandNodes?: boolean;
  priority?: (node: GraphNode) => number | undefined;
}
```

| Option        | Default | Description                                 |
| ------------- | ------- | ------------------------------------------- |
| `spacing`     | `15`    | Space between nodes.                        |
| `padding`     | `15`    | Outer padding.                              |
| `aspectRatio` | `1.3`   | Target width-to-height ratio.               |
| `interactive` | `false` | Use existing positions when ordering nodes. |
| `expandNodes` | `false` | Extend nodes to fill their row.             |
| `priority`    | —       | Returns a placement priority for a node.    |

## Fixed

`getFixedLayout` retains existing positions and routes. It supplies missing
node dimensions, port positions, straight edge routes, and edge label bounds.
Missing node positions default to `0`.

```ts
const visualGraph = getFixedLayout(graph, {
  direction: "down",
  measure: (node) => ({ width: 100, height: 50 }),
});
```

## Rectangle packing

`getRectanglePackingLayout` places nodes in input order using rows.

```ts
interface RectanglePackingLayoutOptions {
  direction?: LayoutDirection;
  measure?: (node: GraphNode) => NodeSize;
  spacing?: number;
  padding?: number | Partial<LayoutPadding>;
  targetWidth?: number;
}
```

| Option        | Default              | Description                          |
| ------------- | -------------------- | ------------------------------------ |
| `spacing`     | `20`                 | Space between nodes and rows.        |
| `padding`     | `0`                  | Outer padding.                       |
| `targetWidth` | Calculated from area | Width at which a new row is started. |

## Random

`getRandomLayout` distributes nodes and creates polyline edge routes. A
nonzero seed makes the result repeatable.

```ts
interface RandomLayoutOptions {
  direction?: LayoutDirection;
  measure?: (node: GraphNode) => NodeSize;
  spacing?: number;
  padding?: number | Partial<LayoutPadding>;
  aspectRatio?: number;
  seed?: number;
}
```

| Option        | Default      | Description                              |
| ------------- | ------------ | ---------------------------------------- |
| `spacing`     | `15`         | Used when calculating the drawing area.  |
| `padding`     | `15`         | Outer padding.                           |
| `aspectRatio` | `1.6`        | Drawing-area width-to-height ratio.      |
| `seed`        | Current time | Random seed. `0` also uses current time. |

## SPOrE compaction

`getSporeCompactionLayout` moves nodes closer together while retaining the
sign of the horizontal and vertical displacement between consecutive input
nodes.

```ts
const visualGraph = getSporeCompactionLayout(graph, {
  spacing: 20,
  padding: 0,
});
```

## SPOrE overlap removal

`getSporeOverlapRemovalLayout` retains an existing displacement when it is
large enough and increases it when required to separate consecutive input
nodes.

Both SPOrE functions use `SporeLayoutOptions`:

```ts
interface SporeLayoutOptions {
  direction?: LayoutDirection;
  measure?: (node: GraphNode) => NodeSize;
  spacing?: number;
  padding?: number | Partial<LayoutPadding>;
}
```

`spacing` defaults to `20`. `padding` defaults to `0`.

## Algorithm objects

The exported algorithm objects can be passed directly to `getLayout`:

```ts
import { getLayout, rectanglePackingAlgorithm } from "@statelyai/layout";

const result = await getLayout({
  graph,
  algorithm: rectanglePackingAlgorithm,
  options: { targetWidth: 600 },
});
```
