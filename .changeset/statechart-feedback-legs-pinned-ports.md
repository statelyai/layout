---
"@statelyai/layout": patch
---

Remove node hits, edge-label hits and opposite-direction track sharing from large Stately editor statecharts:

- A feedback edge's leg to the outer feedback track now steps past any node it would cut through, such as a taller compound sibling in the same layer.
- When a compound sets its own `elk.direction`, its boundary ports keep the side its nested layout routed to. Before, the parent could flip such a port to the opposite side, and the edge then ran back through the compound's children.
