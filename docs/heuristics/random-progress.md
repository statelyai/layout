# Random native / real ELK differential results

Native source: `ceef0b107cee294e10f1538ee9f9cea67b43e255`; actual elkjs `0.11.1`. Main fetched before this work: `81363b469e857650527548a5bd356c98727f378e`. The task branch includes that revision. **Parity gate fails.** Geometry correctness is a separate result from crossings and bends.

All 160 native layouts pass the measured geometry invariants: finite complete
orthogonal routes, no leaf-node penetrations, unrelated node/label overlaps,
edge/label penetrations, or self-retracing outside terminal regions. Border
contact and shared tracks remain possible; visual readability is not established.

Every seed generates five flat and five hierarchical profiles, including cycles, loops, parallel and cross-boundary edges, labels, variable sizes, and fixed ports. Degree is bounded at six; ports at four, one per side. All inputs and failed oracle cases remain in the reports. Fresh draws are saved before execution. They become observed cases after this run.

[140-graph replay](random-replay.md) / [raw replay](random-replay.json) and [20 freshly drawn graphs](random-fresh.md) / [raw fresh](random-fresh.json) retain per-graph metrics and every failed gate. Source revision, generator and scorer hashes, and working-tree state are recorded. The dirty marker reflects the uncommitted visual-proof folder during measurement; tracked source matches the revision.

| Native metric, same original 60 inputs ([raw before](random-before.json)) | Before `015b0b5` | After `ceef0b1` |
| ------------------------------------------------------------------------- | ---------------: | --------------: |
| diagonals                                                                 |              2.0 |             0.0 |
| nodeHits                                                                  |              4.0 |             0.0 |
| nodeOverlaps                                                              |              0.0 |             0.0 |
| labelNodeOverlaps                                                         |              0.0 |             0.0 |
| labelOverlaps                                                             |              0.0 |             0.0 |
| edgeLabelHits                                                             |              9.0 |             0.0 |
| selfRetraceLength                                                         |             50.0 |             0.0 |
| edgeCrossings                                                             |           5122.0 |          4816.0 |
| edgeOverlapLength                                                         |          11003.1 |         10967.5 |
| bends                                                                     |           8238.0 |          8383.0 |
| routeLength                                                               |        1737702.2 |       1718044.4 |

Replay: 140 graphs, 126 comparable, 0 native failures, 14 ELK failures. edgeCrossings: Stately better 31, tied 3, ELK better 92; bends: Stately better 12, tied 0, ELK better 114.

Fresh draw: 20 graphs, 17 comparable, 0 native failures, 3 ELK failures. edgeCrossings: Stately better 2, tied 1, ELK better 14; bends: Stately better 2, tied 0, ELK better 15.

Corrections include physical fixed-port ordering; a continuous Java-style random stream from cycle breaking into crossing minimization; Manhattan search for orthogonal routes; valid retry leads in subpixel gaps; hard reservations against self-retracing outside true label/terminal regions; and preservation of unrelated-node spacing during port-side alignment. Reproduced counterexamples are unit regressions.

The existing native implementation still differs from ELK across cyclic ordering, port processing, compound/cross-boundary phase coordination, and route channel allocation. The strict gate requires native geometry invariants plus crossings and bends no worse than ELK per comparable graph. An oracle failure remains unverified. Shared track length, detours, area and the human-authored aesthetic rubric remain additional quality measures; passing this finite gate would not establish universal parity.

[Matching before/after proof](../proofs/random-parity/README.md) preserves graph inputs, dimensions, direction, scale and viewport. The review gallery defaults to native / real ELK comparison.
