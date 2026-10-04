# Initial model order and port-helper placement

Parity remains incomplete. Native initial model sorting ran after north/south helper insertion, discarded physical port order when preparing a new crossing graph, and compared feedback helpers using generated edge order. Native now sorts before those helpers, carries sorted physical ports into the crossing session, includes every unseeded helper, retains cycle-broken incoming adjacency, and follows real ELK's shared-port helper comparator decisions. Inverted helper creation follows owner/port traversal and appended reversed edges.

Brandes-Koepf conflict detection also treated every dummy identifier as a long-edge node. Real ELK only treats `LONG_EDGE → LONG_EDGE` segments as inner segments; north/south port and label helpers are separate types. Excluding them restores valid alignments. Seed 2 RIGHT improves from **32 to 8 differences**, with all nodes, ports, labels and route sections matching. Eight junction differences remain. The phase-aligned trial previously had 219 differences: correcting the node types reduced that to eight. [Real worker observations](./worker-phases.json), [native RNG](./native-rng.json).

Across **1,100 preserved random inputs**, strict matches rise **566 → 573**, differing values fall **48,492 → 41,284**, and no complete matches are lost. Zero native exceptions. The 213 oracle exceptions remain failures, never matches. All cached real outputs are pinned ELK 0.11.1 references; this replay reruns native against them. Both engines also run in the seven retained full-geometry regressions.

| Corpus            | Before matches | After matches | Before differences | After differences |
| ----------------- | -------------: | ------------: | -----------------: | ----------------: |
| Model seeds 1–25  |         54/200 |        55/200 |              5,878 |             4,440 |
| Model seeds 26–50 |         39/200 |        45/200 |              9,147 |             5,211 |
| Default flat      |         51/100 |        51/100 |              7,649 |             7,161 |
| Directional       |        145/200 |       145/200 |              8,870 |             8,473 |
| Expanded          |        140/200 |       140/200 |              9,413 |             9,162 |
| Fresh directional |        137/200 |       137/200 |              7,535 |             6,837 |

Of 109 changed outputs, 88 improve, 16 worsen and five retain the same difference count with changed geometry. Every worsened row remains in the reports and [deltas](./delta.json); complete baselines plus indexed updates preserve all earlier failures. Seven new exact cases—seed 22 UP, seed 44 all four directions, seed 49 DOWN/UP—fail against the previous production commit and pass with this change: [red](./regression-red.json), [green](./regression-green.json).

The first integration trial dropped unseeded helpers and lost prepared port state. Adding unused ports directly to crossing counters also broke existing port-influence tests. Those trials were rejected; [their failures and exceptions](./rejected-state-transfer.json) remain recorded. Restoring node/port state and removing the counter change passes all 88 earlier focused regressions. Production crossing counters keep their existing connected-port policy; unused-port integration remains unfinished.

[Equal-scale before/native/real-ELK gallery](./index.html) preserves all 200 first-range inputs. [Seed 2 comparison](./comparison.png) shows matching node/route geometry with remaining junction differences. [Seed 22 UP comparison](./exact-comparison.png) confirms one newly exact result against real ELK at equal scale.

<!-- diagnostic commands from package.json and scripts/parity/trace-routing-worker.mjs -->

Reproduce:

```sh
pnpm exec tsx scripts/check-model-order-parity.ts .scratch/model-order.json 1 25
pnpm exec tsx scripts/check-model-order-parity.ts .scratch/model-order-fresh.json 26 50
pnpm exec vitest run --dir test test/oracle-model-order-helper-alignment.test.ts
node scripts/parity/trace-routing-worker.mjs docs/heuristics/prepared-model-order/report.json .scratch/model-order-worker.json 1
```

Next: fix remaining junction generation, finish unused/free/shared port preparation, and continue hierarchy placement/routing and broader option parity. The complete parity goal remains active.

Validation: **95/95 focused tests**, including seven new full-geometry regressions. Full suite: **2,855 passed / 101 unchanged failures / 2,956 total**; [failure-name comparison](./suite-delta.json), [suite](./full-suite.json). Source/repository types, selected lint/format and build pass; existing mixed-export build warnings remain. The real worker observer adds crossing-score and BK conflict observations while preserving its complete public output exactly.
