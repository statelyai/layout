---
"@statelyai/layout": patch
---

Layouts run 11–15% faster on Stately statecharts with identical output. Option parsing, node and port lookups, crossing counts and port distribution now do less repeated work and allocate fewer temporary arrays.
