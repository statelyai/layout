# @statelyai/layout

Native TypeScript graph layout algorithms built directly on
[`@statelyai/graph`](https://github.com/statelyai/graph).

This is not a new graph interchange format. Public APIs consume `Graph` and
return `VisualGraph`; positions remain node fields and routes remain
`GraphEdge.points`.

## Status

The native layered implementation covers the complete 152-option elkjs 0.11.1
layered inventory with one simplified typed name per ELK option. Flat and
compound graphs, cross-hierarchy edges, ports, labels, self-loops, wrapping,
four directions, constraints, and replaceable phases are differential-tested
against elkjs. Partial, incremental, and route-only layout remain explicit
unimplemented capabilities.

## Install

<!-- install command derived from package.json#name -->

```bash
pnpm add @statelyai/layout @statelyai/graph
```

## Quick start

<!-- primary layout functions exported from src/index.ts -->

```ts
import { createGraph } from "@statelyai/graph";
import { getLayeredLayout, getLayout } from "@statelyai/layout";

const graph = createGraph({
  nodes: [{ id: "a" }, { id: "b" }],
  edges: [{ id: "ab", sourceId: "a", targetId: "b" }],
});

const visualGraph = getLayeredLayout(graph, { direction: "right" });

const result = await getLayout({
  graph,
  algorithm: "layered",
  options: { direction: "right" },
});

result.graph;
result.patches;
result.diagnostics;
result.metrics;
```

## elkjs compatibility

<!-- elkjs-compatible entry point and layered mapping exports from package.json#exports and src/layered/index.ts -->

Legacy consumers can migrate through an isolated compatibility entry point:

```ts
import ELK from "@statelyai/layout/elkjs";

const elk = new ELK();
const legacyResult = await elk.layout(elkJsonGraph);
```

The adapter accepts ELK JSON and option aliases, translates to
`@statelyai/graph`, runs native algorithms, and translates the result back.
Native algorithms never consume ELK JSON directly.

Advanced layered settings use shorter names such as
`layering.strategy`, `spacing.edgeNode`, and `nodePlacement.strategy`.
`toElkLayeredOptions` and `fromElkLayeredOptionId` provide the exact one-to-one
mapping when migration tooling needs ELK IDs. `elkLayeredOptionDefinitions`
exposes the complete mapping, value type, and valid graph-element targets;
`elkLayeredEnumValues` exposes every accepted enum value.

## Parity lab

<!-- ELK Live example count and source from demo/generated/elk-live-examples.json -->

The browser lab contains the same 45 categorized examples as ELK Live, sourced
from the canonical `eclipse/elk-models` catalog. Each is pre-laid out with the
elkjs oracle after zero-sized nodes and ports receive consistent visual bounds,
then shown in two renderers: a coordinate-faithful SVG geometry inspector and
the `@statelyai/sdk` project embed. The canonical ELKT source remains unchanged;
elkjs is never bundled into the browser.

The searchable example browser opens each graph in a pannable, zoomable SVG.
Its selection inspector and optional overlays expose exact node coordinates,
edge-label rectangles, route points, routing modes, and node-relative ports
without crowding the diagram. The SDK layer shows how the same serialized
`@statelyai/graph` value appears in the Viz project view.

```bash
pnpm demo:generate
pnpm demo
```

The demo opens at `https://layout.localhost` through Portless.

`pnpm demo:sync` refreshes the pinned ELK Live catalog and its converted ELK
JSON inputs. Normal generation and browser use remain offline.

The embed target defaults to `http://localhost:3000`. Override it with
`?editor=http://localhost:4864` when the Viz editor runs elsewhere.

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
[Upstream and provenance](./docs/upstream.md). [Parity](./docs/parity.md) tracks
API coverage separately from native algorithm fidelity.

## Development

<!-- scripts derived from package.json#scripts -->

```bash
pnpm install
pnpm verify
pnpm bench
pnpm demo
```

`pnpm verify` checks Oxfmt, Oxlint, source and repository TypeScript projects,
generated corpus freshness, tests, declarations/runtime builds, the demo
bundle, and the packed package surface.
