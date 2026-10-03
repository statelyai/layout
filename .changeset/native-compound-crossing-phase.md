---
"@statelyai/layout": patch
---

Coordinate native compatibility hierarchy crossing sweeps before placement,
refresh parent dimensions and ports from finished children, and preserve the
selected port order through routing. Align NetworkSimplex traversal with port
order and correct Brandes-Koepf alignment for parallel edges and a shared physical
port. Preserve fixed anchors on mixed explicit/implicit self-loops, their occupied
sides and endpoint ownership when deriving bounds and junctions. Restore constrained nodes before long-edge splitting, preserve ancestor-first
implicit port creation, and publish clockwise input boundary port order. Native
hierarchical layout and routing parity remains incomplete. Select BK straightening
edges through physical port order and apply ELK spacing to tagged external
boundary dummies.
