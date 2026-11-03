import { createGraph, getDiff } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import { routingStrategies, flattenPath, getPathLength, segmentCrossesRect } from "../src/routing";
import type { Route, RoutingSettings } from "../src/routing/types";

const sourceBounds = { x: 0, y: 0, width: 60, height: 60 };
const targetBounds = { x: 340, y: 0, width: 60, height: 60 };
const diagram = () =>
  createGraph({
    id: "concerns",
    nodes: [
      { id: "a", x: 0, y: 0, width: 60, height: 60 },
      { id: "b", x: 340, y: 0, width: 60, height: 60 },
      { id: "c", x: 340, y: 200, width: 60, height: 60 },
    ],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b" },
      { id: "ac", sourceId: "a", targetId: "c" },
    ],
  });

function avoids(route: Route, bounds: { x: number; y: number; width: number; height: number }) {
  for (const section of route.sections) {
    let from = section.path.start;
    for (const segment of section.path.segments) {
      expect(segmentCrossesRect(from, segment, bounds)).toBe(false);
      from = segment.to;
    }
  }
}

function orthogonal(route: Route) {
  for (const section of route.sections) {
    let from = section.path.start;
    for (const segment of section.path.segments) {
      expect(segment.kind).toBe("line");
      expect(Math.abs(segment.to.x - from.x) < 1e-7 || Math.abs(segment.to.y - from.y) < 1e-7).toBe(
        true,
      );
      from = segment.to;
    }
  }
}

describe("independent routing concerns", () => {
  it("coordinates parallel edges without changing orthogonal geometry", () => {
    const input = diagram();
    const graph = { ...input, edges: [input.edges[0]!, { ...input.edges[0]!, id: "ab2" }] };
    const result = routingStrategies.orthogonal.route(graph, {
      coordination: { kind: "parallel" },
    });
    for (const route of result.routes.values()) orthogonal(route);
    expect(result.routes.get("ab")!.sections).not.toEqual(result.routes.get("ab2")!.sections);
  });

  it.each(["orthogonal", "polyline", "octilinear"] as const)(
    "shares a bus with %s geometry",
    (geometry) => {
      const result = routingStrategies[geometry].route(diagram(), {
        coordination: { kind: "bus" },
      });
      const trunks = [...result.routes.values()].flatMap((route) =>
        route.sections.filter((section) => section.sharedId),
      );
      expect(trunks).toHaveLength(2);
      expect(trunks[0]!.sharedId).toBe(trunks[1]!.sharedId);
      expect(trunks[0]!.path).toEqual(trunks[1]!.path);
      if (geometry === "orthogonal") result.routes.forEach(orthogonal);
    },
  );

  it("explicit independent coordination overrides the legacy bus default", () => {
    const result = routingStrategies.bus.route(diagram(), {
      coordination: { kind: "independent" },
    });
    expect(
      [...result.routes.values()]
        .flatMap((route) => route.sections)
        .every((section) => !section.sharedId),
    ).toBe(true);
  });

  it("composes a curve policy and fan coordination", () => {
    const result = routingStrategies.polyline.route(diagram(), {
      coordination: { kind: "fan" },
      policy: { curve: { kind: "bezier" } },
    });
    expect(
      [...result.routes.values()].some((route) =>
        route.sections.some((section) => section.sharedId),
      ),
    ).toBe(true);
    expect(
      [...result.routes.values()].some((route) =>
        route.sections.some((section) =>
          section.path.segments.some((segment) => segment.kind === "cubic"),
        ),
      ),
    ).toBe(true);
  });

  it("configures self-loop sides separately from geometry and coordination", () => {
    const input = diagram();
    const graph = { ...input, edges: [{ ...input.edges[0]!, id: "loop", targetId: "a" }] };
    const result = routingStrategies.orthogonal
      .route(graph, {
        coordination: { kind: "independent" },
        selfLoops: { sourceSide: "left", targetSide: "bottom", clearance: 30 },
      })
      .routes.get("loop")!;
    orthogonal(result);
    const first = result.sections[0]!.path;
    expect(first.start).toEqual({ x: 0, y: 30 });
    expect(first.segments.at(-1)!.to).toEqual({ x: 30, y: 60 });
    expect(flattenPath(first).some((point) => point.x <= -30)).toBe(true);
    expect(flattenPath(first).some((point) => point.y >= 90)).toBe(true);
    avoids(result, sourceBounds);
  });

  it.each(["parallel", "bus", "fan", "bundle"] as const)(
    "updates %s coordination to the same current geometry as fresh routing",
    (kind) => {
      const graph = diagram();
      const settings: RoutingSettings = { coordination: { kind } };
      const previous = routingStrategies.orthogonal.route(graph, settings);
      const next = {
        ...graph,
        nodes: graph.nodes.map((node) => (node.id === "b" ? { ...node, y: 70 } : node)),
      };
      const update = routingStrategies.orthogonal.update(next, previous, getDiff(graph, next));
      expect([...update.snapshot.routes]).toEqual([
        ...routingStrategies.orthogonal.route(next, settings).routes,
      ]);
    },
  );
});

