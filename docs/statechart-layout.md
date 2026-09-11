# Statechart layout policies

<!-- public statechart exports from src/elkjs/statechart.ts -->

`compileStatechartLayout`, `layoutStatechart`, and `scoreStatechartLayout` are
opt-in exports from `@statelyai/layout/elkjs`. Existing `ELK.layout()` behavior
is unchanged. They operate on measured ELK graphs, including ports and nested
containers; they do not accept XState machine configs or Viz XGraphs directly.
Consumers must map initial-state metadata into container scopes.

```ts
import { layoutStatechart } from "@statelyai/layout/elkjs";

const result = await layoutStatechart(measuredGraph, {
  scopes: {
    root: { initialNodeId: "waiting", direction: "RIGHT" },
    intro: {
      initialNodeId: "smallAmount",
      preferredPath: ["smallAmount", "observe", "monitorBurp", "waitNextFeeding"],
      direction: "DOWN",
    },
    monitoring: { initialNodeId: "normal", direction: "DOWN" },
  },
  maxAttempts: 3,
});
// result.graph: selected geometry
// result.attempt: zero-based selected candidate
// result.attempts: every candidate's kind and score
// result.paths, result.commonExits: inferred/explicit semantic hints
```

## Compilation and scope

An initial state anchors a path. Parallel edges count as one successor;
self-loops and already-visited states do not extend the path. Inference stops
at an ambiguous branch. An explicit connected path resolves ambiguity; repeated,
missing, disconnected or mismatched initial nodes are errors. Nodes need unique
IDs. A scope identifies a container, and its path contains direct children.
Edges between descendants are projected onto their direct-child owners for
analysis, including port endpoints. This supports graph-level paths between
compounds without flattening their internals.

A common exit is a terminal child reached from at least two distinct sibling
owners. Path inference excludes these sinks, and model order places them after
the main path and other children. This is a routing preference, not a dedicated
outside lane or a semantic inference based on names such as `allergyCheck`.

Input must be structured-cloneable. The compiler clones input and reorders only scoped child arrays. It emits
parent-scoped `elk.layered.cycleBreaking.strategy=MODEL_ORDER` and
`elk.layered.feedbackEdges=true` for paths with two or more nodes. Existing
cycle-breaking and feedback settings win, including supported option aliases.
Explicit scope directions override existing direction aliases and apply to
baseline too. Path hints do not override layer constraints or guarantee a
particular geometry; inspect the returned scores.

## Bounded reruns

`maxAttempts` is an integer from 1 to 3, default 3. Candidates are:

1. Original layout, with explicit directions.
2. Compiled policy layout.
3. Compiled policy with scoped node/layer spacing increased by 50%, at least
   40/60 units, and the second/third labeled parallel edges placed at HEAD/TAIL
   when they have no authored placement. The first stays at the engine default.

Every candidate starts from a fresh clone of original input or the pristine
compiled plan. No previous output coordinates seed subsequent attempts. There
are no geometry repairs after the engine. Engine errors propagate; this API
is not an invalid-input recovery service. With one attempt, only baseline runs.

Selection minimizes `(invalid, overlaps, pathOrder, crossings, bends,
routeLength)` lexicographically. Earlier candidates win ties. Invalid geometry
and overlaps take precedence over reading order; reading order takes precedence
over crossings. A longer route may therefore win. All attempts and unresolved
penalties are returned, including when none is clean.

The scorer checks finite node rectangles and route points, nonnegative node
sizes, child containment, missing routes, overlapping node/edge-label boxes,
preferred-path coordinate order, proper segment intersections, bends and
Euclidean polyline length. Ancestor/descendant node intersections are excluded.
It is a diagnostic objective, **not a validity certificate**: node/port label
boxes, collinear shared routes, endpoint attachment, edge/node collisions and
spline curve intersections are not checked. Use measured orthogonal graphs
for comparable route scores. Ports and labels retain their engine geometry.
Scoring is quadratic in rectangle and route-segment counts; bounded attempts
do not imply a wall-clock deadline.

## Actual adapter support

This package implements layout natively. `knownLayoutOptions()` lists the ELK
inventory; it is not a guarantee that every option changes every graph.

| Control                                                                 | Inspected implementation / boundary                                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Model-order cycle breaking                                              | `src/layered/strategies.ts`: `breakCyclesByModelOrder`; selected in `src/layered/index.ts`                                           |
| Scoped direction                                                        | Recursive compound handling and `getDirection` in `src/elkjs/index.ts`                                                               |
| Feedback routes                                                         | Native layered feedback routing; no route side guarantee                                                                             |
| Node/layer spacing                                                      | Mapped into `getLayeredLayout` by the adapter                                                                                        |
| Edge-label HEAD/CENTER/TAIL                                             | Native edge label placement, exported by the adapter                                                                                 |
| Interactive layer/position IDs and in-layer predecessor/successor hints | Accepted but explicitly discarded by adapter; compiler does not emit them                                                            |
| Edge-to-edge spacing                                                    | Some routing branches exclude INCLUDE_CHILDREN; increasing it did not alter this compound fixture, so the repair does not rely on it |

An unspecified compound direction defaults to RIGHT in this adapter; provide
explicit directions in every relevant scope. Mixed compound directions are
supported but do not optimize boundary crossings
jointly with the parent. Do not remove consumer geometry repairs based on this
wrapper alone. Viz/Flow adoption and physical editor rendering need separate
consumer verification. Published layout 0.0.5 does not contain these new exports.

## Reproducible regression

`test/fixtures/babyfood-statechart.json` is a measured ELK projection of the
supplied babyfood graph: original transition IDs, endpoints and label dimensions;
internal edges owned by their compound; root cross-hierarchy edges; explicit
DOWN compound directions; 40-unit header padding. The root's missing size is
seeded at 300×80 and recomputed by the engine. It omits editor-only initial
markers and descriptions. The visual renderer abbreviates timer event names to
match their measured display labels. It does not modify geometry.

```sh
pnpm exec vitest run test/statechart-layout.test.ts
pnpm exec tsx scripts/render-statechart-policy.ts /tmp/statechart-policy.html
```

The regression requires `smallAmount → observe → monitorBurp → waitNextFeeding`,
with OFFER_MORE retained as the return transition, and **normal above
allergyWatch**, correcting the supplied reference. It verifies the shared
allergyCheck exit, input immutability, edge semantics and bounded attempts.
The comparison renders baseline and selected library geometry. Remaining
crossings/overlaps are visible in its per-attempt score table; it is not a Viz
end-to-end screenshot or a claim of matching the hand-arranged reference.
