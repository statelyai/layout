# Nested placement bounds

Parity remains incomplete. Native normalization retained the measured helper extent only when the scope had no compound children. That guard belonged to the legacy route-pixel allowance; it also suppressed actual phase bounds in nested scopes. Removing helpers then lost a long-edge dummy's one-pixel thickness. Incorrect child sizes propagated into parent placement and routing.

Normalization now retains the measured extent in compound scopes while keeping the legacy pixel allowance restricted to flat scopes. Wrapping, feedback, promotion and post-compaction policies remain intact. No graph-specific condition or tolerance was added.

For seed 4 RIGHT, ELK's inner layer-size phase measures height **359.6**, including a last long-edge dummy at y=0 with height 1. Padding produces compound `g1` height **383.6**; native previously returned 382.6. Its ancestors previously returned 417.6 and 441.6, now correctly 418.6 and 442.6. [Real phase observations](./worker-phases.json). A fresh unobserved ELK run is byte-identical to the observer output. The reused saved oracle differs only in Java runtime `$H` identities; every other field and complete geometry matches: [observer proof](./observer-proof.json).

Across the **100 deeper random graphs**, complete matches rise **8 → 20** and differing values fall **61,202 → 61,058**, with zero exceptions in either engine. Twelve complete matches gained and none lost. Two incomplete cases worsen: seed 20 DOWN/UP add three differences each (a child width and two bends), from 323→326 and 386→389; both remain recorded. [Complete complex delta](./complex-delta.json), [complete sparse report](./complex-report.json).

The original **1,100 retained inputs** preserve **608 exact matches**, **40,983 differing values**, zero native exceptions and 213 oracle exceptions counted as failures. Fifty native outputs change in oracle-error rows; those remain unverified against ELK and remain failures. Every comparable original output is unchanged. [Deltas](./delta.json) reference all earlier reports, inputs and failures.

Combined coverage: **628/1,200 exact matches**, **102,041 differing values**, zero native exceptions, 213 retained oracle exceptions. These numbers do not establish parity.

Twelve regressions rerun both native and real elkjs 0.11.1 for seeds 4, 16 and 24 in all four directions. They compare every node, port, label, route, junction and container field. All twelve fail before and pass after: [red](./regression-red.json), [green](./regression-green.json). Seed 16 RIGHT/LEFT previously had 50 differences; correcting child sizes now aligns its parent placement and routes too.

[Equal-scale before/native/real gallery](./complex-comparison/index.html#15) retains all 100 inputs. [Browser proof](./complex-comparison/comparison.png) verifies seed 16 RIGHT at zero complete-geometry differences. Original source/repository types, selected lint/format and build pass with existing mixed-export warnings.

<!-- diagnostic commands from test/oracle-nested-placement-bounds.test.ts and scripts/parity/trace-compound-worker.mjs -->

Reproduce:

```sh
pnpm exec vitest run --dir test test/oracle-nested-placement-bounds.test.ts
node scripts/parity/trace-compound-worker.mjs docs/heuristics/physical-hierarchy-boundaries/complex-report.json .scratch/nested-worker.json 3
```

Next: compare the remaining complex hierarchy crossing/placement and physical-port phases against real ELK, including the retained seed 20 bounds/routing gap. The full parity goal remains active.

Validation: **2,897 passed / 101 unchanged failures / 2,998 total**, with identical failed names: [suite](./full-suite.json), [comparison](./suite-delta.json). The earlier eight-regression run is retained in [eight-regression suite](./eight-regressions-suite.json). Latest main fetched and fork point verified; PR targets main.
