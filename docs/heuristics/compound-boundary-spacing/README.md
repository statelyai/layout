# External boundary routing spacing

Native routing applied normal layer spacing next to external-port-only layers. Compound resizing then trimmed those layers and shifted WEST/NORTH children to the padding boundary. This discarded real routing corridors. Native orthogonal routing now reserves only required tracks beside boundary layers, matching ELK's external-layer rule; compound bounds include the external dummy positions. The compensating child shift is removed.

A zero-width boundary may share a flow coordinate with a child. Physical boundary-port sides now resolve implicit-anchor direction; layer order resolves feedback classification at tied coordinates. A shared explicit FIXED_SIDE port on an otherwise empty physical face uses its actual anchor, so multiple incident edges do not manufacture an extra routing track. The existing explicit descendant-port regression passes unchanged.

Twenty-four full-geometry fixtures cover random hierarchy seed 17, four directions and NONE plus five compaction strategies. Before 0db5f13: 12/24; current: 24/24. [Fixture gallery](fixtures/index.html) and [matching image](before-after.png) preserve identical inputs/dimensions/scale. `worker-phases.json` retains the real ELK trace: outgoing boundary reservations extend the child content width from 40 to 60, yielding an 84-unit padded container rather than native's former 64.

The unchanged 200-graph directional gate improves **74 to 80/200** full matches: flat remains 12/100, hierarchy 62 to 68/100. Differences decrease 14,619 to 14,350. No complete matches lost; zero native errors. The same six real ELK errors remain included. [Random gallery](index.html), `before.json` and `report.json` retain every input/output/error/difference at tolerance 5e-13. Broad parity remains incomplete.

```sh
pnpm exec vitest run test/oracle-compound-boundary-spacing.test.ts test/oracle-hierarchy-options.test.ts --maxWorkers=2 --exclude '.scratch/**'
pnpm exec tsx scripts/check-directional-compaction-parity.ts .scratch/directional-parity/report.json
```

The random gate remains nonzero until every graph matches. Production remains native; real elkjs is a development oracle.

Full suite: **2,371 passed / 106 failed / 2,477**. No failures introduced or resolved relative to 0db5f13; 24 new tests pass. All 90 focused checks pass, including the existing explicit descendant-port assertion. Complete suite and exact delta remain in `full-suite.json` and `validation.json`. Source/repository types, selected format/lint and package build pass.

Original gates rerun after the final explicit-port repair: flat 32/100 (10,614 differences, previously 10,625), hierarchy **88/100** (previously 72/100; 567 differences, previously 832), fixed-port loops 100/100 (zero differences). No engine errors or lost complete matches. All results remain in `original-*.json`.
