---
"@statelyai/layout": patch
---

Lay out the same graph the same way when measured sizes carry float noise. The elkjs entry snaps node, port and label sizes to 1/64px before layout; integer and other on-grid sizes are unchanged.
