# Roadmap

## M0: native tracer bullet

- `@statelyai/graph` input and output
- Full flat layered layout
- Replaceable layered phases
- Cycles, ports, self-loops, four directions, orthogonal routes
- Phase timings, patches, cancellation
- elkjs benchmark oracle

## M1: layered parity

- Long-edge dummy nodes
- Better cycle-breaking strategies
- Network-simplex layer assignment
- Two-layer crossing minimization and constraints
- Brandes-Kopf-style node placement
- Edge labels, port ordering, parallel edges
- Compound graphs and cross-hierarchy edges

## Current compatibility checkpoint

- elkjs-compatible `/elkjs` entry
- 37 of 43 upstream elkjs 0.11.1 behaviors covered
- Original elkjs#7 and ChangeAwareArrayList fixtures
- Legacy option aliases, padding, fixed vectors/routes, logging, labels
- Compatibility-only recursive compound-parent regression handling

## M2: interactive layout

- Previous-layout objective
- Fixed and pinned nodes
- Partial affected-subgraph layout
- Minimal-displacement constraint solving
- Expand/collapse stability
- Route-only execution
- Time budgets and useful partial results

## M3: compatibility and breadth

- Package and worker entry-point compatibility for elkjs consumers
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
