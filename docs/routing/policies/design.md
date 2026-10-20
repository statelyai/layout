# Routing policy design

Consumers select geometry and constraints through the existing `route` and
`update` calls. They do not coordinate a search engine, curve fitter, label
placer, or collision pass.

```ts
bezierRouting.route(graph, {
  policy: routingPolicies.smooth,
  edges: {
    submit: {
      policy: {
        label: { kind: "follow", fraction: 0.5 },
        sourceTangent: { kind: "border-normal" },
      },
    },
  },
});
```

## Alternatives and selection

Two independent candidates explored a unified policy object and separate
composable settings fields. The independent cross-judge selected the unified
policy. Its discriminated label and tangent variants prevent meaningless
combinations, while field inheritance keeps edge overrides concise.

The synthesis retained the existing bundle strategy as the sole owner of
sharing. A new sharing flag would duplicate `group` and strategy selection.
Safe guides remain available as diagnostic fallbacks. Hard constraints still
apply to those guides. No-policy behavior retains compatibility.

## Ownership

The existing engine owns snapshots, stable edge order, group membership,
reservations, and dependency reads. Policies normalize at the configuration
boundary. The path representation remains `RoutePath`, with cubic segments
for Bézier and Catmull–Rom geometry.

Final geometry determines hard validity and soft cost. A clear polyline does
not establish that a fitted curve is clear. Likewise, a guide's crossing score
does not describe a curve that leaves that guide.

Following labels are derived output. Their old input coordinates cannot attract
the curve or create routing obstacles. Fixed labels remain input geometry.
Canonical updates converge with fresh routing. Route preservation is explicit
and deliberately depends on edit history.

## Evidence boundary

Geometric invariants, package compatibility, browser behavior, and visual
quality are separate checks. The gallery provides matching review images.
The seeded corpus checks public-API geometry and updates. Neither establishes
commercial-tool parity or a global optimum. The broader product direction is
a complete layout and routing library competitive with yEd.
