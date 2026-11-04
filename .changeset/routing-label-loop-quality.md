---
"@statelyai/layout": patch
---

Route fixed labels using label-facing node attachments and coherent label entry/exit faces. Align labeled self-loop stems, shorten opposing leads in narrow gaps, and reject self-crossing label legs independently of penalties for other edges.

Add a gap-label side-midpoint attachment constraint, preserved across incremental updates, layout hints, and conditional label chains. Retry blocked Catmull–Rom fits with padded guides before returning an orthogonal fallback.
