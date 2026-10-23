---
"@statelyai/layout": patch
---

Keep statechart nodes, routes and labels from overlapping: connected-component compaction now measures every route, label and port in the mirrored UP/LEFT frame, parallel labeled edges only realign an isolated node pair, and feedback chains fall back to a fresh outer track instead of detouring through the layer.
