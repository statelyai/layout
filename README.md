# @statelyai/layout

Native TypeScript graph layout algorithms built directly on
[`@statelyai/graph`](https://github.com/statelyai/graph).

This is not a new graph interchange format. Public APIs consume `Graph` and
return `VisualGraph`; positions remain node fields and routes remain
`GraphEdge.points`.

## Status

The first vertical slice implements deterministic layered layout for flat
graphs, including cycles, ports, self-loops, four directions, orthogonal edge
routing, and replaceable phase strategies. Hierarchy and partial, incremental,
and route-only execution are explicit API capabilities but are not implemented
yet.

## Install

<!-- install command derived from package.json#name -->

```bash
pnpm add @statelyai/layout @statelyai/graph
```

## Quick start

<!-- primary layout functions exported from src/index.ts -->

```ts
import { createGraph } from '@statelyai/graph';
import { getLayeredLayout, getLayout } from '@statelyai/layout';

const graph = createGraph({
  nodes: [{ id: 'a' }, { id: 'b' }],
  edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
});

const visualGraph = getLayeredLayout(graph, { direction: 'right' });

const result = await getLayout({
  graph,
  algorithm: 'layered',
  options: { direction: 'right' },
});

result.graph;
result.patches;
result.diagnostics;
result.metrics;
```

## Extensibility

<!-- layered strategy fields from src/layered/types.ts -->

Layered phases are replaceable independently:

- `breakCycles`
- `assignLayers`
- `minimizeCrossings`
- `placeNodes`
- `routeEdges`

Strategies exchange typed artifacts keyed by graph entity IDs. They never
convert the public graph into an ELK-shaped API.

```ts
const result = getLayeredLayout(graph, {
  strategies: {
    routeEdges(input, orientation, placement) {
      return myRouter(input, orientation, placement);
    },
  },
});
```

See [Architecture](./docs/architecture.md), [Roadmap](./docs/roadmap.md), and
[Upstream and provenance](./docs/upstream.md).

## Development

<!-- scripts derived from package.json#scripts -->

```bash
pnpm install
pnpm verify
pnpm bench
```
