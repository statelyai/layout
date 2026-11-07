---
"@statelyai/layout": minor
---

Replace independent geometry and curve options with RoutingPolicy.path, a RoutingPathOptions discriminated union. Only polyline paths accept segment geometry; rounded orthogonal paths own their geometry and bounds, while Bezier and Catmull-Rom own guide selection. Reject irrelevant path options at runtime and compile time.

Keep runtime validation consistent with optional undefined fields, and update snapshot strategy and refinement when a global path choice changes geometry.
