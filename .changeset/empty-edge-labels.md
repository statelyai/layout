---
"@statelyai/layout": patch
---

Match ELK's edge-label import semantics: dimensioned labels with missing or empty text do not reserve layout space. Preserve their authored positions and dimensions in the compatibility output.
