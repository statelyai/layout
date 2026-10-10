---
"@statelyai/layout": patch
---

Orthogonal routes split to break a critical segment cycle now start on the half holding their source end, as in ELK. Upward and leftward layouts used the halves in the wrong order, so a split route turned back and ran along the edge it was split around.
