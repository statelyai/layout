# Orthogonal edge lists

Many remaining near misses differed only in which edge owned a junction point. ELK's orthogonal router builds each hyperedge segment by walking from a port through its incoming, then outgoing, edges in list order. It then emits bend points per segment, per port and per outgoing edge in list order. The first edge to reach a point owns its junction.

Flat seed 2 DOWN: `e0` and `e12` leave one merged hyperedge dummy. `HyperedgeDummyMerger` appends the lower dummy's edges after the kept dummy's, so ELK reaches `e0` first. Native sorted reversed edges last and gave the junction to `e12`.

Orthogonal routing now follows ELK's lists in three places:

- An edge leaving a real node keeps its position in the simulated port edge list, which records reversal history.
- An edge leaving a merged hyperedge dummy keeps its merged port order.
- Hyperedge segment discovery follows each port's incoming and outgoing edge lists rather than cross-axis position; this alone gains two cases.

Complete 1,280-case replay: **724 → 746 exact**, **82,705 → 82,400 differing values**, zero native errors, 217 retained oracle errors. **22 gained, zero lost.** 81 outputs reduce differences; 8 increase them ([audit](audit.json)). Only junction values change (8,939 → 8,634); routes, nodes, ports and labels are identical. Replay elapsed, eight parallel processes: 447 s.

The regression covers flat seeds 2 DOWN, 2 UP and 17 RIGHT; all fail before and pass after. Full suite: **3,301 passed, 109 retained failures, 3,410 total**; zero new failures ([delta](full-test-delta.json)). Types, repository types, changed-file lint and format, build and the demo corpus pass. This is not overall parity.

```sh
pnpm exec vitest run --dir test test/oracle-orthogonal-edge-lists.test.ts --maxWorkers=1
```
