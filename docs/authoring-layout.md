# Authoring layout

`getLayout` with the native `layered` algorithm supports full layout with
constraints, partial layout, and route-only layout. Direct `getLayeredLayout`
retains its existing full-layout contract. ELK compatibility does not opt into
these authoring operations.

## Selection and permissions

```ts
await getLayout({
  graph,
  scope: {
    mode: "partial",
    nodeIds: ["a"],
    edgeIds: ["bc"],
    routing: "affected",
    edgeGeometry: "both",
    placement: { components: "connected", proximity: "neighbors" },
  },
});
```

| Field                  | Meaning                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeIds`              | Nodes whose `x` and `y` may change. Sizes, ports, parents and data stay fixed.                                                                          |
| `edgeIds`              | Edges whose selected geometry may change. Does not select endpoints.                                                                                    |
| `edgeGeometry`         | `routes`, `labels`, or `both` (default). Also limits automatic repair.                                                                                  |
| `routing`              | `affected` (default) includes edges invalidated by moved nodes; `selected` limits changes to explicit edge IDs.                                         |
| `placement.components` | `connected` (default) lays out each connected selected subgraph; `single` treats each selected node independently. Components never span fixed parents. |
| `placement.proximity`  | `sketch` (default) favors original position; `neighbors` favors the center of adjacent fixed nodes. Only valid collision-free candidates are accepted.  |
| `previous`             | Optional geometry fallback, matched by current entity IDs. Current graph fields take precedence.                                                        |

Omitted selection arrays and empty arrays both select nothing. With no selection
and no constraints, an already visual graph is unchanged. Duplicate selected IDs
are deduplicated; unknown IDs fail with `INVALID_SELECTION`. Selecting a container fails with `UNSUPPORTED_LAYOUT`; authoring currently
supports nested leaf edits with fixed ancestors. This prevents implicitly moving
unselected descendants. Resizing ancestors and reparenting are not supported.
Full layout without geometry constraints continues to support containers. Full
compound layout with geometry constraints explicitly fails with `UNSUPPORTED_LAYOUT`;
use partial constraints on leaves when ancestors must remain fixed.

Fixed entities must have finite geometry in `graph` or `previous`; otherwise
layout fails with `MISSING_GEOMETRY`. New selected nodes can use measurement and
zero-origin seed positions. Labels use caller-supplied dimensions; an absent label
can use a zero-sized rectangle. `previous` never restores deleted entities.
Baseline completion can produce patches for previously missing fields even on
unselected entities; it does not move their baseline geometry.

The selected nodes are split into connected components within each fixed parent,
then arranged with the layered phases. `single` skips inter-node arrangement.
`neighbors` targets adjacent fixed nodes and considers placements around those
neighbors; `sketch` keeps each component near its original location. Neither
objective moves a fixed node. Placement checks surrounding rectangles and parent bounds. When no tested placement fits,
positions are preserved with `PLACEMENT_BLOCKED`. This is bounded candidate
placement, not a guarantee to discover every feasible packing. Each selected component
uses at most 2,000 candidate offsets and 100,000 collision checks, with periodic
cancellation checks.

## Routes and labels

Edge label rectangles are `x/y/width/height`; routes are `points/routing`.
Labels-only operations never write route fields. Routes-only operations never
write label fields. Patches contain only changed fields and use the graph
package's null-to-clear semantics.

The partial router uses orthogonal rectangle visibility paths and named port
positions. It avoids node interiors and other label rectangles. Common ancestor
containers are traversable. Search is bounded to 40,000 visibility-grid vertices
per attempt, using nearby obstacles to build the grid while checking routes against
all obstacles. Up to eight attempts expand the search neighborhood. Failure preserves the previous route with `ROUTE_BLOCKED`. Supplied
spline routing or custom `routeEdges` strategies fail explicitly when route repair
is requested; partial
routing currently produces orthogonal paths. It does not optimize crossings
between edges or preserve arbitrary old bends as hard constraints.

Affected-edge detection includes incident edges and routes/labels intersected by
moved nodes. Spline control bounds are used conservatively for invalidation.
`AFFECTED_EDGES_UPDATED` lists automatically changed edges. When routing is
excluded, `ROUTE_REPAIR_REQUIRED` reports the need without changing the route.
Label-only movement reports `ROUTE_PRESERVED` so callers can review attachment.
Routes-only changes that detach a previously intersecting label report
`LABEL_REPAIR_REQUIRED`. Moved labels overlapping nodes or other labels report
`LABEL_OVERLAP`; routes newly crossed by moved labels report repair needs.
Labels that participate in geometric constraints retain their solved positions.
Labels without a usable route retain their authored rectangle.

The full-layout constraint pass selects only constraint-referenced labels. It
repairs routes invalidated by moved nodes or unsatisfied waypoints; unrelated
routes and labels retain the layered pipeline output. Spline/custom routing is
allowed when the constraint pass needs no route repair.

```ts
// Legacy scope: omitted edgeIds means all edges; [] means none.
await getLayout({
  graph,
  scope: { mode: "route-only", previous: graph, edgeIds: ["ab"] },
});
```

Route-only preserves all node and label geometry. Its existing required
`previous` field remains source-compatible. Partial edge-only selection defaults
to both routes and labels; use `edgeGeometry: "routes"` for equivalent permissions.

## Coordinate frames

Native compound nodes and sibling edges use parent-relative coordinates;
cross-container edges use world coordinates, matching the existing compound
pipeline. Authoring converts to a world-coordinate working scene, then returns
geometry and patches in those original frames. Geometric constraints, including
pins and waypoints, use world coordinates. Ports stay node-relative. Container
movement and full constrained compound layout are explicitly unsupported until
subtree movement permissions are available.

## Constraints

Constraints are caller-owned serializable values. Supply them on each request;
Layout does not persist a solver session. `@lume/kiwi` solves linear geometry
constraints with weak position stays. Required constraints are hard; strong,
medium and weak preferences use the solver's weighted strengths.

```ts
const constraints = [
  c.align({
    id: "column",
    entities: [{ nodeId: "a" }, { nodeId: "b" }, { nodeId: "c" }],
    axis: "x",
    anchor: "center",
  }),
  c.distribute({
    id: "equal-gaps",
    entities: [{ nodeId: "a" }, { nodeId: "b" }, { nodeId: "c" }],
    axis: "y",
    spacing: "gaps",
    strength: "required",
  }),
];
```

Entity order in `distribute` is explicit. `spacing: "gaps"` (default) equalizes
edge-to-edge distances; `centers` equalizes center distances. Optional `gap`
sets that distance. Distribution also requests nonnegative spacing.
`align` defaults to `anchor: "center"`; `start` and `end` are also supported.
`pin` fixes supplied `x` and/or `y`. Referencing an entity does not grant movement
permission: fixed references enter the solver as constants.

```ts
c.linear({
  id: "keep-right",
  terms: [
    { entity: { nodeId: "b" }, attribute: "x", coefficient: 1 },
    { entity: { nodeId: "a" }, attribute: "right", coefficient: -1 },
  ],
  relation: "ge",
  value: 24,
});

