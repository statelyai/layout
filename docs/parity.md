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

| Algorithm             | Native API                     | Current fidelity                                     |
| --------------------- | ------------------------------ | ---------------------------------------------------- |
| Box                   | `getBoxLayout`                 | Java SIMPLE node placement; grouped modes pending    |
| Layered               | `getLayeredLayout`             | Complete 152-option ELK 0.11.1 layered parity target |
| Fixed                 | `getFixedLayout`               | Preserves authored geometry and routes               |
| Random                | `getRandomLayout`              | Seeded Java-exact nodes; edge-route parity pending   |
| Rectangle packing     | `getRectanglePackingLayout`    | Deterministic shelf baseline; not ELK parity         |
| SPOrE compaction      | `getSporeCompactionLayout`     | Initial relative-direction baseline; not ELK parity  |
| SPOrE overlap removal | `getSporeOverlapRemovalLayout` | Initial separation baseline; not ELK parity          |

The native layered pipeline handles compound layout and cross-hierarchy
routing. Worker execution and non-layered Java algorithm suites remain open.

## Layered option and geometry coverage

<!-- layered option inventory from src/layered/elk-options.generated.ts -->

- 152 of 152 elkjs 0.11.1 layered options have unique simplified typed names.
- Every mapping is checked against `knownLayoutAlgorithms()` and round-tripped.
- Every option has an enforced elkjs differential-test reference, including
  parameterized enum, boolean, numeric, object, node, edge, port, and label
  cases.
- The exhaustive target/value matrix contains 394 cases. Four ELK
  `OBJECT`-typed properties rejected by the elkjs importer are instead guarded
  by source-derived behavior tests.
- Geometry comparisons cover bounds, nodes, ports, labels, edge endpoints, bend
  counts, and bend coordinates. Floating-point comparisons use 12 decimal
  digits where operation order can differ.
- Java-derived phases retain EPL-2.0 headers and are tested against the elkjs
  0.11.1 oracle.

## Visual corpus

<!-- ELK Live example count and source from demo/generated/elk-live-examples.json -->

The two-renderer corpus contains the same 45 categorized examples as ELK Live,
pinned from `eclipse/elk-models` and pre-laid out with the elkjs oracle. Its SVG
geometry layer exposes exact bounds, label rectangles, route points, and ports;
its SDK project-view layer exercises the same graph as a Viz consumer. Normal
corpus generation is offline, so the browser bundle contains the resulting
Stately graphs but not elkjs. `pnpm demo:sync` explicitly refreshes the upstream
catalog and converted ELK JSON inputs.

## Definition of full parity

1. All applicable elkjs public behaviors pass through the compatibility entry.
2. Relevant ELK Java fixtures and invariants are ported with provenance.
3. Algorithm phase choices and typed options match supported ELK behavior.
4. Geometry is differential-tested with documented exact/tolerance rules.
5. Native-only partial, incremental, and route-only behaviors have independent
   property and benchmark coverage.
