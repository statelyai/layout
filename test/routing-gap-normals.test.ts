import { createGraph, getDiff } from "@statelyai/graph";
import { describe, expect, it } from "vitest";
import { bezierRouting, type RouteBounds, type RoutingSettings } from "../src/routing";
import { pathEndpointTangent } from "../src/routing/policy-geometry";

const turns = [
  {
    name: "original",
    rect: (r: RouteBounds) => r,
    sides: ["top", "right"] as const,
    entry: { x: 0, y: 1 },
    exit: { x: 1, y: 0 },
  },
  {
    name: "mirrored",
    rect: (r: RouteBounds) => ({ ...r, x: 540 - r.x - r.width }),
    sides: ["top", "left"] as const,
    entry: { x: 0, y: 1 },
    exit: { x: -1, y: 0 },
  },
  {
    name: "rotated",
    rect: (r: RouteBounds) => ({
      x: 500 - r.y - r.height,
      y: r.x,
      width: r.height,
      height: r.width,
    }),
    sides: ["right", "bottom"] as const,
    entry: { x: -1, y: 0 },
    exit: { x: 0, y: 1 },
  },
];

describe("independent gap border normals", () => {
  it.each(turns)("keeps allowed adjacent faces when $name", ({ rect, sides, entry, exit }) => {
    const graph = createGraph({
      id: "gap-normals",
      nodes: [
        { id: "a", ...rect({ x: 35, y: 65, width: 64, height: 44 }) },
        { id: "b", ...rect({ x: 435, y: 220, width: 64, height: 44 }) },
      ],
      edges: [
        {
          id: "edge",
          sourceId: "a",
          targetId: "b",
          ...rect({ x: 195, y: 255, width: 90, height: 30 }),
        },
      ],
    });
    const settings: RoutingSettings = {
      policy: {
        curve: { kind: "bezier" },
        label: { kind: "gap", tangent: { kind: "border-normal" } },
        sourceTangent: { kind: "border-normal" },
        targetTangent: { kind: "border-normal" },
        stability: { kind: "preserve-valid" },
      },
      edges: { edge: { labelSides: sides } },
    };
    const first = bezierRouting.route(graph, settings);
    const route = first.routes.get("edge")!;
    expect(route.status).toBe("routed");
    expect(route.sections).toHaveLength(2);
    expect(route.sections[0]!.toSide).toBe(sides[0]);
    expect(route.sections[1]!.fromSide).toBe(sides[1]);
    expect(pathEndpointTangent(route.sections[0]!.path, "end")).toEqual(entry);
    expect(pathEndpointTangent(route.sections[1]!.path, "start")).toEqual(exit);
    const updated = bezierRouting
      .update(graph, first, getDiff(graph, graph), {
        ...settings,
        policy: { ...settings.policy, collisions: { crossingPenalty: 100 } },
      })
      .snapshot.routes.get("edge")!;
    expect(updated.status).toBe("routed");
    expect(updated.sections).toEqual(route.sections);
  });
});
