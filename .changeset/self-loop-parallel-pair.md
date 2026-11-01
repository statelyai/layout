---
"@statelyai/layout": patch
---

Keep a node's self loop and its label outside the node when the node also has two or more labeled edges to one other node. Stacking those edges' labels moved the node onto its own loop, so the loop ran through the node and its label covered the node.
