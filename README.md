# @statelyai/layout

Native TypeScript graph layout algorithms built directly on
[`@statelyai/graph`](https://github.com/statelyai/graph).

This is not a new graph interchange format. Public APIs consume `Graph` and
return `VisualGraph`; positions remain node fields. Standalone routing adds
immutable structured routes and incremental patches alongside the existing
`GraphEdge.points` layout output.

## Status

<!-- layered compatibility coverage from test/oracle*.test.ts -->

The native layered implementation reimplements ELK-derived phases and maps the
complete 152-option elkjs 0.11.1 layered inventory to simplified typed names.
Focused differential tests cover flat/compound graphs, cross-hierarchy edges,
ports, labels, self-loops, wrapping, directions, constraints, and phase overrides.
A development-only oracle compares native constraint-group resolution against
unmodified elkjs internals on 512 seeded intermediate graphs, including complete
node order and barycenters. This validates that phase independently of the
unfinished pipeline integration. Ordered barycenter traversal has 512 seeded
port-graph comparisons; cross-port layer and associate order has 256 seeded
mixed-role comparisons. External-port dummy construction matches every real
ELK factory field on 1,536 seeded boundaries; four direction regressions preserve
the selected descendant port across a compound boundary.
That coverage does not establish broad geometry or aesthetic parity: native
hierarchy placement and routing still diverge materially from real ELK. The
[side-by-side random corpus](docs/heuristics/README.md) uses the actual elkjs
runtime and one shared scorer to track that gap. Native layered layout also
supports partial selection, route-only execution, and geometric constraints.
Incremental layout remains explicitly unsupported.

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

## Native compound geometry

<!-- compound geometry options and output from src/layered/types.ts and src/layered/compound.ts -->

```ts
const result = getLayeredLayout(graph, {
  direction: "down",
  padding: { top: 24, right: 40, bottom: 24, left: 40 },
  compound: (node) => ({
    header: { width: 200, height: 60, side: "top" },
    direction: "right",
  }),
  edgeAttachment: (edge) => ({
    source: "content", // Use "outer" for an outward/reentering transition.
  }),
});
result.compoundGeometry.get("parent"); // { bounds, header, content }
result.compoundRoutes; // World-space sections, label gaps, routing diagnostics.
```

Each scope reserves children and measured labels before its ancestors are laid
out. Header measurements cannot replace finalized compound dimensions. Node
positions and compound bounds are parent-relative; edge label positions and
routes are world-relative, marked by `edgeCoordinateSpace: "world"`. Header and content rectangles are local to the
compound. For ancestor-to-descendant edges, content attachments leave inward;
outer attachments leave outward. Explicit ports retain their node-local geometry.
The native compound router emits orthogonal route sections for the original endpoints.
Use `compoundRoutes` or `getLayoutRoutes(result)` to retain label gaps and
fallback diagnostics; legacy `edge.points` flattens the sections. `getLayout`
also reports routing diagnostics in its result. Compound routing currently uses
orthogonal sections independently of the flat layout routing setting.

These options belong to the native contract; they do not change the pinned
ELK compatibility contract. The existing simplified advanced options still
map to ELK option IDs, but identical geometry is not guaranteed between contracts.

## Replace initial routes

<!-- layered post-layout routing option from src/layered/types.ts and src/layered/replace-routing.ts -->

Initial layered layout computes placement, labels, ports, and routes. An optional
replacement router then discards those routes and computes new ones on the finalized
geometry:

```ts
import { getLayeredLayout } from "@statelyai/layout";
import { bezierRouting } from "@statelyai/layout/routing";

const result = getLayeredLayout(graph, {
  routing: { strategy: bezierRouting, settings: { clearance: 8 } },
});
```

The replacement receives world-space nodes and labels, without initial paths or
route caches. It must synchronously return one route per edge. Node, port, label,
and compound geometry remain unchanged; render `getLayoutRoutes(result)` to retain
curves and disconnected sections. Async routers can be run separately after layout.
`strategies.routeEdges` remains an initial layout phase override; `routing` runs after
initial layout. Neither this separation nor API compatibility establishes ELK quality parity.

Post-layout replacement currently requires unconstrained full layout through `getLayout`. For scoped or constrained geometry, run standalone routing after applying the layout result.

## Standalone incremental routing

<!-- routing API and strategy catalog from src/routing/index.ts -->

```ts
import { getDiff } from "@statelyai/graph";
import { orthogonalRouting, toSvgPath } from "@statelyai/layout/routing";

const previous = orthogonalRouting.route(graph);
const { snapshot, patches } = orthogonalRouting.update(
  nextGraph,
  previous,
  getDiff(graph, nextGraph),
);
const route = snapshot.routes.get("ab");
const paths = route?.sections.map((section) => toSvgPath(section.path));
```

Incremental results match fresh routing for the same graph and settings. Previous
paths are cached outputs, never constraints on new routes.

Every strategy supports incremental updates with immutable snapshots and shared
indexes. Nodes, ports, and labels stay fixed. Every edge receives a route;
fallbacks expose status and diagnostics. Deterministic soft crossing/overlap costs
coordinate unrelated groups; residual conflicts stay visible and reported. Native TypeScript strategies cover
straight, Bézier, orthogonal, polyline, octilinear, curved, organic, parallel,
self-loop, fan, bus, and bundled routes. Render curves directly or flatten them
for a lines-only renderer. ELK/native layout adapters preserve existing output.

For efficient dragging, supply the edit's diff directly: `getDiff` scans the
whole graph. See [routing contracts, algorithms, and examples](docs/routing.md).

## Layout while authoring

<!-- partial scopes and geometry constraints from src/types.ts and src/constraints.ts -->

Select nodes and edges independently. Edge selection never moves endpoints:

```ts
import { c, getLayout } from "@statelyai/layout";

const result = await getLayout({
  graph,
  scope: {
    mode: "partial",
    edgeIds: ["ab", "bc"],
    edgeGeometry: "labels",
    routing: "selected",
  },
  constraints: [
    c.align({
      id: "label-centers",
      entities: [
        { edgeId: "ab", part: "label" },
        { edgeId: "bc", part: "label" },
      ],
      axis: "x",
      anchor: "center",
    }),
  ],
});
```

`nodeIds` permits position changes; `edgeIds` permits routes, label positions,
or both. `routing: "affected"` (default) also repairs edges affected by moved
nodes, within `edgeGeometry` permissions. Unselected nodes, dimensions, ports,
and topology remain fixed. Results include field-specific graph patches and
repair/conflict diagnostics. Constraints support alignment, distribution, pins,
linear equalities/inequalities, and route waypoints.

See [authoring layout](docs/authoring-layout.md) for baseline requirements,
selection semantics, routing limits, and examples. Existing ELK compatibility
behavior is unchanged.

## elkjs compatibility

<!-- elkjs-compatible entry point and layered mapping exports from package.json#exports and src/layered/index.ts -->

Legacy consumers can migrate through an isolated compatibility entry point:

```ts
import ELK from "@statelyai/layout/elkjs";

const elk = new ELK();
const legacyResult = await elk.layout(elkJsonGraph);
```

Migration-compatible package aliases are also available for
`lib/main.js`, `lib/elk-api.js`, `lib/elk.bundled.js`, `lib/elk-worker.js`,
and `lib/elk-worker.min.js`. The worker entries implement elkjs's message
protocol in-process, including custom `workerFactory` construction and
termination. Both ESM imports and the original CommonJS `require()` style are
supported. Worker calls merge constructor defaults with per-layout overrides;
terminal worker errors reject pending and later requests.

The adapter accepts ELK JSON and option aliases, translates to
`@statelyai/graph`, runs native algorithms, and translates the result back.
Native algorithms never consume ELK JSON directly. `getLayout` and the
compatibility adapter dispatch through one typed internal engine; direct native
functions expose those same algorithm implementations. ELK-specific defaults
and quirks remain local to the pinned compatibility adapter.

Compatibility policies currently preserve exact elkjs 0.11.1 Random geometry
and Box SIMPLE geometry, including provider bounds and whether edge sections
are routed or left authored. Rectangle Packing has an exact default baseline;
its full Java packing strategy remains in progress.

The compatibility entry's named graph, edge, option, and result types are
mutually assignable with the declarations shipped by `elkjs@0.11.1`. Its
default class also accepts the library's broader internal graph inputs.

<!-- fixed-port placement and inline center-label guarantees from src/layered/index.ts, src/layered/strategies.ts and src/layered/orthogonal-junctions.ts -->

Fixed port sides constrain routes without collapsing fan-out targets onto each other. Detached cross-port rows retain incoming adjacency through splitting and inversion for BK straightening. Port preferences cannot reintroduce cycles before layering. Inline center labels use reserved inter-rank space; orthogonally routed labels use distinct cross-axis lanes that avoid other labels and states. Dedicated label layers reserve clearance on both sides of routing tracks; route-track compaction retains their placement strategies. Inline self-loop labels reserve clearance on their assigned sides from both their owner and neighboring nodes. Hierarchy decomposition preserves native self-loop routes for ancestor-to-descendant edges. FIRST/FIRST_SEPARATE nodes may have self-loops. Fixed loops reserve their perimeter clearance before placement and in routing ranks. Track clearance follows physical edge direction through cycle reversal. Orthogonal junctions retain physical routing ownership through joining and compaction. Infeasible post-compaction relations retain the initial finite geometry.

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
elkjs oracle after zero-sized nodes and ports receive consistent visual bounds.
The canonical ELKT source remains unchanged; elkjs is never bundled into the
browser.

The workbench places a CodeMirror JSON5 editor beside a coordinate-faithful SVG
viewer in keyboard-accessible shadcn resizable panels. Selecting an example
loads its complete XGraph into the editor; pasted or edited XGraph redraws
automatically. Existing visual geometry is preserved; topology-only graphs run
through native layered layout. Invalid input is marked inline while the last
valid preview remains visible. Pan, zoom, selection details, and optional
overlays expose exact node coordinates, edge-label rectangles, route points,
routing modes, and node-relative ports.

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

See [API reference](./docs/api-reference.md), [Architecture](./docs/architecture.md),
[Roadmap](./docs/roadmap.md), and [Upstream and provenance](./docs/upstream.md).
[Parity](./docs/parity.md) tracks
API coverage separately from native algorithm fidelity.

## Development

<!-- heuristic corpus generation from scripts/generate-heuristic-corpus.mjs -->

For seeded native Stately layout examples and aesthetic review notes, see the
[heuristic review corpus](docs/heuristics/README.md).

<!-- scripts derived from package.json#scripts -->

```bash
pnpm install
pnpm verify
pnpm bench
pnpm demo
pnpm storybook
pnpm changeset
pnpm release
```

`pnpm verify` checks Oxfmt, Oxlint, source and repository TypeScript projects,
generated layered-option and demo-corpus freshness, tests,
declarations/runtime builds, demo and Storybook bundles, and the packed package surface.

<!-- authoring stories derived from stories/*.stories.tsx and package.json#scripts -->

`pnpm storybook` opens the authoring workbench at `http://127.0.0.1:6018`.
The **Layout / Partial selection** story starts with a fully laid-out graph.
Click nodes (or select the review branch), choose a direction, and press
**Auto-layout selection**. Unselected nodes remain fixed; dashed outlines show
previous positions. Reset restores the original full layout.

Eight additional stories cover edge-only routing, independently editable constraint groups,
selected-node placement, affected-route repair, constraint conflicts, overlap
diagnostics, nested coordinates, and unsupported incremental layout. Controls
rerun the real API; each story shows matched before/after geometry, patches, and
current limitations. `pnpm storybook:build` writes a static build to `dist-storybook`.

<!-- exported source compatibility derived from tsconfig.json -->

The source project checks indexed reads with `noUncheckedIndexedAccess` so
published TypeScript source supports consumers using that option.

## Releases

<!-- release process derived from package.json#scripts and .changeset/config.json -->

Add a release note with `pnpm changeset`. When it reaches `main`, the release
workflow opens or updates a version pull request. Merging that pull request
publishes the package to npm and creates the GitHub release and tag.

Publishing uses npm Trusted Publishing through `.github/workflows/release.yml`.

## Statechart reading order

<!-- statechart policy API from src/elkjs/statechart.ts -->

The opt-in `layoutStatechart` export from `@statelyai/layout/elkjs` compiles
initial-state and preferred-path hints into scoped settings, then selects among
at most three fresh layout attempts. It returns all quality scores, including
remaining defects. Path scoring honors inherited compound directions and
explicit scope overrides. See [statechart policies](docs/statechart-layout.md) for the
API, supported controls, tradeoffs and reproducible visual comparison.

For the strict seeded hierarchy comparison with real ELK, run
`pnpm test:parity:compound`. See the
[compound baseline](./docs/heuristics/compound-baseline/README.md) for preserved
failures and side-by-side diagrams. This finite gate passes; broad native parity
remains work in progress.

For bounded random fixed-port self-loops, run `pnpm test:parity:self-loops`.
This smaller gate compares complete node/port geometry, routes and junctions
with real ELK; passing it does not establish broad hierarchy parity.

For bounded random flat graphs with cycles, self-loops, fixed-side/fixed-position
ports and labels, run `pnpm test:parity:flat`. This strict geometry gate preserves
all mismatches and engine errors; it currently fails. See the
[flat random proof](./docs/heuristics/bk-compaction-thresholds/README.md).

For directional compaction on the same bounded random flat/hierarchical families,
run `pnpm exec tsx scripts/check-directional-compaction-parity.ts`. This additional
200-case gate preserves all failures, including real ELK errors; it currently
fails. See the [directional compaction proof](./docs/heuristics/directional-compaction/README.md).

For model-order settings on bounded random flat/hierarchical graphs, run
`pnpm test:parity:model-order`. This strict 200-case gate alternates forced node
ordering, preserves complete failures and reference exceptions, and currently
fails. See the [greedy traversal proof](docs/heuristics/greedy-starting-layer/README.md).

<!-- implementation from src/layered/loop-envelopes.ts, src/layered/strategies.ts, src/layered/index.ts and src/elkjs/index.ts -->

Movable self-loop labels reserve clearance before placement and retain directional alignment and stacked routing clearance. Compaction retains their complete label envelopes. See the [native loop label comparison](docs/heuristics/movable-loop-labels/README.md).
