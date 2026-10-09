---
"@statelyai/layout": patch
---

- Graphs with ports that carry edges in both directions are also laid out without the mixed-port crossing model (two ports per mixed port, neighbours grouped by direction), and the elkjs facade keeps the better result. The model helps on average but steered some graphs into far worse orders (for example 57 → 115 crossings); those return to their earlier counts while opposite-direction edges still never share a track. Such graphs take about one more layout.
- Candidate layouts are compared with crossings counted as the quality gate counts them: crossings on a shared endpoint's clearance border or under an edge's own label do not count, and two routes crossing at one point cross once.
- Faster layouts with identical output: the default compound layout measures only defects, and sweep edges, swept port positions and route bounds are indexed.
