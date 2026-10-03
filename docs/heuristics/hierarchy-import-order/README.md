# Hierarchy import and boundary order

Parity remains incomplete. ELK restores FIRST/LAST nodes before splitting long
edges, imports ancestor edges before descendant-local edges, and publishes input
boundary ports in reverse layer order. Native now follows those phase orders.

The preserved 100-case hierarchy gate remains **24/100 complete matches**, with
zero engine errors and no lost matches. Differing values fall **2,596 to 2,324**;
partial differences are not a parity claim. Original inputs, failures and 5e-13
tolerance remain unchanged. Some unmatched cases have more differing values.

Seed 3's g1 child now matches complete local geometry and routes in all four
directions. Its parent placement and cross-boundary joined routes still differ;
all parent coordinates remain asserted by the complete random gate. Four new
oracle regressions protect the child phase; a fifth protects constrained-node
ordering before long-edge dummy insertion. Existing assertions are unchanged.

Full local suite: **2,069 pass / 108 fail / 2,177**, no new failure names against
468e0dd. Types, selected format/lint and package build pass. Prior ancestor label
failures remain. No broad parity or remote test success claim.

[Before/after/real ELK gallery](./index.html), [full replay](./report.json),
[worker observations](./worker-phases.json), [suite delta](./validation.json),
[source hashes](./manifest.json), [RIGHT seed 3 screenshot](./seed-3-right.png).
The gallery uses identical inputs, SVG viewBox and scale. Browser inspection
confirms the child improvement and remaining parent placement difference.
The before report is the published fixed-self-loops/compound-report.json.

Replay: `pnpm test:parity:compound` (expected failing until full parity).
Next: root placement and joined cross-boundary routing, then broader hierarchical
and flat gates. Goal active; PR #32 remains draft.
