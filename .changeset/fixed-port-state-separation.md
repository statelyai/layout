---
"@statelyai/layout": patch
---

Preserve node separation for fixed-port fan-out and remove cycles reintroduced by port preferences. Preserve inline-label space during compaction and use the reserved inter-rank interval when no dedicated label layer exists. Reserve labeled self-loop clearance on all assigned sides, preserve loop tracks through compaction and hierarchy restoration, and honor normalized edge/label option inheritance. Allow FIRST/FIRST_SEPARATE nodes to have self-loops. Includes minimal anonymous graph regressions in all four directions and captured integration fixtures.
