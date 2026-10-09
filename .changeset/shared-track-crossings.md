---
"@statelyai/layout": patch
---

- Count crossings closer to how edges are routed. Crossing minimization counts a hyperedge between layers as one shared track, as ELK does. When a hyperedge joins two or more ports on each side, its edges would run opposite ways along that track, which routing never allows, so they take separate tracks and cross where the count saw none. The elkjs facade now also lays out graphs with such hyperedges counting them edge by edge, and keeps the better result. Corpus crossings drop below real ELK (13,924 vs 14,110) with no graph getting more crossings. Such graphs take one more layout.
