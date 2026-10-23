---
"@statelyai/layout": patch
---

Place movable ports in the order crossing minimization chose for them, as ELK does, instead of their authored order, which crossed and overlapped transitions on fixed-side and free-port states. With model order, order north/south port dummies from the sorted port list and keep separate-layer nodes in place during forced model-order sorting, as ELK does. Parallel labeled transitions no longer move their states onto others in the same layer.
