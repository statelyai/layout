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
ROUTING_BASELINE_REVISION=741ab54 pnpm routing:quality .scratch/routing-quality-pass/baseline /path/to/baseline/dist/routing/index.mjs
pnpm routing:quality .scratch/routing-quality-pass/after
ROUTING_STORYBOOK_URL=http://127.0.0.1:6018 node scripts/verify-routing-quality.mjs
pnpm exec tsx scripts/render-authoring-routing-quality.mjs .scratch/routing-quality-pass/authoring /path/to/baseline/dist/index.mjs
```

The browser verifier requires Playwright. Set `ROUTING_BROWSER_MODULE` when its
module is installed outside this package. The verifier checks input equality,
captures all 46 pairs, loads the 48 React stories, and exercises dragging,
reset, passive label movement, policy controls, and incremental obstacle edits.

The quality pass evaluates complete rendered routes, including joins, terminal
room, labels, duplicate branches, loops, and constraint diagnostics. Passing
geometry tests alone does not establish visual quality or yEd parity.

## Final result

The independent [visual review](visual-review.md) accepts all 46 native cases at
`fc1baa8`. Forty-two pass directly. Four retain a requested zigzag, crossing,
straight fallback, or crossing-avoidance detour. No reviewed avoidable artifact
remains. The five [authoring cases](authoring/summary.json) include four routing
comparisons and one placement-only nested leaf.

The fixes remove synthetic curve lobes and source hooks, preserve smooth joins,
give returns and loops usable room, round terminal corners, and separate
duplicate branches. Inferred Catmull–Rom guides use the internal obstacle
corridor. Organic smoothing respects shoulder reservations and authored knots.
Required monotonicity constrains search directions before final curve checks.
Clean requested curves take precedence over repair candidates.

The [verification record](verification.json) separates rendered review, browser
interactions, library tests, generated corpus, independent source review, and
packed-consumer checks. The [comparison gallery](comparison/index.html) contains
all matched vectors. Original and current geometry are retained in
[baseline-routes.json](baseline-routes.json) and [after-routes.json](after-routes.json).

## Comparison sheets

<!-- comparison sheets derived from scripts/render-routing-quality.ts fixture order -->

| Sheet                              | Cases                                                        |
| ---------------------------------- | ------------------------------------------------------------ |
| [Sheet 1](comparison/page-1.png)   | midpoint, tangents, label-tangents                           |
| [Sheet 2](comparison/page-2.png)   | obstacles, catmull-rom, rounded                              |
| [Sheet 3](comparison/page-3.png)   | crossings, monotonic, bundle                                 |
| [Sheet 4](comparison/page-4.png)   | label-follow, label-fixed, label-through                     |
| [Sheet 5](comparison/page-5.png)   | label-gap, automatic-ports, fixed-ports                      |
| [Sheet 6](comparison/page-6.png)   | opposing-faces, same-face-loops, tight-corridor              |
| [Sheet 7](comparison/page-7.png)   | multiple-obstacles, parallel-branches, shared-bundle         |
| [Sheet 8](comparison/page-8.png)   | reversed-edges, incremental-moves, high-curvature-obstacle   |
| [Sheet 9](comparison/page-9.png)   | restricted-label-sides, catmull-fixed-ports, dense-same-face |
| [Sheet 10](comparison/page-10.png) | loop-near-obstacle, strategy-straight, strategy-bezier       |
| [Sheet 11](comparison/page-11.png) | strategy-orthogonal, strategy-polyline, strategy-octilinear  |
| [Sheet 12](comparison/page-12.png) | strategy-curved, strategy-organic, strategy-parallel         |
| [Sheet 13](comparison/page-13.png) | strategy-self-loop, strategy-fan, strategy-bus               |
| [Sheet 14](comparison/page-14.png) | strategy-bundle, coordination-0, coordination-800            |
| [Sheet 15](comparison/page-15.png) | curve-polyline, curve-bezier, curve-catmull-rom              |
| [Sheet 16](comparison/page-16.png) | curve-rounded-orthogonal                                     |
