# Native external-port foundation

The native external-port dummy constructor now matches the installed real ELK
factory on **1,536 seeded boundary states**: all directions, sides, port
constraints, positive/negative border offsets, default/custom anchors,
position/ratio/order metadata and port dimensions. Every output field is compared
against the unmodified worker, with its input retained in assertion diagnostics.
The input is also checked for mutation. The worker hash and source hashes are
retained in the manifest.

The compatibility adapter constructs an explicit boundary port, preserves its
external-port origin through graph conversion, and applies separate-layer
constraints. It reconnects the endpoint selected by the child router rather than
inventing a descendant midpoint. Child scopes now inherit direction; authored
child overrides still take precedence. Statechart path scoring follows the same
inheritance, with tests retaining wrong-order and explicit-override failures.

Four retained regressions, derived from seed 1 of the unchanged hierarchy corpus,
compare the chosen port relative to its descendant node in RIGHT/LEFT/DOWN/UP.
All four fail on preceding commit `2ddaa1f` and pass with this change. The distinct
RIGHT/LEFT source port remains at y=26.666… rather than the previous midpoint20;
DOWN/UP select the correct source face and x=20. These tests close that specific
endpoint-identity defect; the complete geometry gate remains unchanged.

The same 100 hierarchy inputs now have **5,176 differing values**, versus
**5,612** initially. Still **0/100 complete matches**, zero engine errors.
Adding separate-layer constraints increases the intermediate 5,169 differences
by seven; source-equivalent phase constraints are retained, rather than choosing
an approximation solely to optimize the aggregate count.

[Complete inputs, outputs and differences](./report.json),
[equal-scale native / real ELK comparison](./index.html), and
[the real worker hierarchy phase trace](./worker-phases.json) are retained.
The initial [compound baseline](../compound-baseline/README.md) remains intact.

This does not complete the hierarchy foundation: port positioning, child-to-parent
boundary geometry transfer, internal route joining, coupled crossing schedules
and replacement of the public compound solver's separate path remain required.
Component packing and post-placement repairs still produce incorrect root order
and routes. No elkjs code runs in production, and no parity assertion was weakened.

Validation: local and clean selected-source suites both report **1,891 pass /
110 fail / 2,001**, with the same existing full failure names. The clean suite
uses two workers. Its initial unconstrained snapshot run hit a worker-oracle
runtime error; the unchanged oracle case passes alone, and the complete final
snapshot suite passes that case. Initial error output is retained separately.
Source/repository TypeScript, selected lint/format and package build pass.
Remote CI is separate. The strict 100-case gate still exits 1.
