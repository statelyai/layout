# Reversed junction chains

Compound-options-v1 seed 20 UP matches real ELK node, port and route geometry, but two edges concatenate their junction lists in the opposite order. All eight remaining geometry differences belong to those lists.

A read-only worker observer shows real ELK routing the physical flow chain before restoring edge direction. Its complete fresh output matches the uninstrumented worker. Native routing already generates the correct junctions for each segment; joining then reads segments in authored source-to-target order. That loses the physical routing order when a chain was reversed.

Joining now reads original routing junctions in physical segment order. It retains north/south junctions appended after joining and preserves route coordinates. The full geometry regression fails before and passes after; **27/27** focused current-checkout assertions pass. Frozen candidate source matches promoted source by AST.

Options: **9 → 10 exact**, **8,560 → 8,552 differing values**, zero native errors and four retained oracle errors. Ten outputs change: two improve, two increase by one, six retain their count; no exact match lost. Complete failures remain retained. [Before/native/real ELK comparison](comparison/index.html) uses equal scale and preserved coordinates. Full suite: **3,280 passed, 109 retained failures, 3,389 total**. File-qualified comparison shows zero new failures and one added passing regression. Source/repository types, lint and build pass. Options audit confirms zero non-junction geometry changes and zero junctions off routes. Its 1,100 ordinary cases plus options completed: **628/1,180 exact**, 49,654 differing values, zero native errors and 217 retained oracle errors. The final 100 complex cases were stopped for the requested pause; no complete newest-revision broad result claimed. This is not overall parity.

```sh
pnpm exec vitest run --dir test test/oracle-reversed-junction-chain.test.ts --maxWorkers=1
```
