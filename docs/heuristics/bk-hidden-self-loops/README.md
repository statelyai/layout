# BK hidden self loops and the hyperedge-merger gate

Two placement causes, one replay.

**Self loops in BK straightening.** `SelfLoopPreProcessor` removes self loops before cycle breaking and restores them after node placement. Native BK edge straightening still picked them. Model-order flat seed 38 UP: `e8` loops on `n5`; native queued `n5` behind that loop, so the in-layer edge `e7` never straightened `n5` toward its inverted dummy. Straightening now skips self loops. Edges missing from the port order (the in-layer parts of a merged dummy) now sort after the listed edges, instead of before them.

**Hyperedge merger gate.** ELK schedules `HyperedgeDummyMerger` only when import finds a port with more than one incoming or more than one outgoing edge, or a hypernode. Options seed 5 RIGHT has no such port, so ELK keeps `e0`'s inverted dummy apart from `e1`'s long-edge dummy; native merged them and aligned `n1` with the wrong block. Native now applies the same gate to scopes without hierarchy segments.

Complete 1,280-case replay: **769 → 772 exact**, **79,682 → 79,573 differing values**, zero native errors, 217 retained oracle errors, 38 non-finite oracle outputs. **3 gained, zero lost.** 9 outputs reduce differences; none increase ([audit](audit.json)). Replay elapsed, eight parallel processes: 588 s.

The regressions cover model-order flat seeds 38 UP and 43 DOWN, plus options seed 5 RIGHT; all fail before and pass after. Full suite: **3,306 passed, 109 retained failures, 3,415 total**; zero new failures ([delta](full-test-delta.json)). Types, repository types, changed-file lint and format, build and the demo corpus pass. This is not overall parity.

```sh
pnpm exec vitest run --dir test test/oracle-bk-hidden-self-loops.test.ts test/oracle-hyperedge-merger-gate.test.ts --maxWorkers=1
```
