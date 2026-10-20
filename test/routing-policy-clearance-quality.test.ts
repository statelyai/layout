import { createGraph, getDiff } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import {
  bezierRouting,
  type Route,
  type RouteBounds,
  type RoutePoint,
  type RoutingSettings,
} from "../src/routing";
import { distance, flattenPath, segmentCrossesRect } from "../src/routing/path";
import { pathEndpointTangent, pathReverseTravel } from "../src/routing/policy-geometry";
import { inflate } from "../src/routing/spatial";

const settings: RoutingSettings = {
  policy: {
    curve: { kind: "bezier" },
    label: { kind: "follow" },
    collisions: { nodes: "avoid", labels: "avoid" },
  },
};
const transforms = [
  {
    name: "original",
    point: ({ x, y }: RoutePoint) => ({ x, y }),
    inverse: ({ x, y }: RoutePoint) => ({ x, y }),
  },
  {
    name: "reflected",
    point: ({ x, y }: RoutePoint) => ({ x: -x, y }),
    inverse: ({ x, y }: RoutePoint) => ({ x: -x, y }),
  },
  {
    name: "rotated 90 degrees",
    point: ({ x, y }: RoutePoint) => ({ x: -y, y: x }),
    inverse: ({ x, y }: RoutePoint) => ({ x: y, y: -x }),
  },
  {
    name: "rotated 180 degrees",
    point: ({ x, y }: RoutePoint) => ({ x: -x, y: -y }),
    inverse: ({ x, y }: RoutePoint) => ({ x: -x, y: -y }),
  },
];
function transformBounds(
  bounds: RouteBounds,
  transform: (point: RoutePoint) => RoutePoint,
): RouteBounds {
  const a = transform(bounds),
    b = transform({ x: bounds.x + bounds.width, y: bounds.y + bounds.height });
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}
function fixtureNodes(transform = transforms[0]!) {
  return [
    { id: "a", x: 35, y: 65, width: 64, height: 44 },
    { id: "b", x: 435, y: 220, width: 64, height: 44 },
    { id: "obstacle", x: 245, y: 110, width: 80, height: 125 },
  ].map((node) => ({ id: node.id, ...transformBounds(node, transform.point) }));
}
function fixture(transform = transforms[0]!) {
  return createGraph({
    id: "clearance-quality",
    nodes: fixtureNodes(transform),
    edges: [
      {
        id: "edge",
        sourceId: "a",
        targetId: "b",
        ...transformBounds({ x: 195, y: 255, width: 90, height: 30 }, transform.point),
      },
    ],
  });
}
function expectClear(route: Route, nodes: readonly (RouteBounds & { id: string })[]) {
  for (const section of route.sections) {
    let from = section.path.start;
    for (const segment of section.path.segments) {
      for (const node of nodes)
        expect(
          segmentCrossesRect(from, segment, node.id === "obstacle" ? inflate(node, 8) : node),
        ).toBe(false);
      from = segment.to;
    }
  }
}
function overlap(a: RouteBounds, b: RouteBounds) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("policy Bézier clearance quality", () => {
  it.each(transforms)(
    "keeps $name obstacle guides compact and following labels clear",
    (transform) => {
      const graph = fixture(transform);
      const result = bezierRouting.route(graph, settings).routes.get("edge")!;
      expect(result.status).toBe("routed");
      expect(result.sections).toHaveLength(1);
      const path = result.sections[0]!.path;
      expect(path.segments.every((segment) => segment.kind === "cubic")).toBe(true);
      const points = flattenPath(path, { tolerance: 0.002 }).map(transform.inverse);
      const length = points
        .slice(1)
        .reduce((sum, point, index) => sum + distance(points[index]!, point), 0);
      expect(length).toBeLessThan(460);
      const canonicalPath = {
        start: points[0]!,
        segments: points.slice(1).map((to) => ({ kind: "line" as const, to })),
      };
      expect(pathReverseTravel(canonicalPath, "x", points[0]!, points.at(-1)!)).toBeLessThan(1);
      expect(pathReverseTravel(canonicalPath, "y", points[0]!, points.at(-1)!)).toBeLessThan(20);
      expectClear(result, fixtureNodes(transform));
      expect(result.label).toBeDefined();
      for (const node of fixtureNodes(transform))
        expect(overlap(result.label!.bounds, node)).toBe(false);
    },
  );

  it("preserves mandatory waypoints and explicit terminal directions", () => {
    const graph = fixture();
    const waypoint = { x: 333, y: 85 };
    const result = bezierRouting
      .route(graph, {
        ...settings,
        policy: {
          ...settings.policy,
          sourceTangent: { kind: "border-normal" },
          targetTangent: { kind: "border-normal" },
        },
        edges: { edge: { waypoints: [waypoint] } },
      })
      .routes.get("edge")!;
    expect(result.status).toBe("routed");
    const path = result.sections[0]!.path;
    expect([path.start, ...path.segments.map((segment) => segment.to)]).toContainEqual(waypoint);
    expect(pathEndpointTangent(path, "start")).toEqual({ x: 1, y: 0 });
    expect(pathEndpointTangent(path, "end")).toEqual({ x: 1, y: 0 });
    expectClear(result, fixtureNodes());
  });

  it("matches canonical fresh routing after an obstacle moves into the compact guide", () => {
    const graph = fixture();
    const initial = bezierRouting.route(graph, settings);
    const movedNodes = fixtureNodes().map((node) =>
      node.id === "obstacle" ? { ...node, x: 275, y: 60 } : node,
    );
    const moved = createGraph({ ...graph, nodes: movedNodes });
    const updated = bezierRouting.update(moved, initial, getDiff(graph, moved)).snapshot;
    const fresh = bezierRouting.route(moved, settings);
    expect(updated.routes.get("edge")).toEqual(fresh.routes.get("edge"));
    expect(updated.routes.get("edge")!.sections).not.toEqual(initial.routes.get("edge")!.sections);
    expectClear(updated.routes.get("edge")!, movedNodes);
  });
});
