# Merged dummy port faces

With crossing orders matching, 51 placement-first cases differed only on the layer axis. Flat seed 13 RIGHT shifts every layer from layer 2 by 10, 20, then 30: native reserved more routing space between layers. ELK's orthogonal router merges ports joined by edges or long-edge dummies into hyperedge segments. In the gap between layers 3 and 4, ELK's segment joins `n1:p1` through `e12`. `e12` is an inverted-port dummy that `HyperedgeDummyMerger` folded into the long-edge dummy for `e8`; its in-layer edge reaches `n1:p1`. Native dropped that in-layer edge from the gap, so it built two segments and needed an extra routing slot.

The in-layer edge still names its inverted dummy's `output` port. After merging, its source is a long-edge dummy without named ports, so native could not resolve a port side and skipped the edge. A dummy's `input` and `output` ports now resolve to the backward and forward sides, as dummy port settings do. Native and ELK then build the same segments in every gap of that case.

Complete 1,280-case replay: **710 → 716 exact**, **85,990 → 85,172 differing values**, zero native errors, 217 retained oracle errors. **6 gained, zero lost.** 101 outputs reduce differences; 23 increase them ([audit](audit.json)). Junctions 9,758 → 9,229; routes 68,066 → 67,824; nodes/hierarchy 5,917 → 5,876. Replay elapsed, eight parallel processes: 455 s.

The regression covers flat seeds 27 UP and 73 RIGHT under their corpus compaction strategies; both fail before and pass after. Full suite: **3,295 passed, 109 retained failures, 3,404 total**; zero new failures ([delta](full-test-delta.json)). Types, repository types, changed-file lint and format, build and the demo corpus pass. This is not overall parity.

Seed 13 RIGHT still differs: its remaining offset comes from self-loop tracks.

```sh
pnpm exec vitest run --dir test test/oracle-merged-dummy-port-faces.test.ts --maxWorkers=1
```
