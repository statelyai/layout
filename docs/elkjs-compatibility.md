---
title: "elkjs compatibility"
description: "Use the elkjs-compatible package entry point"
---

The `@statelyai/layout/elkjs` entry point provides an elkjs-compatible class.
Use it for code that already supplies ELK JSON. Native APIs use
`@statelyai/graph` instead.

## Import

```ts
import ELK from "@statelyai/layout/elkjs";
```

## Create an instance

```ts
const elk = new ELK({
  defaultLayoutOptions: {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
  },
});
```

The constructor accepts:

```ts
interface ElkConstructorArguments {
  defaultLayoutOptions?: Record<string, unknown>;
  algorithms?: string[];
  workerUrl?: string;
  workerFactory?: (url?: string) => unknown;
}
```

`workerUrl` and `workerFactory` are accepted for API compatibility. The
current implementation runs in the calling process.

## Run layout

```ts
const graph = {
  id: "root",
  children: [
    { id: "a", width: 100, height: 50 },
    { id: "b", width: 100, height: 50 },
  ],
  edges: [{ id: "a-to-b", sources: ["a"], targets: ["b"] }],
};

const result = await elk.layout(graph, {
  layoutOptions: {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
  },
});
```

`layout` returns the supplied ELK graph with layout fields applied. The method
is asynchronous to match the elkjs API.

## Supported algorithms

| ELK algorithm ID  | Native implementation |
| ----------------- | --------------------- |
| `layered`         | Layered layout        |
| `box`             | Box layout            |
| `fixed`           | Fixed layout          |
| `random`          | Random layout         |
| `rectpacking`     | Rectangle packing     |
| `sporeCompaction` | SPOrE compaction      |
| `sporeOverlap`    | SPOrE overlap removal |

The adapter accepts short IDs, `elk.`-prefixed IDs, and
`org.eclipse.elk.`-prefixed IDs.

## Option precedence

Options are merged in this order, with later values taking precedence:

1. Constructor `defaultLayoutOptions`.
2. `layout` call `layoutOptions`.
3. Root graph `properties`.
4. Root graph `layoutOptions`.

The adapter recognizes short option names and their `elk.` and
`org.eclipse.elk.` forms. Supported options include direction, padding,
aspect ratio, random seed, node spacing, layered layer spacing, fixed
positions, fixed bend points, and selected box options.

## Metadata methods

The class provides:

```ts
elk.knownLayoutAlgorithms();
elk.knownLayoutOptions();
elk.knownLayoutCategories();
elk.terminateWorker();
```

The first three methods return promises. `terminateWorker` has no effect
because this implementation does not create a worker.

## Logging

Set `logging` or `measureExecutionTime` in the layout arguments to add a
`logging` object to the root graph.

```ts
await elk.layout(graph, {
  logging: true,
  measureExecutionTime: true,
});
```

## Compatibility limits

The adapter implements a defined subset of elkjs 0.11.1 behavior. It is not a
wrapper around the elkjs runtime. Unsupported algorithm IDs throw an error.

See [Parity](./parity.md) for the tested compatibility surface and current
limitations.
