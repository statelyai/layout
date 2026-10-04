# Port edge visit order

The greedy switch decider left 53 cases diverging first at crossing order, most within barycenter sweeps. Flat seed 13 RIGHT diverges in the first sweep: same port ranks and Random draws, but different barycenter perturbations for two inverted-port dummies, `e29` and `e20`. ELK's `calculateBarycenter` walks a free node's ports and each port's edges in list order, recursing into same-layer neighbours before the node draws its own perturbation. `n0` receives both dummies' in-layer edges on one east port. ELK lists `e29` before `e20` there, the order the splitter left; native sorted edges within a port by model order.

Within each port, the sweep now visits edges in ELK's simulated list order: incoming lists after long-edge splitting, outgoing lists after reversal. It falls back to model order for edges the lists do not name. Every crossing-order case in the flat corpus (seeds 8 RIGHT, 13 RIGHT, 8 LEFT) now matches ELK sweep by sweep, including greedy switching.

Complete 1,280-case replay: **697 → 698 exact**, **90,863 → 88,958 differing values**, zero native errors, 217 retained oracle errors. **1 gained, zero lost.** 30 outputs reduce differences; 14 increase them ([audit](audit.json)). Complex differences rise 57,522 → 57,643; every other corpus falls.

| Corpus                  | Exact     | Differing values |
| ----------------------- | --------- | ---------------- |
| flat                    | 71 → 71   | 2,707 → 2,270    |
| directional 1–25        | 157 → 157 | 4,739 → 4,370    |
| expanded 26–50          | 160 → 161 | 4,923 → 4,566    |
| directional-fresh 51–75 | 159 → 159 | 4,386 → 3,996    |
| report 1–25             | 60 → 60   | 3,962 → 3,897    |
| fresh 26–50             | 56 → 56   | 4,094 → 3,724    |
| compound options        | 10 → 10   | 8,530 → 8,492    |
| complex                 | 24 → 24   | 57,522 → 57,643  |

Replay elapsed, eight parallel processes: 445 s. The regression (flat seed 33 DOWN, LEFT compaction) fails before and passes after. Full suite: **3,290 passed, 109 retained failures, 3,399 total**; zero new failures ([delta](full-test-delta.json)). Types, repository types, changed-file lint and format, build and the demo corpus pass. This is not overall parity.

```sh
pnpm exec vitest run --dir test test/oracle-port-edge-visit-order.test.ts --maxWorkers=1
```
