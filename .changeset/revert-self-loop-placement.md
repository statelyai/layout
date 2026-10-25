---
"@statelyai/layout": patch
---

Restore 0.5.0 self-loop placement. 0.5.1 and 0.5.2 placed self loops on loop-only ports and their labels beside the node as ELK does (west in DOWN and UP layouts); the Stately editor draws loops through the label position and reads better with loops and labels stacked above the state.
