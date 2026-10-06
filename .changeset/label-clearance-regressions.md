---
"@statelyai/layout": patch
---

Fix layout regressions found against the previous release:

- HEAD and TAIL edge labels no longer cover nodes, other labels or routes; they move beside their route near their endpoint.
- A nested graph's own `elk.direction` wins over its parent's.
- Free ports on reversed edges no longer reserve margin on the wrong side.
- MODEL_ORDER cycle breaking orders layer-constrained boundary nodes first or last, so routes inside compounds stop detouring.
- Fixed-side self-loops on zero-size ports take their own slot instead of landing on a sibling port.
- Free ports are ordered with elkjs's exact sort, so tied ports and center labels no longer swap; the Viz two-state cycle matches ELK again.
- Routes of labeled and long edges follow their endpoints when post-compaction moves nodes.
