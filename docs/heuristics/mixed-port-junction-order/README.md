# Physical junction order and mixed ports

Parity remains incomplete. Seed 2 RIGHT had eight junction differences after node and route geometry matched. Two native gaps remained: merged helpers assigned shared junctions in root edge order, losing their retained physical incident order; north/south restoration omitted branch junctions when the same authored port had both incoming and outgoing edges.

Native routing now uses the selected source-port order before its root-order fallback. Restoring a mixed-role port appends its restored bend as a junction on every incident edge, matching real ELK's `sameOriginPort` behavior. Spline restoration retains its separate policy. Restored branch counts also preserve ELK's append order after joining long-edge routing junctions. Seed 2 RIGHT now matches **complete geometry**, including every junction.

[Real routing and restoration observations](./worker-phases.json) record 54 junction candidates, 12 accepted during routing, and four branch junction additions during mixed-port restoration. The observer delegates every original call and leaves the complete real output byte-for-byte unchanged. Native edge `e21` now owns the shared first bend before `e11`, following merged physical order; restored `n5` branches retain `(508, 194)` on all four incident edges. [Native RNG/output](./native-rng.json).

Nineteen regressions compare complete node, port, label, route and junction geometry against real elkjs 0.11.1: random seed 2 RIGHT and seed 32 DOWN/UP, plus direct and joined mixed-role ports on both cross-axis sides in all four directions. All nineteen fail before and pass after: [red](./regression-red.json), [green](./regression-green.json).

Across **1,100 preserved random inputs**, strict matches rise **573 → 601**, with **28 gained and none lost**. Differing values fall **41,284 → 40,992**. Zero native exceptions. The 213 saved oracle exceptions remain failures. This replay reruns native against complete pinned real-ELK outputs/errors; focused regressions rerun both engines.

| Corpus            | Before matches | After matches | Before differences | After differences |
| ----------------- | -------------: | ------------: | -----------------: | ----------------: |
| Model seeds 1–25  |         55/200 |        58/200 |              4,440 |             4,376 |
| Model seeds 26–50 |         45/200 |        51/200 |              5,211 |             5,112 |
| Default flat      |         51/100 |        53/100 |              7,161 |             7,170 |
| Directional       |        145/200 |       146/200 |              8,473 |             8,513 |
| Expanded          |        140/200 |       149/200 |              9,162 |             9,103 |
| Fresh directional |        137/200 |       140/200 |              6,837 |             6,778 |

Of 181 changed outputs, 90 improve, 58 worsen and 33 retain the same difference count. All worsened rows and earlier failures remain preserved by complete baselines plus indexed updates: [deltas](./delta.json), [report](./report.json), [fresh report](./fresh-report.json). The added junctions expose other incomplete routing/port preparation cases; these are not counted as successes.

[Equal-scale before/native/real-ELK gallery](./index.html) covers all 200 first-range inputs. [Browser proof](./comparison.png) confirms seed 2 RIGHT. [Before joining-order correction](./before-joining-order.json) preserves the earlier 597-match trial and its 64 worsened rows; corrected ordering raises exact matches to 601 and leaves 58 worsened rows. All changed public fields are junction metadata; node, port, label and route-section geometry is unchanged from the previous production commit.

<!-- diagnostic commands from package.json and scripts/parity/trace-routing-worker.mjs -->

Reproduce:

```sh
pnpm exec tsx scripts/check-model-order-parity.ts .scratch/model-order.json 1 25
pnpm exec tsx scripts/check-model-order-parity.ts .scratch/model-order-fresh.json 26 50
pnpm exec vitest run --dir test test/oracle-mixed-port-junction-order.test.ts
node scripts/parity/trace-routing-worker.mjs docs/heuristics/mixed-port-junction-order/report.json .scratch/junction-worker.json 1
```

Next: compare remaining physical port order and routing preparation against real ELK, continue hierarchy placement/routing and broader option coverage, and retain every incomplete case. Fresh seed 38 DOWN now matches every node, port, route and junction, leaving a one-pixel root-width difference; [real worker phases](./bounds-worker-phases.json) retain that next placement/bounds investigation. The complete parity goal remains active.

Validation: **118/118 focused tests**. Full suite: **2,874 passed / 101 unchanged failures / 2,975 total**; [failure-name comparison](./suite-delta.json), [suite](./full-suite.json). Source/repository types, selected lint/format and build pass, with existing mixed-export build warnings. The joining-only seed 32 DOWN/UP regressions also fail with branch creation present but append ordering removed, then pass after restoring it: [joining red](./joining-red.json), [joining green](./joining-green.json).
