---
"@statelyai/layout": patch
---

Treat sub-tolerance floating-point offsets along rectangle boundaries as boundary travel during routing. Prevent ancestor-to-child routes from falling back to diagonals when content normalization differs from child coordinates by a few ulps.
