---
title: "getLayout"
description: "Run a registered or inline layout algorithm"
---

`getLayout` runs a layout algorithm and returns its graph together with
patches, diagnostics, and timing data.

## Signature

```ts
function getLayout<N, E, G, P, O = unknown>(
  request: LayoutRequest<N, E, G, P, O>,
): Promise<LayoutResult<N, E, G, P>>;
```

## Request

```ts
interface LayoutRequest<N, E, G, P, O> {
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>;
  algorithm?: string | LayoutAlgorithm<O>;
  options?: O;
  scope?: LayoutScope;
  signal?: AbortSignal;
}
```

| Property    | Description                                                |
| ----------- | ---------------------------------------------------------- |
| `graph`     | Graph to lay out.                                          |
| `algorithm` | Registered ID or inline algorithm. Defaults to `layered`.  |
| `options`   | Options passed to the selected algorithm.                  |
| `scope`     | Requested execution scope. Defaults to `{ mode: 'full' }`. |
| `signal`    | Optional cancellation signal.                              |

## Result

```ts
interface LayoutResult<N, E, G, P> {
  graph: VisualGraph<N, E, G, P>;
  patches: readonly GraphPatch<N, E>[];
  diagnostics: readonly LayoutDiagnostic[];
  metrics: LayoutMetrics;
}
```

### `graph`

The completed visual graph returned by the algorithm.

### `patches`

Graph patches for node and edge geometry changed by the layout. The array may
contain `updateNode` and `updateEdge` operations. It does not contain changes
to application data.

### `diagnostics`

Messages emitted through the algorithm's execution context.

```ts
interface LayoutDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  entityIds?: readonly string[];
  phase?: string;
}
```

The current built-in algorithms do not add diagnostics.

### `metrics`

```ts
interface LayoutMetrics {
  durationMs: number;
  nodeCount: number;
  edgeCount: number;
  phases: readonly LayoutPhaseMetrics[];
}
```

`durationMs` measures the complete call. `phases` contains measurements added
by `context.measurePhase`. The built-in layered algorithm reports cycle
breaking, layer assignment, crossing minimization, node placement, and edge
routing phases.

## Scope

```ts
type LayoutScope =
  | { mode: "full" }
  | { mode: "incremental"; previous: VisualGraph }
  | { mode: "partial"; previous: VisualGraph; nodeIds: readonly string[] }
  | {
      mode: "route-only";
      previous: VisualGraph;
      edgeIds?: readonly string[];
    };
```

The selected algorithm must declare support for the requested scope. All
current built-in algorithms support only `full`. Other scopes are available
for custom algorithms.

## Cancellation

Pass an `AbortSignal` in `signal`. `getLayout` checks the signal before and
after the algorithm runs. An algorithm can also call
`context.throwIfAborted()` during its work.

```ts
const controller = new AbortController();

const resultPromise = getLayout({
  graph,
  signal: controller.signal,
});

controller.abort();
await resultPromise;
```

## Errors

`getLayout` throws:

- `LayoutError` with code `UNKNOWN_ALGORITHM` when a registered ID does not
  exist.
- `LayoutError` with code `INVALID_GRAPH` when `@statelyai/graph` reports
  graph validation issues.
- `UnsupportedLayoutError` with code `UNSUPPORTED_LAYOUT` when the selected
  algorithm does not support the requested scope.
- The abort reason when cancellation is detected.
- Any error thrown by the selected algorithm.

## Example

```ts
import { getLayout } from "@statelyai/layout";

const {
  graph: visualGraph,
  patches,
  metrics,
} = await getLayout({
  graph,
  algorithm: "layered",
  options: {
    direction: "down",
    spacing: { node: 40, layer: 60 },
  },
});
```
