---
"@statelyai/layout": patch
---

Route self loops on loop-only ports like ELK when port constraints are free or undefined. As ELK does, the layout hides those ports, puts the loop on the side the self-loop distribution picks, and puts the ports back at the loop's ends. The label sits beside the loop and is centered on the node, even when the label is inline. In DOWN and UP layouts, this moves Stately editor self loops and their labels to the west side, out of the incoming edges' channel. Loop slots now also follow ELK: they start past any protruding ports and are spaced by `spacing.edgeEdge`.
