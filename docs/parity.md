# Parity

Parity is tracked at three separate levels. Passing API tests does not imply
that native geometry matches ELK.

## elkjs 0.11.1 public suite

<!-- compatibility status derived from test/elkjs-compat and the elkjs 0.11.1 Mocha suite -->

| Upstream test                 | Behaviors | Covered | Status                             |
| ----------------------------- | --------: | ------: | ---------------------------------- |
| `test-bug-63.js`              |         1 |       1 | Passing                            |
| `test-bug-7.js`               |         1 |       1 | Original fixture passing           |
| `test-bug-8.js`               |         4 |       4 | Passing                            |
| `test-bug-klay-22.js`         |         1 |       1 | Passing                            |
| `test-bug-klay-23.js`         |         1 |       1 | Passing                            |
| `test-node.js`                |         2 |       1 | In-process passing; worker pending |
| `testChangeAwareArrayList.js` |         1 |       1 | Original fixture passing           |
| `testEntryPoints.js`          |         5 |       0 | Package/worker variants pending    |
| `testIds.js`                  |         7 |       7 | Passing                            |
| `testLayouters.js`            |         3 |       3 | Passing baseline behavior          |
| `testLogging.js`              |         6 |       6 | Passing                            |
| `testOptions.js`              |         8 |       8 | Passing                            |
| `testParameters.js`           |         2 |       2 | Passing                            |
| `testRaiseException.js`       |         1 |       1 | Passing                            |
| **Total**                     |    **43** |  **37** | **86% behavior coverage**          |

The upstream suite has 43 `it(...)` cases at tag 0.11.1. Some adapted Vitest
tests combine related assertions while preserving all listed behaviors.

## Native algorithm status

<!-- registered native algorithms from src/layout.ts -->

| Algorithm             | Native API                     | Current fidelity                                      |
| --------------------- | ------------------------------ | ----------------------------------------------------- |
| Box                   | `getBoxLayout`                 | Java SIMPLE node placement; grouped modes pending     |
| Layered               | `getLayeredLayout`             | Initial flat Sugiyama-style pipeline; not Java parity |
| Fixed                 | `getFixedLayout`               | Preserves authored geometry and routes                |
| Random                | `getRandomLayout`              | Seeded Java-exact nodes; edge-route parity pending    |
| Rectangle packing     | `getRectanglePackingLayout`    | Deterministic shelf baseline; not ELK parity          |
| SPOrE compaction      | `getSporeCompactionLayout`     | Initial relative-direction baseline; not ELK parity   |
| SPOrE overlap removal | `getSporeOverlapRemovalLayout` | Initial separation baseline; not ELK parity           |

The compatibility adapter recursively handles the upstream compound-parent
regression. Native compound layout, cross-hierarchy routing, worker execution,
and the Java algorithm suites remain open.

## Visual corpus

<!-- representative graph count and engines from demo/scenarios.ts -->

The SDK project-view corpus contains 14 pre-laid graphs across the 11 layout
families available in elkjs 0.11.1. Nine currently run through native
TypeScript; five remain elkjs oracle snapshots (`stress`, `mrtree`, `radial`,
`force`, and compound layered). Corpus generation is offline, so the browser
bundle contains the resulting Stately graphs but not elkjs.

## Definition of full parity

1. All applicable elkjs public behaviors pass through the compatibility entry.
2. Relevant ELK Java fixtures and invariants are ported with provenance.
3. Algorithm phase choices and typed options match supported ELK behavior.
4. Geometry is differential-tested with documented exact/tolerance rules.
5. Native-only partial, incremental, and route-only behaviors have independent
   property and benchmark coverage.
