# BK compaction thresholds

Parity remains incomplete. Native straightening ran as a separate directional
shift pass. ELK applies thresholds while compacting blocks, records finished
blocks and used connections, then retries unresolved edges within available
space. Native now follows that state and traversal, including partial shifts in
either direction. Production remains native.

Hierarchy improves **50 to 60/100 complete matches**, zero errors or lost
matches. Differing values fall **1,607 to 1,503** on unchanged inputs and 5e-13
tolerance. Seed 4's extra boundary bends disappear in all four directions.
Ten new complete geometry oracle regressions fail against archived a880320
and pass on current source. Existing assertions remain unchanged.

A new versioned flat generator produces 100 deterministic cases (25 seeds, four
directions): 4–16 nodes, at most four ports per node and one per side, bounded
sizes/edges, DAGs, cycles, self-loops, fixed-side/fixed-position ports and labels.
Complete flat matches improve **10 to 12/100**, zero errors or lost matches;
differing values fall **15,081 to 14,813**. All original inputs and failures are
retained. The generator's endpoint/bounds/repeatability test passes. This corpus
adds coverage; it does not establish broad parity.

Final full local suite: **2,111 pass / 108 fail / 2,219**, no new failure names
against a880320. The initial run had two additional timeouts; both cases pass
unchanged in isolation, and the complete final run clears them. Both raw runs
and the rerun are retained. Source/repository types, selected format/lint and
build pass. Existing ancestor label and broader parity failures remain red.

[Hierarchy before/after/ELK](./index.html), [hierarchy replay](./report.json),
[BK worker candidates](./worker-phases.json), [flat comparison](./flat/index.html),
[flat replay](./flat/report.json), [flat before](./flat/before.json), [flat visual proof](./flat/seed-5-down.png),
[suite delta](./validation.json), [source hashes](./manifest.json),
[red regressions](./before-regressions.json), [green regressions](./after-regressions.json),
[RIGHT proof](./seed-4-right.png), [DOWN proof](./seed-4-down.png).
Hierarchy before is the published bk-boundary-spacing report; flat before uses
archived a880320 with the same generator. Gallery inputs/viewBox/scale match.
RIGHT/DOWN seed 4 were browser-inspected; worker observations match unmodified
real ELK geometry. DOWN flat seed 5 was also browser-inspected at equal scale.
All broader failures remain preserved; PR #32 stays draft.

Replay: `pnpm test:parity:compound` and `pnpm test:parity:flat` (both failing).
Next: remaining hierarchy crossing/placement phases and flat ports/cycles/labels.
Goal active; no weakened assertions or oracle substitution.
