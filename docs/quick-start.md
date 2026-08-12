---
title: "Quick start"
description: "Install the package and create a visual graph"
---

## Install the packages

Install `@statelyai/layout` and its graph peer dependency.

```bash
pnpm add @statelyai/layout @statelyai/graph
```

## Create a graph

Create a graph with stable node and edge IDs. Edges refer to nodes through
`sourceId` and `targetId`.

```ts
import { createGraph } from "@statelyai/graph";

const graph = createGraph({
  id: "checkout",
  nodes: [
    { id: "cart", width: 120, height: 60 },
    { id: "payment", width: 120, height: 60 },
    { id: "complete", width: 120, height: 60 },
  ],
  edges: [
    { id: "cart-payment", sourceId: "cart", targetId: "payment" },
    {
      id: "payment-complete",
      sourceId: "payment",
      targetId: "complete",
    },
  ],
});
```

Nodes may include dimensions. A layout function uses its default node size
when dimensions are absent or may call a supplied `measure` function.

## Run a layout function

Use a direct layout function when only the laid-out graph is required.

```ts
import { getLayeredLayout } from "@statelyai/layout";

const visualGraph = getLayeredLayout(graph, {
  direction: "right",
  spacing: {
    node: 32,
    layer: 80,
  },
  padding: 24,
});
```

Each returned node has `x`, `y`, `width`, and `height`. Each routed edge has
`points` and `routing`.

## Run the general layout API

Use `getLayout` when the caller also needs patches, diagnostics, timings,
algorithm selection, or cancellation.

```ts
import { getLayout } from "@statelyai/layout";

const controller = new AbortController();

const result = await getLayout({
  graph,
  algorithm: "layered",
  options: { direction: "right" },
  signal: controller.signal,
});

result.graph;
result.patches;
result.diagnostics;
result.metrics;
```

`getLayout` is asynchronous because registered algorithms may return a
promise. The current built-in algorithms execute synchronously.

## Select another built-in algorithm

Pass a registered algorithm ID to `getLayout`.

```ts
const result = await getLayout({
  graph,
  algorithm: "rectpacking",
  options: { spacing: 16, targetWidth: 480 },
});
```

See [Built-in algorithms](./built-in-algorithms.md) for the registered IDs and
their options.
