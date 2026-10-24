---
"@statelyai/layout": patch
---

Remove edge-label hits, node hits and opposite-direction track sharing from large Stately editor statecharts:

- A feedback edge's leg to the outer feedback track now steps past any node it would cut through, such as a taller compound sibling in the same layer.
- When a compound sets its own `elk.direction`, its boundary ports keep the side its nested layout routed to. Before, the parent could flip such a port to the opposite side, and the edge then ran back through the compound's children.
- A self-loop label that ELK would center on its node, where the legs of the loops stacked outside it cross it, now sits just before those legs in the flow. The node reserves that space.
- Straightened feedback chains no longer pass through the space a node reserves for its self loops and their labels.
