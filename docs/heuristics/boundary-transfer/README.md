# Compound boundary transfer experiment

Uncommitted work; **not parity and not regression-free**. Same original 100
hierarchy inputs, unchanged 5e-13 tolerance: **8/100 complete matches**, zero
engine errors, **4,683 differing values**. Previous committed baseline:
0/100, 5,176 differing values.

Native parent-port transfer matches the unmodified installed ELK worker on
1,024 seeded cases, covering every side, padding, graph offsets, positive and
negative border offsets and port/dummy dimensions. Both parent port and mutated
dummy coordinates are compared; native inputs remain unchanged. Four new
full-geometry regressions for seed 1 match in all directions.

The adapter transfers real boundary geometry, joins child/parent route segments,
bypasses compound component packing and exports route coordinate containers.
Hierarchy guards no longer disable fixed-port alignment, exact port sweeps or
orthogonal routing. Layer placement and routing retain port margins. An old
post-routing anchor shift was removed. Label-adjacent routing counts one node
clearance rather than two; all twelve compact corridor checks pass, including
four previously failing 48px-port cases.

Full frozen-source suite: **1,887 pass / 119 fail / 2,006**. Compared with the
committed baseline: **13 introduced failure names, 4 fixed**. Ten introduced
failures involve hierarchy options, two involve compound-to-descendant labels,
one involves post-compacted fixed-side route attachment. No assertions changed
or disabled. This experiment remains uncommitted pending those fixes.
Source/repository TypeScript, selected lint/format and build pass. No clean
snapshot or current browser proof is claimed.

[Complete replay](./report.json), [equal-scale comparison](./index.html),
[exact failure-name delta](./full-suite-delta.json), [source hashes](./manifest.json),
[source and validation archive](./source-and-validation.tar.gz), and
[all five intermediate replays](./intermediate-replays.tar.gz) preserve evidence.
The original corpus and preceding proof folders remain intact.

Next: implement coupled hierarchy crossing schedules and restore child route
labels/junctions, then correct post-compaction fixed-port attachment. Public
compound layout still needs the shared native foundation. The goal remains active.
