---
"@statelyai/layout": patch
---

With `elk.layered.mergeEdges`, edges in opposite directions no longer share a track where they meet at one node. Portless edges that attach at the same point of a node side now give each direction its own attachment, so an edge and a reversed edge between the same two nodes run on parallel lines instead of one.
