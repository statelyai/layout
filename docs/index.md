---
title: "@statelyai/layout"
description: "Graph layout APIs for @statelyai/graph"
---

`@statelyai/layout` provides layout algorithms for graphs created with
`@statelyai/graph`. The package accepts `Graph` or `VisualGraph` values and
returns `VisualGraph` values.

## Install

```bash
pnpm add @statelyai/layout @statelyai/graph
```

## Entry points

| Entry point                 | Contents                                   |
| --------------------------- | ------------------------------------------ |
| `@statelyai/layout`         | Native layout APIs, algorithms, and types  |
| `@statelyai/layout/layered` | Layered layout APIs, strategies, and types |
| `@statelyai/layout/elkjs`   | elkjs-compatible class and ELK graph types |

## Basic use

```ts
import { createGraph } from "@statelyai/graph";
import { getLayeredLayout } from "@statelyai/layout";

const graph = createGraph({
  nodes: [{ id: "a" }, { id: "b" }],
  edges: [{ id: "a-to-b", sourceId: "a", targetId: "b" }],
});

const visualGraph = getLayeredLayout(graph, {
  direction: "right",
});
```

`getLayeredLayout` returns a graph with node bounds and edge routes. It does
not modify the input graph.

## Documentation

- [Quick start](./quick-start.md)
- [Graph data](./graph-data.md)
- [`getLayout`](./get-layout.md)
- [Built-in algorithms](./built-in-algorithms.md)
- [Layered layout](./layered-layout.md)
- [Custom algorithms](./custom-algorithms.md)
- [elkjs compatibility](./elkjs-compatibility.md)
- [API reference](./api-reference.md)

## Project documents

- [Architecture](./architecture.md)
- [Parity](./parity.md)
- [Roadmap](./roadmap.md)
- [Upstream and provenance](./upstream.md)
