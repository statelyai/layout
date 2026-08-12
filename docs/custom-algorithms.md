---
title: "Custom algorithms"
description: "Implement, register, and run a layout algorithm"
---

A custom algorithm implements `LayoutAlgorithm<Options>`.

## Interface

```ts
interface LayoutAlgorithm<Options = unknown> {
  readonly id: string;
  readonly capabilities: LayoutCapabilities;
  layout<N, E, G, P>(
    graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
    options: Options,
    context: LayoutExecutionContext,
  ): VisualGraph<N, E, G, P> | Promise<VisualGraph<N, E, G, P>>;
}
```

The algorithm must return a `VisualGraph`. It may execute synchronously or
asynchronously.

## Capabilities

```ts
interface LayoutCapabilities {
  full: boolean;
  incremental: boolean;
  partial: boolean;
  routeOnly: boolean;
  hierarchy: boolean;
  ports: boolean;
}
```

`getLayout` checks the requested scope against the first four fields before it
runs the algorithm. `hierarchy` and `ports` describe graph features supported
by the implementation.

## Inline algorithm

Pass an algorithm object directly when it does not need global registration.

```ts
import { getFixedLayout, getLayout, type LayoutAlgorithm } from "@statelyai/layout";

interface OffsetOptions {
  x: number;
  y: number;
}

const offsetAlgorithm: LayoutAlgorithm<OffsetOptions> = {
  id: "offset",
  capabilities: {
    full: true,
    incremental: false,
    partial: false,
    routeOnly: false,
    hierarchy: true,
    ports: true,
  },
  layout(graph, options, context) {
    context.throwIfAborted();
    const visualGraph = context.measurePhase("place-nodes", () => {
      const fixedGraph = getFixedLayout(graph);

      return {
        ...fixedGraph,
        nodes: fixedGraph.nodes.map((node) => ({
          ...node,
          x: node.x + options.x,
          y: node.y + options.y,
        })),
      };
    });

    context.diagnostics.push({
      severity: "info",
      code: "OFFSET_APPLIED",
      message: `Offset ${visualGraph.nodes.length} nodes`,
      phase: "place-nodes",
    });

    return visualGraph;
  },
};

const result = await getLayout({
  graph,
  algorithm: offsetAlgorithm,
  options: { x: 20, y: 20 },
});
```

## Execution context

```ts
interface LayoutExecutionContext {
  readonly scope: LayoutScope;
  readonly signal?: AbortSignal;
  readonly diagnostics: LayoutDiagnostic[];
  measurePhase<T>(id: string, run: () => T): T;
  throwIfAborted(): void;
}
```

- Read `scope` to determine the requested work.
- Call `throwIfAborted` at interruption points.
- Use `measurePhase` to add phase timings to the result.
- Add structured messages to `diagnostics`.

## Register an algorithm

```ts
function registerLayoutAlgorithm<O>(algorithm: LayoutAlgorithm<O>): () => void;
```

Registration adds or replaces an algorithm by ID. The function returns a
cleanup function. Cleanup restores the previous algorithm for that ID or
removes the new registration.

```ts
const unregister = registerLayoutAlgorithm(offsetAlgorithm);

const result = await getLayout({
  graph,
  algorithm: "offset",
  options: { x: 20, y: 20 },
});

unregister();
```

Registration affects subsequent `getLayout` calls in the current JavaScript
process.

## Look up an algorithm

```ts
function getLayoutAlgorithm(id: string): LayoutAlgorithm<unknown> | undefined;
```

The function returns the currently registered algorithm or `undefined`.
