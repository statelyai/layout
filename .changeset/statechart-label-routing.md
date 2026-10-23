---
"@statelyai/layout": patch
---

Fix two statechart routing defects: antiparallel labeled pairs in UP and LEFT layouts no longer bend the forward edge into a diagonal through the other label, and labeled feedback edges no longer retrace their label's layer. If a pair or feedback chain still comes out diagonal, the layout is retried with its former routing, and the retry is kept only when it has fewer diagonals overall.
