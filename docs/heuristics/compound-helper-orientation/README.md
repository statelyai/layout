# Compound helper constraints

Parity remains incomplete. Production uses native TypeScript; real elkjs 0.11.1 is the development oracle. Geometry comparison retains the strict 5e-13 tolerance, full routes, hierarchy, ports, labels, and bounds. Exceptions remain failures even when both engines throw.

## Cause and correction

The compatibility adapter created every compound boundary helper with `FREE` constraints and assigned its first/last layer solely from edge direction. Real ELK passes the owning compound's constraints into `createExternalPortDummy`; fixed sides survive direction transformation, including the corresponding layer constraints. The native factory already modeled this state, but the adapter discarded it.

Pass authored constraints and the input/output boundary side to that factory. For newly synthesized zero-size ports, preserve the zero position. Assign first/last layers from the resulting physical side and layout direction. Cross-axis helpers have no flow-axis layer constraint. Their missing hierarchical routing phases remain unresolved; no endpoint or bend repair substitutes for those phases.

The existing 48-case complete-geometry constraint matrix improves **30→36 matches**, with no lost matches. Six LEFT cases across ports, feedback, and parallel edges become exact for `FIXED_ORDER`/`FIXED_POS`. Twelve DOWN/UP cases remain failing, with their original assertions retained. See [matrix delta](matrix-delta.json) and [six-case before/after comparison](minimal-comparison/index.html). The comparison contains complete outputs and a real-worker phase trace.

## Fresh random coverage

The retained 1,200 inputs contain zero authored compound constraints ([audit](retained-coverage.json)). Their complete native replay is unchanged: 628 matches, 99,176 differing values, zero native exceptions, and 213 oracle exceptions. Add the independent, frozen `compound-options-v1` generator rather than alter previous seeds. Seeds 1–20 in all four directions produce 80 graphs: 16 flat, 64 hierarchical, four nesting levels, four compound constraint modes, 92 authored compound ports, 248 labels, and 36 same-port loops. Node sizes vary; ports never exceed four per node or one per side. Ancestor/descendant edges and cross-boundary edges remain included. A SHA-256 regression pins the entire input sequence, including failing seeds. See [coverage](coverage.json).

| Fresh 80 graphs   | Before | After |
| ----------------- | -----: | ----: |
| Exact matches     |      4 |     4 |
| Differing values  |  9,006 | 8,769 |
| Native exceptions |      4 |     2 |
| Oracle exceptions |      4 |     4 |

All four exact matches survive. Among comparable changed outputs, 26 improve and 11 worsen; two native exceptions disappear. The complete before/after inputs and oracle outputs are identical. [Fresh delta](fresh-delta.json) retains every change, including worsened cases. Remaining native exceptions are seed 7 RIGHT/LEFT: `Incomplete hierarchical port order for g0`; real ELK succeeds. [Its worker trace](ancestor-port-worker.json) is retained for diagnosis. The four oracle exceptions are seeds 1/8 RIGHT/LEFT and remain failures.

Reproduce:

```sh
pnpm exec tsx scripts/check-compound-options-parity.ts .scratch/compound-options.json 1 20
pnpm exec vitest run --dir test test/oracle-hierarchy-fixed-sides.test.ts test/compound-options-corpus.test.ts
pnpm exec vitest run --dir test --maxWorkers=4
```

The combined gate is **632/1,280 matches**, 107,945 differing values, two native exceptions, and 217 oracle exceptions ([summary](summary.json)). The gate and strict matrix intentionally exit nonzero while parity is incomplete.

Full suite: **2,949 passed / 113 failed / 3,062 total**, with six prior failures fixed, no introduced failures, one passing input-sequence regression, and no removed tests ([file-qualified delta](suite-delta.json)). Source/repository type checks, selected lint/format checks, and package build pass. Existing mixed-export build warnings remain. The full run retains original assertions and timeouts.

Final producer review removed an invented owner size: upstream supplies none for synthesized boundary ports. The factory reads that value only for `FIXED_RATIO`, absent from the 1,280 corpus inputs. All ratio-related suites and the strict constraint matrix were then rerun: 105 passed / 14 known failures, no introduced failures ([final focused delta](constraint-final-delta.json)). Four additional implicit-ratio diagnostics throw in both engines and remain failures; their error messages differ ([diagnostic](implicit-ratio-errors.json)). These diagnostics are separate from the random gate totals.

## Next foundation gap

In seed 7, native converts `e12` from `g0:p1` to a descendant into a parent-level `g0` self-loop targeting a synthesized boundary helper. ELK gives the edge container `g0` and routes from the authored port inside that scope. The native parent port order then lacks the synthesized helper, triggering the retained assertion. [Native diagnostics and reference edge](ancestor-port-native.json) record this mismatch. Fix authored compound port reuse and edge ownership; do not skip the assertion or invent a missing parent slot. Worker observation preserves all reference fields apart from the process-specific GWT identity counter ([observer check](observer-proof.json)).
