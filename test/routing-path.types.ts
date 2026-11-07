import type { RoutingPathOptions, RoutingPolicy, EdgeRoutingSettings } from "../src/routing";
import { routeEdges } from "../src/routing";
import { createGraph } from "@statelyai/graph";

const valid = [
  { kind: "polyline", geometry: "orthogonal" },
  { kind: "polyline", geometry: "octilinear" },
  { kind: "rounded-orthogonal", radius: 10, minRadius: 2, maxRadius: 16 },
  { kind: "bezier", curvature: 0.5 },
  { kind: "catmull-rom" },
] satisfies RoutingPathOptions[];
void valid;
function acceptsPath(_path: RoutingPathOptions) {}
// @ts-expect-error Rounded paths own their orthogonal geometry.
acceptsPath({ kind: "rounded-orthogonal", geometry: "polyline" });
// @ts-expect-error Bezier chooses its own guide rather than promising an orthogonal path.
acceptsPath({ kind: "bezier", geometry: "orthogonal" });
// @ts-expect-error Catmull-Rom does not expose an independent segment geometry.
acceptsPath({ kind: "catmull-rom", geometry: "straight" });
// @ts-expect-error Corner radii belong only to rounded orthogonal paths.
acceptsPath({ kind: "polyline", geometry: "orthogonal", radius: 10 });
// @ts-expect-error Curvature belongs only to Bezier.
acceptsPath({ kind: "rounded-orthogonal", curvature: 0.5 });
const invalidVariable = { kind: "bezier", geometry: "orthogonal" } as const;
// @ts-expect-error Invalid combinations are rejected through variables too.
acceptsPath(invalidVariable);
// @ts-expect-error The former curve/geometry bag is no longer an API.
const oldPolicy: RoutingPolicy = { curve: { kind: "bezier" } };
// @ts-expect-error Geometry is part of a polyline path, not an independent edge override.
const oldEdge: EdgeRoutingSettings = { geometry: "polyline" };
routeEdges({
  graph: createGraph({ nodes: [], edges: [] }),
  // @ts-expect-error Geometry is owned by the path variant.
  geometry: "polyline",
  settings: { policy: { path: { kind: "rounded-orthogonal" } } },
});
void oldPolicy;
void oldEdge;
