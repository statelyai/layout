# Shared directional compaction

Orthogonal LEFT, RIGHT and both locking strategies previously used a separate all-pairs approximation. They now share EDGE_LENGTH's rigid groups, node/track geometry and scanline visibility constraints. ELK's longest-path pass replaces weighted optimization for these directional modes; the reverse pass mirrors group offsets and applies constraint or connection locks. Spline-specific directional compaction remains on its existing path.

Terminal vertical legs move with their endpoints and contribute only the span outside the owner border. Previously a compacted label could move independently from its terminal leg, creating a diagonal. Merged fan-out long-edge dummies also now disappear before compaction: each original edge chain is retained through shared dummies, including chains split around north/south ports. Without this, zero-size dummy hitboxes collided with routing tracks.

All 48 focused full-geometry fixtures match real ELK 0.11.1: four directions, four directional modes, implicit/flow/cross ports. Archived b2e9fb4 matches 16/48. `fixtures/` preserves identical before/current/oracle inputs and geometry; `before-after.png` shows RIGHT/LEFT cross-port compaction at equal scale.

The new gate keeps 200 reproducible inputs: 25 seeds in four directions, flat/hierarchical, with directional modes assigned by seed. Before: 0/200 matches, 19,331 differences. Current: 8/200 matches, 16,186 differences; zero native errors. Real ELK errors on six unchanged flat inputs; those failures remain preserved rather than excluded. Flat improves 0 to 8/100 (16,746 to 13,796 differences); hierarchy remains 0/100 (2,585 to 2,390). No complete matches lost. Broad parity remains incomplete.

Full suite: 2,295 passed / 106 failed. Three prior exterior-label/compaction failures resolve. Three legacy email-drafter label-between-endpoints assertions newly fail (DOWN, UP, RIGHT); real ELK also violates those same fixture/direction assertions. Assertions remain unchanged, and those aesthetic regressions remain explicit in `validation.json`. New engine errors found during development were fixed before this result.

The typed-dummy BK conflict correction remains unshipped. `minimal-label-flow.json`, `label-worker-phases.json` and `typed-dummy-label-comparison.json` preserve the diagnosis: real ELK passes the state-anchor RIGHT/LEFT fixtures while the native candidate fails. That difference still needs a fix. `legacy-vertical-oracle.json` preserves native/ELK outputs for the separate legacy vertical fixtures.

```sh
pnpm exec vitest run test/oracle-directional-compaction.test.ts --maxWorkers=2 --exclude '.scratch/**'
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/directional-parity/report.json
```

The gate exits nonzero until every graph matches and preserves every error/difference. Source/repository types, selected format/lint and package build pass. Original random gates are verified separately; this new option corpus does not replace them.

Original unchanged gates: flat 32/100 (10,625 differences), hierarchy 72/100 (832), fixed-port loops 100/100. Zero errors and no lost matches in those original corpora.
