# Compaction retraces

The post-compaction fallback ([compaction node hits](../quality-compaction-node-hits/README.md)) also catches routes that compaction folds back onto themselves. Flat seed 37 RIGHT with LEFT compaction: compaction moves `e22`'s channel onto its first segment, a 278 px retrace in both engines. The facade now counts pairs of one route's segments overlapping along a line, together with node hits, and keeps the uncompacted layout when it has fewer of these defects.

|                             | Corpus (1,280) | Holdout (2,800) |
| --------------------------- | -------------- | --------------- |
| LOSS                        | 72 → 72        | 276 → 275       |
| Native hard-violation cases | 2 → 1          | 38 → 30         |
| WIN/TIE → LOSS              | 0              | 0               |
| New hard violations         | 0              | 0               |

Gate elapsed: 243 s corpus, 417 s holdout. The conflicting exact-geometry oracle tests are unchanged.
