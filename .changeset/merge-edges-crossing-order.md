---
"@statelyai/layout": patch
---

Graphs with `elk.layered.mergeEdges` keep the crossing-minimized order of long edges. Every long-edge dummy used to move ahead of the real nodes in its layer after crossing minimization, which crossed long edges over the rest of the graph. On the new mergeEdges quality corpus this cuts crossings from 10,682 to 1,946 (real ELK: 1,508), and removes all 56 cases with node hits or opposite-direction tracks. Opposite-direction separation can also slide a portless edge end along its node side when the end segment is too short for a jog.
