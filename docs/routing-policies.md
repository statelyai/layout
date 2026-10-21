# Routing policies

<!-- routing policies, placements, diagnostics, and presets from src/routing/types.ts and src/routing/index.ts -->

Routing policies control curve shape, endpoint tangents, labels, collision handling,
monotonicity, and stability independently. Existing strategies still own routing
and incremental updates. Calls without a policy retain their existing defaults.

## Presets

```ts
import { bezierRouting, routingPolicies } from "@statelyai/layout/routing";

const snapshot = bezierRouting.route(graph, {
  policy: routingPolicies.smooth,
});

for (const route of snapshot.routes.values()) {
  if (route.label) {
    renderLabel(route.label.bounds, route.label.tangent);
  }
}
```

Presets are immutable policy objects. Individual fields can be overridden.

| Preset     | Curve                   | Endpoint tangents | Label                               |
| ---------- | ----------------------- | ----------------- | ----------------------------------- |
| `smooth`   | Bézier                  | Automatic         | Follows the path at half its length |
| `diagram`  | Rounded orthogonal      | Border normal     | Follows the path at half its length |
| `authored` | Centripetal Catmull–Rom | Automatic         | Follows the path at half its length |

Presets avoid nodes and fixed labels and use finite crossing and overlap costs.
An edge without label dimensions remains an unlabeled edge.

## Global and per-edge policies

`RoutingSettings.policy` supplies global defaults. `edges[id].policy` overrides
individual fields for that edge. Discriminated values, such as a label mode,
replace their inherited value as a unit. Collision fields inherit separately.

```ts
const settings = {
  policy: routingPolicies.smooth,
  edges: {
    submit: {
      policy: {
        sourceTangent: { kind: "border-normal" },
        targetTangent: { kind: "vector", direction: { x: 1, y: 0 } },
        label: { kind: "gap", tangent: { kind: "border-normal" } },
      },
    },
  },
} satisfies RoutingSettings;
```

Existing port, side, waypoint, group, and Bézier constraints remain available.
An explicit policy takes precedence over the corresponding global default.
Invalid numeric settings throw before routing. Infeasible graph constraints
produce route diagnostics.

## Curves

| `curve.kind`         | Behavior                                                                            |
| -------------------- | ----------------------------------------------------------------------------------- |
| `polyline`           | Line segments through the selected routing points                                   |
| `bezier`             | Cubic Bézier geometry with configurable `curvature`                                 |
| `catmull-rom`        | Centripetal Catmull–Rom interpolation through routing points and authored waypoints |
| `rounded-orthogonal` | Rectilinear corridors with rounded corners, controlled by `radius`                  |

`curvature` is a preferred chord-length handle multiplier, defaulting to `0.5`.
Handles and corner radii can shrink to satisfy hard geometry constraints.
A safe guide returned in place of a requested curve carries fallback diagnostics.

Bézier policies also fit a compact visibility guide between authored anchors.
Discovered search vertices can change; authored waypoints remain exact. Final
curve clearance and crossing costs decide which candidate to retain.

Catmull–Rom uses centripetal parameterization, alpha `0.5`, and produces ordinary
cubic `RouteSegment` values. Authored waypoints retain their order and position.
Consecutive duplicate knots do not cause division by zero. Explicit endpoint
tangents clamp the first or last interval.

The centripetal theorem prevents cusps and self-intersections within an
unmodified segment. It does not guarantee global intersection freedom,
obstacle clearance, or clearance after endpoint clamping. The router validates
the finished geometry. Rounded curves also require final clearance checks;
a clear guide alone is insufficient.

## Tangents

`sourceTangent` and `targetTangent` are independent.

| `kind`          | Behavior                                                              |
| --------------- | --------------------------------------------------------------------- |
| `automatic`     | Chooses a tangent consistent with the attachment and port constraints |
| `border-normal` | Leaves or enters perpendicular to the selected rectangle face         |
| `vector`        | Uses the supplied finite, nonzero `direction`                         |

Vectors follow path travel, from source to target. A target vector points into
the target. Vector magnitude does not set handle length. Ports retain their
attachment positions. A tangent incompatible with a port, allowed side, or
orthogonal route receives a constraint diagnostic.

For fixed labels, `through` and `gap` accept their own `tangent`. A gap with
`border-normal` constrains the visible border attachments, including their
actual curve derivatives.

Gap border normals are independent at the entry and exit faces. A continuous
`through` passage and an explicit label vector retain one travel axis through
the label center.

