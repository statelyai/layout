# North/south port sides

Placement became the largest earliest-divergence class (176 cases) once crossing orders matched. Splitting those cases by axis showed 36 differing only on the in-layer axis in the model-order corpora `report` and `fresh`.

Model-order seed 3 RIGHT (forced node model order) shows the cause. Crossing minimization leaves `n4`'s north port dummy below `n4`. When ELK copies the best order back to the graph, `SweepCopy.assertCorrectPortSides` moves such a port to the side its dummy reached. Placement, routing and output then use that side: ELK places fixed-position port `n4:p2` on the south edge (`y` −4 → 48). Native kept the authored side.

After crossing minimization, native now switches each north/south port whose dummy lies on the other side of its owner. It uses the existing port-side override that later phases already read. The greedy switch decider already applied the same correction to its own crossing graph.

Complete 1,280-case replay: **698 → 710 exact**, **88,958 → 85,990 differing values**, zero native errors, 217 retained oracle errors. **12 gained, zero lost**; 25 outputs reduce differences, 1 increases. Ports 658 → 417; routes 70,326 → 68,066; nodes/hierarchy 6,140 → 5,917; junctions 9,980 → 9,758; root size 490 → 468. Only the model-order corpora change: `report` 60 → 69 exact (3,897 → 2,608 differences) and `fresh` 56 → 59 (3,724 → 2,045). Replay elapsed, eight parallel processes: 437 s.

The regression covers model-order flat seeds 3 RIGHT, 23 DOWN and 17 RIGHT; all fail before and pass after. Full suite: **3,293 passed, 109 retained failures, 3,402 total**; zero new failures ([delta](full-test-delta.json)). Types, repository types, changed-file lint and format, build and the demo corpus pass. This is not overall parity.

```sh
pnpm exec vitest run --dir test test/oracle-north-south-port-sides.test.ts --maxWorkers=1
```
