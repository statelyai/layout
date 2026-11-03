# Incremental routing measurements

The configured sparse fixture improved after removing repeated settings scans.
Five alternating baseline/optimized processes, each with 30 drag frames and one
trial, produced these per-process distributions on Node 24, 10 cores:

| Configured 1,000-edge fixture | Median across runs | Range across runs |
| ----------------------------- | -----------------: | ----------------: |
| Baseline p50 update           |           0.604 ms |    0.600–0.619 ms |
| Optimized p50 update          |           0.120 ms |    0.119–0.125 ms |
| Baseline p95 update           |           0.805 ms |      See raw runs |
| Optimized p95 update          |           0.151 ms |      See raw runs |

Each process produced 30 patches, one changed route per frame, zero fallbacks,
and zero errors. Final geometry matched fresh routing. The change removes work
proportional to all per-edge settings and repeated sorting of the pending set.
The remaining sparse update does local geometry/index work and route generation.

These results establish a change in this workload. The machine was busy
(load around 18 on 10 cores); runs alternated to reduce drift. They do not prove
a browser frame budget, end-to-end editor speedup, or allocation reduction.
The timer excludes projection/diff generation, initial routing, browser paint
and worker transfer. Heap deltas are GC-noisy. Other fixture changes were
inconclusive. The high-degree fixture remained substantially slower and produced
fallbacks, so it is not evidence of successful high-degree routing performance.

[Raw process results](benchmark-runs.json) retain all workloads, tails, counts,
machine load and scope. Rerun with `pnpm bench:routing`; the fixture/harness source
is committed under `bench/routing-fixtures.ts` and `scripts/bench-routing.ts`.

Separating drawn-segment reservations from searched dependency envelopes improved
the first 60 edges of the editor projection from a median 5,503 ms
(5,375–5,966 ms) to 2,014 ms (1,908–2,402 ms), across five alternating process runs.
The outputs were byte-identical and each run retained 191,256 search expansions,
161,994 obstacle candidates, 18 fallbacks and 6 empty routes. This isolates an
indexing improvement; those failures are not successful routing. The limiter was
reservation queries traversing unrelated segments and dependency envelopes.
[Raw reservation-index comparisons](reservation-index-runs.json) preserve the counts.

The full 300-edge adverse workload remains slow. A later single run of the editor's
preservation and `0`/`8` cost profile ran with load 41 on 10 cores. It produced four
initial empty routes and 57 initial fallbacks. Pointer updates remained above a
frame budget; emitted patches had zero hard failures. [That run](adverse-drag-run.json)
is retained as negative evidence, not a comparative speed claim. Use
`pnpm bench:viz-routing` to reproduce and profile this limit separately from the
sparse benchmark. Browser paint, worker transfer and projection/diff construction
remain excluded from these CPU measurements.
