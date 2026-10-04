# Hierarchy crossing order

Three processing differences changed native hierarchy geometry:

- Native redistributed compound-node ports on the fixed layer after a child published its boundary order. ELK preserves that child order.
- Separate external boundaries lost the network-simplex component order before long-edge splitting. Native now retains that order while restoring boundary nodes.
- Native ran the default flat greedy-switch pass in hierarchy. ELK defaults hierarchical greedy switching to OFF; native now applies that default and retains explicit hierarchical options.

Twelve full-geometry regressions cover random seeds 5, 7 and 9 in four directions: baseline commit `5c667a6` **0/12**, current **12/12**. The [fixture gallery](fixtures/index.html), [matching image](before-after.png) and real ELK worker trace retain identical inputs, directions, dimensions, scale and viewport. Seed 9's complete crossing-sweep sequence matches the oracle; its extra native greedy-switch pass was the remaining cause.

The unchanged original hierarchy corpus improves **88 to 100/100**, with zero differences or engine errors. Flat remains **32/100**, 10,614 differences; fixed-port loops remain **100/100**, zero differences. No original complete matches lost.

The broader directional option corpus improves **80 to 92/200**: flat 12/100; hierarchy 68 to 80/100. Differences decrease 14,350 to 13,777. No complete matches lost; zero native errors. Six real ELK errors remain included. [Random gallery](index.html), `directional-before.json` and `report.json` preserve all inputs, outputs, errors and failures at tolerance 5e-13. Broad parity remains incomplete.

Full suite: **2,383 passed / 106 failed / 2,489**. No introduced or resolved failures relative to the baseline; all twelve new tests pass. `full-suite.json`, `before-fixtures.json` and `validation.json` preserve complete results and exact deltas. Source/repository types, selected format/lint and package build pass. An overly broad component-order candidate regressed eight existing oracle assertions; the final boundary-restoration change passes those assertions unchanged.

```sh
pnpm exec vitest run test/oracle-hierarchy-fixed-layer-ports.test.ts --maxWorkers=2 --exclude '.scratch/**'
pnpm test:parity:compound
pnpm exec tsx scripts/check-directional-compaction-parity.ts
```

Original hierarchy success is bounded to this corpus. The broader gate remains nonzero; production stays native and real elkjs remains a development oracle.