c.waypoint({
  id: "route-through",
  edgeId: "ab",
  point: { x: 320, y: 180 },
  strength: "required",
});
```

Linear attributes are `x`, `y`, `centerX`, `centerY`, `right`, and `bottom`.
Sizes are constants, not solver variables. Relations are `eq`, `le`, and `ge`.
Use `{ edgeId, part: "label" }` wherever a geometry reference is accepted.
Waypoints are world-coordinate points the route must pass through, not spline
control points. Required waypoints follow input order. Soft waypoints are tried
by strength while preserving accepted constraints' input order, and reported
when infeasible. This is a routing heuristic, not Cassowary optimization.

Duplicate constraint IDs, unknown references, and non-finite expressions fail
with `INVALID_CONSTRAINT`. Infeasible required constraints throw
`UNSATISFIED_CONSTRAINT` with the constraint ID. Soft violations produce
`CONSTRAINT_VIOLATION` with `constraintIds`. Constraints never silently widen
selection. Collision and containment are checked after solving and reported;
linear constraints do not imply automatic non-overlap or parent resizing.

The existing `options.constraints.layer` remains available for layered rank
assignment. Top-level `constraints` is the separate common geometry contract.
Algorithms must advertise `capabilities.constraints` to accept it; unsupported
algorithms fail rather than ignoring constraints. Incremental layout remains
unsupported.