describe("strategy-independent constraints", () => {
  it.each(["orthogonal", "polyline", "octilinear"] as const)(
    "honors explicit ports and foreign obstacles with %s geometry",
    (geometry) => {
      const input = diagram();
      const graph = { ...input, edges: [input.edges[0]!] };
      const barrier = { x: 150, y: 0, width: 80, height: 70 };
      const route = routingStrategies[geometry]
        .route(graph, {
          edges: {
            ab: {
              source: {
                kind: "port",
                point: { x: 40, y: 30 },
                escape: { x: 60, y: 30 },
                direction: "right",
                owner: sourceBounds,
              },
              obstacles: [barrier],
            },
          },
        })
        .routes.get("ab")!;
      expect(route.status).toBe("routed");
      expect(route.sections.length).toBeGreaterThan(0);
      expect(route.sections[0]!.path.start).toEqual({ x: 40, y: 30 });
      expect(route.sections[0]!.path.segments[0]!.to).toEqual({ x: 60, y: 30 });
      avoids(route, barrier);
      if (geometry === "orthogonal") orthogonal(route);
    },
  );

  it("honors an explicit target port and its inward lead", () => {
    const input = diagram();
    const graph = { ...input, edges: [input.edges[0]!] };
    const route = routingStrategies.orthogonal
      .route(graph, {
        edges: {
          ab: {
            target: {
              kind: "port",
              point: { x: 360, y: 30 },
              escape: { x: 340, y: 30 },
              direction: "left",
              owner: targetBounds,
            },
          },
        },
      })
      .routes.get("ab")!;
    expect(route.sections[0]!.path.segments.at(-1)!.to).toEqual({ x: 360, y: 30 });
    orthogonal(route);
  });

  it("rejects disabled parents and their label family without reconnecting children", () => {
    const input = diagram();
    const graph = {
      ...input,
      edges: input.edges.map((edge) => ({ ...edge, x: 140, y: 90, width: 70, height: 24 })),
    };
    const result = routingStrategies.orthogonal.route(graph, {
      edges: { ab: { disabled: true }, ac: { sourceLabel: "ab", obstacles: [] } },
    });
    expect(result.routes.get("ab")!.sections).toEqual([]);
    expect(result.routes.get("ac")!.sections).toEqual([]);
  });

  it("routes label-only topology without a self-loop return", () => {
    const input = diagram();
    const graph = {
      ...input,
      edges: [
        { ...input.edges[0]!, id: "notice", targetId: "a", x: 160, y: 30, width: 80, height: 30 },
      ],
    };
    const route = routingStrategies.orthogonal
      .route(graph, { edges: { notice: { topology: { kind: "label-only" } } } })
      .routes.get("notice")!;
    expect(route.status).toBe("routed");
    expect(route.sections).toHaveLength(1);
    expect(route.sections[0]!.from).toMatchObject({ kind: "node", nodeId: "a" });
    expect(route.sections[0]!.to).toEqual({ kind: "label", edgeId: "notice" });
    orthogonal(route);
  });

  it("rejects label-only topology without positioned label geometry", () => {
    const input = diagram();
    const graph = { ...input, edges: [input.edges[0]!] };
    const route = routingStrategies.orthogonal
      .route(graph, { edges: { ab: { topology: { kind: "label-only" } } } })
      .routes.get("ab")!;
    expect(route.sections).toEqual([]);
    expect(route.status).toBe("fallback");
  });

  it("trims marker gaps independently of path shape", () => {
    const input = diagram();
    const graph = { ...input, edges: [input.edges[0]!] };
    const full = routingStrategies.orthogonal.route(graph).routes.get("ab")!.sections[0]!.path;
    const route = routingStrategies.orthogonal
      .route(graph, { edges: { ab: { sourceClearance: 5, targetClearance: 10 } } })
      .routes.get("ab")!;
    expect(getPathLength(route.sections[0]!.path)).toBeCloseTo(getPathLength(full) - 15, 4);
    expect(flattenPath(route.sections[0]!.path)[0]).toEqual({
      x: full.start.x + 5,
      y: full.start.y,
    });
  });

  it("keeps explicit obstacles hard when an inherited Bézier option allows avoidance", () => {
    const input = diagram();
    const graph = { ...input, edges: [input.edges[0]!] };
    const barrier = { x: 150, y: 0, width: 80, height: 70 };
    const route = routingStrategies.orthogonal
      .route(graph, {
        bezier: { avoidObstacles: false },
        edges: { ab: { obstacles: [barrier] } },
      })
      .routes.get("ab")!;
    expect(route.sections.length).toBeGreaterThan(0);
    avoids(route, barrier);
  });

  it("uses generic guides without overriding attachment restrictions", () => {
    const input = diagram();
    const graph = {
      ...input,
      edges: [{ ...input.edges[0]!, x: 160, y: 110, width: 60, height: 30 }],
    };
    const route = routingStrategies.orthogonal
      .route(graph, {
        edges: {
          ab: {
            sourceSide: "bottom",
            labelSides: ["top", "right"],
            guides: {
              source: {
                points: [
                  { x: 30, y: 60 },
                  { x: 30, y: 90 },
                  { x: 190, y: 90 },
                  { x: 190, y: 110 },
                ],
                sourceDirection: "bottom",
                targetDirection: "top",
              },
            },
          },
        },
      })
      .routes.get("ab")!;
    expect(route.sections.length).toBe(2);
    expect(route.sections[0]!.fromSide).toBe("bottom");
    expect(route.sections[0]!.toSide).toBe("top");
    orthogonal(route);
  });
});
