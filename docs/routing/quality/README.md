# Routing visual quality review

This review covers native routing policies and gallery examples on identical
before and after inputs. The baseline is `741ab54`. The packed baseline routing
source matches that revision. The review includes nine original policy cases,
nineteen stress and regression cases, twelve strategies, two crossing-cost
settings, and four curve families on the same obstacle graph.

The original 45 ELK Live demo examples use the elkjs oracle. They are outside
this native routing comparison. The separate partial authoring router has five
additional matched cases, including a placement-only nested leaf.

## Review the geometry

Run `pnpm storybook`. Open **Routing / Quality / Full gallery** and
**Strategy gallery**. Every individual case also has a named story. Drag nodes,
move obstacles, reset, and change policies to inspect incremental behavior.
Comparisons share a view box that includes complete paths and label bounds.

The retained comparisons use the same graph, settings, direction, and view box
within each before and after pair. Chromium captures at device scale 1.
Straight routes that cross an obstacle retain explicit fallback diagnostics.
Authored Catmull–Rom waypoints retain their zigzag. High crossing costs can
produce a long detour. These outcomes are reviewed against their requested
constraints.

## Regenerate the comparison

Create a package from the baseline revision in a dedicated checkout. Extract it
without changing the current source checkout. Pass its compiled routing module
to the first command.

```sh
pnpm routing:quality .scratch/routing-quality-pass/baseline /path/to/baseline/dist/routing/index.mjs
pnpm routing:quality .scratch/routing-quality-pass/after
ROUTING_STORYBOOK_URL=http://127.0.0.1:6018 node scripts/verify-routing-quality.mjs
```

The browser verifier requires Playwright. Set `ROUTING_BROWSER_MODULE` when its
module is installed outside this package. The verifier checks input equality,
captures all 46 pairs, loads the 48 React stories, and exercises dragging,
reset, passive label movement, policy controls, and incremental obstacle edits.

The quality pass evaluates complete rendered routes, including joins, terminal
room, labels, duplicate branches, loops, and constraint diagnostics. Passing
geometry tests alone does not establish visual quality or yEd parity.
