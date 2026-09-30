---
"@statelyai/layout": minor
---

Add native TypeScript edge routing with immutable snapshots, incremental native graph diffs, persistent spatial/dependency indexes, route patches, and explicit fallback diagnostics. Include straight, Bézier, orthogonal, polyline, octilinear, curved, organic, parallel, self-loop, fan, bus, and bundle strategies; structured line/curve/arc geometry; SVG and polyline rendering utilities; and adapters for native layout and ELK section geometry.

Incremental routing produces the same geometry as fresh routing for the same graph and settings. Previous snapshots cache graph geometry, spatial dependencies, and unaffected results; previous drawn paths do not constrain routing.

Account for endpoint directions in route search, complete octilinear diagonal/grid intersections, distribute shared-node attachments and duplicate-edge corridors, and prefer interior source-facing shared trunks. Incremental invalidation includes coordinated neighbors.
