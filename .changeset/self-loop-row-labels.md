---
"@statelyai/layout": patch
---

Keep edge labels in their row when a self loop above a node makes room. In RIGHT and LEFT layouts, a label taller than its row's nodes was left behind when the row moved down, so edges into a node with a labeled self loop detoured through the loop's label.
