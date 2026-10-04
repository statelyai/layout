# Physical junction ownership

Compound-options-v1 seed 20 RIGHT retains identical node, port and route geometry, but native routing assigns one branch junction to e0 instead of e4. A read-only real ELK worker observer shows e4 visited first on the shared physical port. Full fresh worker outputs match with and without the observer.

Native junction ordering used the retained model/sweep order before accounting for incoming edges reversed onto the port. Real reversal appends those edges after retained outgoing edges. Route generation now observes that physical order before consulting the retained sweep order within each partition.

The complete seed regression fails before with two junction ownership differences and passes afterward. All 22 focused current-checkout assertions pass, including mixed-port junction ownership, hierarchical junction transfer and preplaced loop envelopes. Frozen source matches promoted source by AST.

Random options: **8 → 9 exact matches**, **8,579 → 8,560 differing values**, zero native errors and four oracle errors. Eighteen outputs change: eight reduce differences, two increase by one, eight retain their count; no exact match lost. All failures remain preserved. This is not overall parity. Full suite: **3,279 passed, 109 retained failures, 3,388 total**. File-qualified comparison shows zero new failures and one added passing regression. Source/repository types, lint and build pass. Independent options audit: zero non-junction geometry changes, zero junctions off routes. Broad replay is running against frozen source. [Before/native/real ELK comparison](comparison/index.html) preserves equal scale and coordinates.

```sh
pnpm exec vitest run --dir test test/oracle-in-layer-junction-owner.test.ts --maxWorkers=1
```
