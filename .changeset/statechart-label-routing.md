---
"@statelyai/layout": patch
---

Fix two statechart routing defects: antiparallel labeled pairs in UP and LEFT layouts no longer bend the forward edge into a diagonal through the other label, and labeled feedback edges no longer retrace their label's layer. A pair or feedback chain whose new route would still come out diagonal keeps its former routing.
