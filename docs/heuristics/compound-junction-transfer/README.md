# Compound junction transfer

A retained random graph (compound-options-v1, seed 13, RIGHT) matched every node, port, route and label coordinate but lost five junction points. Child routes were joined through hierarchy boundaries using only their bends. The real ELK compound postprocessor copies both bends and junctions, applying the same child-to-reference coordinate offset in source-to-target segment order.

The native adapter now carries each child segment's junctions through restoration, including ancestor-owned endpoints. It copies those points into the declared edge container with the same offsets used for joining routes. Production remains native TypeScript.

<!-- regression and random evidence from test/oracle-compound-junction-transfer.test.ts and options-report.json -->

Seed 13 is now a complete geometry match: **five differences → zero**, **10 junction points → 15**, matching real ELK's 15. [Before/native/real ELK proof](comparison/index.html) uses preserved coordinates and a shared scale/viewport. The renderer now displays actual junction dots and counts.

Frozen random options: **4 → 6 exact matches out of 80** (RIGHT seeds 2 and 13 gained), zero exact matches lost, zero native errors and four retained oracle errors. Of 61 changed outputs, eight reduce differing values and 42 increase them; total differing values **8,466 → 8,606**. These are strict failures, not passing parity.

The independent before/after audit records **zero non-junction geometry changes**, and **zero exported junctions off their edge routes**. Aggregate per-edge junction count deficits relative to ELK fall **320 → 139**, while excess counts rise **97 → 168**. Count deficits are not point-identity matches. Copying native segment junctions exposes existing native route/branch disagreements; no filtering is added to hide them.

`before.json`, `after.json` and `options-report.json` preserve full inputs/native/oracle outputs through validated baseline chains; `options-delta.json` retains every changed case. The metadata-preservation experiment changed none of 80 outputs and was not promoted. Source provenance records AST equivalence between the frozen candidate and promoted source, allowing formatting-only differences.

<!-- validation from validation.json, raw test reports and serial timeout rerun -->

Raw full run: **3,274 passed, 112 failed, 3,386 total**. Two previously passing cases exceeded their unchanged 30-second budgets under concurrent replay; the new test exceeded the default five-second budget. Serial rerun passes all three, with strict assertions unchanged. The new oracle regression now uses 30 seconds, matching other compound oracle tests. Combined verified state: **3,277 passed, 109 retained failures**, zero new geometry failures. Focused run passes all 430 prior tests; its one new-test timeout clears in the serial rerun. Raw reports and the failure delta remain retained, rather than rewriting the original full-run result. Source/repository types, changed-file lint/format and build pass.

Reproduce:

```sh
pnpm exec vitest run test/oracle-compound-junction-transfer.test.ts --maxWorkers=1 --testTimeout=30000
pnpm exec tsx scripts/replay-native-compound-parity.ts docs/heuristics/integrated-boundary-routing/options-report.json .scratch/junction-options.json
pnpm exec tsx scripts/parity/audit-junction-transfer.ts docs/heuristics/integrated-boundary-routing/options-report.json .scratch/junction-options.json .scratch/junction-audit.json
node scripts/render-compound-parity-comparison.mjs docs/heuristics/compound-junction-transfer/before.json docs/heuristics/compound-junction-transfer/after.json .scratch/junction-comparison 0
```

The random replay intentionally exits nonzero while any geometry case differs. Overall parity remains incomplete.
