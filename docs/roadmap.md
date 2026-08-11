# Roadmap

## M0: native tracer bullet

- `@statelyai/graph` input and output
- Full flat layered layout
- Replaceable layered phases
- Cycles, ports, self-loops, four directions, orthogonal routes
- Phase timings, patches, cancellation
- elkjs benchmark oracle

## M1: layered parity

- Complete: all 152 layered options map one-to-one to simplified typed names.
- Complete: long-edge, wrapping, unzipping, cycle breaking, layer assignment,
  crossing minimization, node placement, routing, labels, and ports.
- Complete: compound graphs and cross-hierarchy edges.
- Guarded by elkjs differential coverage for every option.

## Current compatibility checkpoint

- elkjs-compatible `/elkjs` entry
- 37 of 43 upstream elkjs 0.11.1 public-suite behaviors covered
- Original elkjs#7 and ChangeAwareArrayList fixtures
- Legacy option aliases, padding, fixed vectors/routes, logging, labels
- Complete layered option inventory and native compound-parent handling

## M2: interactive layout

- Previous-layout objective
- Fixed and pinned nodes
- Partial affected-subgraph layout
- Minimal-displacement constraint solving
- Expand/collapse stability
- Route-only execution
- Time budgets and useful partial results

## M3: compatibility and breadth

- elkjs constructor and JSON compatibility adapter
- Option migration with diagnostics
- Fixed plus Java-derived Box SIMPLE and seeded Random placement
- Stress, tree, radial, force, and component layout as justified by
  usage and benchmarks

## Evaluation

- ELK fixtures and differential/property tests
- Real representative Viz graphs
- Cold and warm runtime, memory, and bundle size
- Crossings, bends, area, total edge length
- Displacement and unaffected nodes moved after edits
- Constraint violations and cancellation latency
