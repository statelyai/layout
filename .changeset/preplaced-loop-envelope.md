---
"@statelyai/layout": patch
---

Avoid reserving east self-loop space twice when node placement has already included the loop envelope. This keeps hierarchy boundary helpers and their routes in the positions chosen by layout.
