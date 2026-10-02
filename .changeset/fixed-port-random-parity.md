---
"@statelyai/layout": patch
---

Respect fixed-position port order and preserve seeded random state between cycle breaking and crossing minimization, route long orthogonal paths with a Manhattan A* heuristic, fit retry leads into subpixel corridors, preserve spacing around unrelated nodes during port-side alignment, and repair label intersections and retraced flat routes.

Process layer and whole-node feedback constraints before cycle breaking, preserve implicit fixed endpoint sides through reversal, and reserve the final endpoint approach while routing a labeled edge's first leg.

Preserve initial fixed implicit endpoint faces during flat routing repair, including corner attachments.

Preserve fixed implicit endpoint coordinates during repair without exposing synthetic ports, and prevent route search from retracing its own terminal leads.
