---
"@statelyai/layout": patch
---

Nested compound graphs with labeled edges get fewer crossings and match ELK's node orders more often:

- A center label on an edge that crosses into compounds stays on the edge's shallowest segment, as in ELK. Nested scopes no longer add label nodes of their own.
- Each edge on a portless child gets its own boundary slot, in import order. Previously all outgoing edges came before all incoming ones.
- Crossing counts follow the port order the sweep actually uses. Fixed-side ports with reversed edges were misplaced.

On the holdout, losses to real ELK drop from 87 to 17 with no new losses.
