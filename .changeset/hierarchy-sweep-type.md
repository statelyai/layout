---
"@statelyai/layout": patch
---

Nested compound graphs choose between sweeping a child on its own (bottom-up) and inside its parent (top-down) as ELK does. A node now counts as a path start or end by which of its port sides carry edges, not by edge direction. Edges on declared ports also start in their ports' declared order, as ELK lists ports, rather than in edge declaration order. More compound graphs now match ELK's crossing order, and some get fewer crossings.
