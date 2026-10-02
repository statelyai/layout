---
"@statelyai/layout": patch
---

Repair native layered edge routing through nodes, misplaced compound ports,
parent/child return connections, and retraced label/self-loop sections. Preserve
feasible orthogonal paths when preferred clearances or soft route reservations
cannot be satisfied, while retaining bounded search and conflict diagnostics.

Repair label-only collisions, reserve port exit corridors, orient same-port loops
outward, and prevent terminal retracing in narrow or fractional-coordinate gaps.
