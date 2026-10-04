# Merged inverted routes

`HyperedgeDummyMerger` merges adjacent long-edge dummies of one hyperedge, including an `InvertedPortProcessor` dummy. The merged dummy keeps the inverted dummy's in-layer edge to the node's inverted port. ELK routes that edge in the adjacent channel.

Flat seed 17 UP: `e3` enters `n4`'s NORTH (output-side) port. Its inverted dummy merges with `e4`'s long-edge dummy. Native lost the dummy's port faces after merging and fell into the fixed-side feedback path, which detoured around the whole graph and widened the root by 10.5.

The in-layer inverted route now resolves a merged dummy's `input`/`output` ports to backward/forward faces, as slot assignment already did.

Complete 1,280-case replay: **746 → 769 exact**, **82,400 → 79,682 differing values**, zero native errors, 217 retained oracle errors, 38 non-finite oracle outputs. **23 gained, zero lost.** 98 outputs reduce differences; 1 increases them ([audit](audit.json)). Replay elapsed, eight parallel processes: 497 s.

The regression covers flat seeds 13 UP and 17 UP; both fail before and pass after. Full suite: **3,303 passed, 109 retained failures, 3,412 total**; zero new failures ([delta](full-test-delta.json)). Types, repository types, changed-file lint and format, build and the demo corpus pass. This is not overall parity.

```sh
pnpm exec vitest run --dir test test/oracle-merged-inverted-routes.test.ts --maxWorkers=1
```
