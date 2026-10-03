# Integrated perpendicular boundary routing

Native perpendicular boundary constraint preparation, helper sizing and post-routing now run in the layered pipeline. Direction transforms preserve canonical ELK helper geometry; restoration reserves the routing tracks, restores physical ports and retains measured child bounds. Parent sweep selection counts physical port sides. Production uses no elkjs.

<!-- current coverage from test/oracle-authored-compound-port.test.ts and preserved endpoints.json -->

The strict authored/implicit ancestor endpoint gate improves from **224/320 to 320/320 exact matches**, with zero differing geometry values or engine exceptions. Inputs cover four directions, FREE/FIXED_SIDE/FIXED_ORDER/FIXED_POS constraints, four sides, input/output endpoints and root/compound edge storage, plus implicit endpoints. Assertions remain strict. The independent [phase checks](../hierarchical-port-phases/README.md) retain 800 checks.

[Before/native/real ELK comparison](comparison/index.html) renders six identical inputs across four directions at a shared scale and viewport, using preserved route coordinates. All six native results match ELK. Full before/after endpoint reports remain alongside this page.

<!-- verification derived from integrated-full-tests.json.gz and integrated-focused-tests.json.gz -->

Focused production tests: **334 passed, zero failed**. Full production suite: **3,276 passed, 109 failed (3,385 total)**. Compared with the preceding pipeline, 100 failures clear; the retained older full-suite baseline also includes one separately repaired ancestor-route failure. File-qualified comparison against that baseline records 101 fixes and **zero introduced failures** in `integrated-full-delta.json`. Full raw test reports are retained compressed. Source/repository type checks, changed-source lint and build passed.

The frozen 80-case random compound-options gate remains **4/80 exact**, with **8,466 differing values, zero native errors and four real ELK errors**. Its predecessor had 9,421 differences. Of 46 changed native outputs, 32 reduce differences and nine increase them; none loses an exact match. All inputs, errors and full oracle outputs remain reachable through `options-report.json` and its baseline chain. Engine errors never count as matches.

**This is not overall parity.** Random compound failures, label ownership/positions, custom anchors, root ports and merged hierarchical edges still need work. The completed 1,180-case portion of the retained random replay has 612 exact matches, 49,704 differing values, zero native errors and 217 oracle errors. All 1,100 ordinary random outputs remain unchanged; the 80 options cases account for the changed outputs above. The final 100 complex cases are still running; `random-progress.json` explicitly marks this replay incomplete.

Reproduce:

```sh
pnpm exec vitest run test/oracle-authored-compound-port.test.ts test/hierarchical-port-phases.test.ts --maxWorkers=2
pnpm exec tsx scripts/replay-native-compound-parity.ts docs/heuristics/integrated-boundary-routing/options-report.json .scratch/replayed-options.json
node scripts/render-compound-parity-comparison.mjs docs/heuristics/integrated-boundary-routing/before-endpoints.json docs/heuristics/integrated-boundary-routing/endpoints.json .scratch/boundary-comparison
```

The replay command deliberately exits nonzero while any case differs. `scripts/parity/archive-report.mjs` relocates reports while verifying every retained row stays unchanged.