## Labels

| `label.kind` | Behavior                                                                         |
| ------------ | -------------------------------------------------------------------------------- |
| `follow`     | Places the label on the final path without attracting or rerouting the edge      |
| `fixed`      | Keeps the authored label rectangle without requiring the edge to pass through it |
| `through`    | Routes through the authored label center with a continuous visible path          |
| `gap`        | Routes to and from the authored label with a visual gap                          |

A following label uses input width and height. Input x and y do not influence
the route or placement. `fraction` defaults to `0.5` and measures cumulative
path length. It does not mean cubic parameter `t = 0.5`. `offset` moves the
label along the normal `(-tangent.y, tangent.x)`.

`Route.label` contains derived `bounds`, `anchor`, and `tangent`. Render this
placement when present. Routing never mutates graph label coordinates. A
following label can overlap another item; its diagnostic reports that overlap
without silently changing the requested fraction or rerouting the edge.

`sourceLabel` continues to describe connected labels. Parent routes finish
before their dependent connectors. Moving a parent label invalidates its
dependent family.

## Collisions and failures

`collisions.nodes` and `collisions.labels` select `avoid` or `allow` independently.
Avoidance uses the configured clearance. Endpoint attachment regions and an
edge's intentional passage through its own label have terminal exemptions.

`crossingPenalty` is a finite cost for crossing earlier routes.
`overlapPenalty` prices parallel overlap and nearby shared corridors.
Candidates are compared using their final geometry after fitting, interpolation,
rounding, and clipping. Shared trunks and common terminal regions retain their
existing exemptions. Crossings can remain when avoiding them requires a large
detour. A soft preference is not a promise of a crossing-free drawing.

`ROUTE_CONFLICT` and `LABEL_OVERLAP` can accompany a `routed` policy result.
They describe soft conflicts rather than failure of its hard path constraints.

Hard geometry validity takes precedence over soft cost. A safe guide can be
returned as a `fallback` when the requested curve cannot fit. If no path can
satisfy the hard constraints, diagnostics explain the failure. An impossible
request is never marked `routed` merely because a guide was clear.

## Monotonicity and stability

`monotonic.axis` selects `x`, `y`, or `both`. Direction follows endpoint
displacement. `strength: "prefer"` prices backward travel. `"require"`
requires the finished geometry to obey the selected directions. Cubic checks
include interior derivatives, because ordered knots alone do not prove
monotonicity. Infeasible terminal or waypoint constraints produce diagnostics.

`stability.kind: "recompute"` retains canonical routing behavior. Fresh routing
and incremental updates converge for the same graph and settings.
`"preserve-valid"` favors an existing route while it still satisfies the hard
constraints. That mode deliberately depends on edit history. The same edit
history remains deterministic, and unrelated routes retain identity.

## Shared routes and layered placement

`fanRouting`, `busRouting`, and `bundleRouting` own shared trunks. Per-edge
`group` assigns branches to a group. Equal section `sharedId` values denote
identical geometry, which renderers draw once. Policies do not introduce a
second grouping mechanism. Affected shared groups rebuild together, including
when `preserve-valid` is enabled, so one branch cannot retain a stale trunk.
Automatic duplicate target branches receive distinct attachments on their
selected face. Named ports and explicit attachment positions remain exact.

Layered layout accepts these settings through its existing replacement router.

```ts
const result = getLayeredLayout(graph, {
  routing: {
    strategy: bezierRouting,
    settings: { policy: routingPolicies.smooth },
  },
});
```

## Prior art

The policy split follows established diagramming and interpolation techniques.
It does not claim yEd parity or a globally optimal routing result.

- [React Flow Bézier paths](https://reactflow.dev/api-reference/utils/get-bezier-path) separate path generation and label anchors.
- [yFiles routing](https://docs.yworks.com/yfiles-html/dguide/polyline_router/) separates routing styles, distances, costs, label placement, and incremental scope.
- [yFiles curve connections](https://docs.yworks.com/yfiles-html/api/CurveConnectionStyle/) distinguish preserved orthogonal connections and organic connections.
- [Yuksel, Schaefer, and Keyser](https://cemyuksel.com/research/catmullrom_param/catmullrom.pdf) establish the centripetal Catmull–Rom segment properties.
- [libavoid parameters](https://www.adaptagrams.org/documentation/namespaceAvoid.html) distinguish obstacle spacing, crossing costs, overlap costs, and direction preferences.
