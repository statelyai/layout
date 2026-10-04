# Greedy switch decider

After the port edge-list replay, 84 cases first diverged at the final crossing order. Per-sweep traces (`sweep` events from the native observer, `sweeps` from `scripts/parity/trace-phase-worker.mjs`) split them: 28 scopes matched every barycenter sweep and diverged only in ELK's greedy-switch pass. The rest diverged within barycenter sweeps, mostly in compound graphs.

Flat seed 7 RIGHT, layer 3: ELK swaps long-edge dummy `e3` past `n3`'s north port dummy; native keeps them. ELK's `SwitchDecider` compares local two-node estimates: crossing-matrix entries, two-node in-layer crossings on each side and north/south neighbour crossings. Here the in-layer count falls from 2 to 0 and the north/south term rises from 0 to 1, so ELK switches. Native recounted every crossing between the free layer and its neighbours, which stayed 7 either way. The local estimate and the global recount can disagree, and ELK uses the local one.

`src/layered/greedy-switch-decider.ts` ports ELK's decider:

- `BetweenLayerEdgeTwoNodeCrossingsCounter`: adjacency lists in north/south/east/west port order. Equal positions merge only when consecutive; a stable sort follows. Entries are cached per pair for the free layer.
- Two-node in-layer counters for both sides, sharing port positions that each switch updates incrementally. Connected ports are deduplicated by position, as in ELK's `TreeSet`.
- `NorthSouthEdgeNeighbouringNodeCrossingsCounter`, including two north/south dummies of one node.
- `constraintsPreventSwitch`: successor constraints; layout-unit and north/south edge constraints, which never apply to long-edge dummies; normal nodes never switch with north/south dummies.

When ELK copies the best barycenter order back to the graph, `assertCorrectPortSides` moves a north/south port to the side where its dummy ended. The greedy pass sees those sides, so `assertNorthSouthPortSides` applies them to the greedy crossing graph. Final geometry does not yet reflect that side change.

All 16 greedy-switch divergences in `flat` and `report` now match ELK sweep by sweep. Earliest divergence ([ranking](phase-ranking.json)): crossing order 84 → 53, placement 139 → 165, routing 31 → 33; other classes unchanged.

Complete 1,280-case replay: **694 → 697 exact**, **93,292 → 90,863 differing values**, zero native errors, 217 retained oracle errors. **3 gained, zero lost.** 33 outputs reduce differences; 2 increase them ([audit](audit.json)). Routes 73,772 → 71,868; junctions 10,575 → 10,191; nodes/hierarchy 6,418 → 6,289; root size 504 → 492; ports and labels unchanged. Compound corpora are unchanged: ELK disables greedy switching for hierarchical layouts by default.

| Corpus                  | Exact     | Differing values |
| ----------------------- | --------- | ---------------- |
| flat                    | 71 → 71   | 3,229 → 2,707    |
| directional 1–25        | 157 → 157 | 5,177 → 4,739    |
| expanded 26–50          | 159 → 160 | 4,932 → 4,923    |
| directional-fresh 51–75 | 157 → 159 | 4,592 → 4,386    |
| report 1–25             | 60 → 60   | 4,463 → 3,962    |
| fresh 26–50             | 56 → 56   | 4,847 → 4,094    |
| compound options        | 10 → 10   | 8,530 → 8,530    |
| complex                 | 24 → 24   | 57,522 → 57,522  |

Replay elapsed, eight parallel processes: 449 s. The regression covers flat seeds 63 DOWN, 58 UP and 37 DOWN under their corpus compaction strategies; all fail before and pass after. Full suite: **3,289 passed, 109 retained failures, 3,398 total**; zero new failures and three added passing regressions ([delta](full-test-delta.json)). Types, repository types, changed-file lint and format, build and the demo corpus pass. This is not overall parity.

Next: barycenter-sweep divergences remain (first sweep in flat seed 13 RIGHT: ELK visits `n0`'s in-layer neighbours in a different port order, so random perturbations land differently). Placement is now the largest class.

```sh
pnpm exec vitest run --dir test test/oracle-greedy-switch-decider.test.ts --maxWorkers=1
node scripts/parity/audit-replay.mjs docs/heuristics/elk-port-edge-lists docs/heuristics/greedy-switch-decider
```
