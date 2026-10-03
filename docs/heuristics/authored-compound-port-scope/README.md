# Compound endpoint scope

<!-- compound endpoint gate from scripts/check-ancestor-port-parity.ts and test/oracle-authored-compound-port.test.ts -->

Native ancestor edges previously became parent-scope self-loops. Authored compound ports lost their dimensions and incident-edge flow; anonymous compound endpoints lacked inactive boundary helpers. Parent normalization also shifted child-scope edge coordinates stored on the root.

The adapter now reuses actual compound ports, creates implicit ports from original endpoint roles, preserves inactive external ports, transfers their physical geometry, and keeps child routes in their layout container. Authored options and public endpoint identities survive export. Production remains native TypeScript; elkjs 0.11.1 is the development oracle.

The frozen 320-case endpoint matrix improves **0 → 224 exact matches**, **4,327 → 1,176 differing values**, with no engine exceptions. It covers all four directions, FREE/FIXED_SIDE/FIXED_ORDER/FIXED_POS, root/compound JSON storage, ancestor input/output roles, four authored port sides and anonymous node endpoints. All 64 anonymous cases match. The 96 perpendicular authored-port failures remain strict failing tests.

```sh
pnpm exec tsx scripts/check-ancestor-port-parity.ts .scratch/ancestor-endpoints.json
pnpm exec vitest run --dir test test/oracle-authored-compound-port.test.ts
```

Both commands exit nonzero while failures remain. Full geometry includes bounds, nodes, ports, labels, route endpoints and bends at 5e-13 tolerance. Matching engine exceptions never count as parity.

[Equal-scale before/native/real-ELK comparison](minimal-comparison/index.html) includes four matches and two failures. Original route coordinates remain unmodified.

- `endpoint-before.json` / `endpoint-report.json`: every original input, reference result and difference.
- `constraints-before.json` / `constraints-after.json`: 256 authored-port cases.
- `node-before.json` / `node-after.json`: 64 implicit endpoint cases.
- `perpendicular-worker.json`: real worker phase trace showing the missing perpendicular-helper size/route transformation.
- `node-worker-phases.json` / `node-fixed-side-worker.json`: real inactive-helper and implicit-side evidence.
- `anchor-diagnostics.json`: 48 custom-anchor, border-offset and inferred-side cases, only ten matches; these remain gaps.
- `options-report.json` / `options-delta.json`: frozen fresh 80-graph corpus. Exact matches remain 4/80; native exceptions fall 2 → 0, but differing values increase 8,769 → 9,421. Eighteen comparable cases improve and eighteen worsen; no exact match is lost. Four oracle exceptions remain failures.

All 1,100 smaller retained random outputs are byte-for-byte unchanged against the previous report. The remaining 100 deeper-graph replay is still running. Parity remains incomplete; custom anchors, inferred sides, perpendicular helper phases, more general hierarchy storage and complex random layouts remain work.

The perpendicular trace isolates three ELK phases still missing from the native hierarchy pipeline. `HierarchicalPortConstraintProcessor` substitutes flow-axis helpers; `HierarchicalPortDummySizeProcessor` assigns NORTH/SOUTH helper widths by their within-layer order (twice edge spacing per lane); `HierarchicalPortOrthogonalEdgeRouter` restores physical dummy sizes, coordinates and routes. For the retained RIGHT/NORTH case, the worker temporarily uses width zero, then restores a four-pixel helper at x=-2; native retains four pixels during placement. Implement these phases together, including multiple ports per layer and direction normalization, rather than merely removing four pixels from the result.

The original full-suite run reports 3,172 passed / 210 failed / 3,382 total. File-qualified comparison finds one new pre-existing-test failure, caused by that test interpreting child-container routes as root coordinates. The scoped rerun preserves its face and orthogonality assertions, adds an explicit parent-container assertion, and passes. The 320 new oracle tests retain all 96 perpendicular failures. Real ELK throws on the larger Viz-derived route fixture; `ancestor-route-scope.json` preserves that error instead of counting it as parity. The successful oracle matrix separately verifies child-container ownership.
