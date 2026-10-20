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

## Clearance quality refinement

The original safety and consistency checks accepted a visibly awkward obstacle
route. An orthogonal search guide contained a five-pixel jog and a short terminal
lead beside long spans. Interpolating every synthetic point produced a large
bulge and a target hook. Hard validity did not measure these artifacts.

Two independent sketches considered reusing the existing visibility search or
enumerating new obstacle-corner support points. A separate judge selected the
existing search. It generates a compact guide between mandatory authored anchors
without adding public controls or another route generator. The original guide
remains available, and finished curves still own clearance and crossing scores.
Global curvature reduction and local handle caps were rejected as primary fixes
because runtime probes retained the main detour.

The [clearance comparison](clearance/README.md) uses identical graph and policy
settings before and after this refinement. Geometry regressions measure compactness,
reverse travel, actual clearance, following labels, authored knots, tangents, and
incremental updates. They do not establish optimal routing for every graph.
