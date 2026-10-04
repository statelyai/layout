# ELK port edge lists

Long-edge splitter order left the initial crossing order as the earliest divergence in 186 cases. ELK builds that order by walking each node's ports and each port's edge list. Those lists depend on history: import order, two reversal stages, center-label insertion, long-edge splitting and, in compound graphs, hierarchy segment creation. Native had approximated these with sorted port lists and "reversed edges last".

Flat seed 8 RIGHT shows the difference. ELK's `EdgeAndLayerConstraintEdgeReverser` reverses whole fixed-side nodes in node order, port order and edge order. The cycle breaker then reverses some edges back, and every reversal appends the edge to its new port's lists. `n6:p0` ends as `e5, e12, e17, e11, e13, e6`; native listed `e5, e11, e12, e13, e17, e6`.

`src/layered/elk-port-lists.ts` replays ELK's lists:

- Import: authored ports in authored order, then one implicit port per remaining edge. Local edges keep import order; hierarchy segments follow in CompoundGraphPreprocessor creation order.
- `EdgeAndLayerConstraintEdgeReverser`: FIRST/LAST nodes first, then the whole nodes it reverses, copying each list before reversing.
- Cycle breaking: the remaining difference, visited node, port, outgoing edge.
- `LabelDummyInserter`: the labeled edge keeps its source slot; its tail moves to the end of the target port's incoming edges.

The lists then drive component order (ELK's layering DFS: ports in order, incoming before outgoing), LongEdgeSplitter traversal, and InvertedPortProcessor order (incoming edges re-appended by each split). The elkjs facade now orders group boundary ports as ELK's CompoundGraphPreprocessor creates them: ports exported by nested groups first, then direct children's ports. It also passes each hierarchy segment's creation rank to the simulation.

Validation against real ELK lists after cycle breaking ([port-list-validation.json](port-list-validation.json), `scripts/parity/validate-port-lists.ts`): every node matches in all six ordinary corpora (8,526 nodes). Options matches 647/674 nodes and complex 2,233/2,524. Of the 318 remaining mismatches, 260 come from shared hierarchy segments: ELK routes several edges leaving one inner port through one boundary segment, where native keeps one segment per edge. That is a separate structural difference, not list order.

Earliest divergence ([ranking](phase-ranking.json), same tool version on both sides): initial order 186 → 97, crossing order 35 → 84, placement 124 → 139, routing 20 → 31, cycle breaking 18 → 18, layering 0 → 0. Ordinary corpora retain at most one initial-order divergence each, apart from hierarchy cases in `report` (8) and `fresh` (6).

Complete 1,280-case replay against frozen real ELK outputs: **680 → 694 exact**, **101,702 → 93,292 differing values**, zero native errors before and after, 217 retained oracle errors. **14 gained, zero lost.** 80 outputs reduce differences; 56 increase them ([audit](audit.json)). Routes 80,683 → 73,772; junctions 11,464 → 10,575; nodes/hierarchy 6,980 → 6,418; root size 546 → 504; labels 1,155 → 1,147; ports 657 → 659.

| Corpus                  | Exact     | Differing values |
| ----------------------- | --------- | ---------------- |
| flat                    | 67 → 71   | 4,008 → 3,229    |
| directional 1–25        | 153 → 157 | 6,207 → 5,177    |
| expanded 26–50          | 158 → 159 | 8,157 → 4,932    |
| directional-fresh 51–75 | 156 → 157 | 6,307 → 4,592    |
| report 1–25             | 60 → 60   | 4,490 → 4,463    |
| fresh 26–50             | 56 → 56   | 5,051 → 4,847    |
| compound options        | 10 → 10   | 8,510 → 8,530    |
| complex                 | 20 → 24   | 58,972 → 57,522  |

Replay elapsed, eight parallel processes: 453 s (complex is the longest). The regression covers flat seeds 8 DOWN and 12 UP and complex seed 20 RIGHT; all three fail before and pass after. Full suite: **3,286 passed, 109 retained failures, 3,395 total**; file-qualified comparison shows zero new failures and three added passing regressions ([delta](full-test-delta.json)). Types, repository types, changed-file lint and format, build, the demo corpus and option mappings pass. This is not overall parity.

Next: crossing order (84) and placement (139) are now the largest earliest-divergence classes. Shared hierarchy segments account for most remaining compound port-list differences.

```sh
pnpm exec vitest run --dir test test/oracle-port-edge-lists.test.ts --maxWorkers=1
pnpm exec tsx scripts/parity/validate-port-lists.ts .scratch/port-lists.json docs/heuristics/elk-port-edge-lists/flat-report.json
pnpm exec tsx scripts/parity/compare-phases.ts .scratch/phases.json docs/heuristics/elk-port-edge-lists/flat-report.json
```
