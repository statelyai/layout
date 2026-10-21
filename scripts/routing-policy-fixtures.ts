import { createGraph } from "@statelyai/graph";
import type { RouteStyle, RoutingGraph, RoutingSettings } from "../src/routing";

export interface RoutingPolicyFixture {
  readonly id: string;
  readonly title: string;
  readonly graph: RoutingGraph;
  readonly strategy: RouteStyle;
  readonly before: RoutingSettings;
}

const node = (id: string, x: number, y: number) => ({ id, x, y, width: 64, height: 44 });
const edge = { id: "edge", sourceId: "a", targetId: "b" };
const single = (id: string, label = false, obstacle = false) =>
  createGraph({
    id,
    nodes: [
      node("a", 35, 65),
      node("b", 435, 220),
      ...(obstacle ? [{ id: "obstacle", x: 245, y: 110, width: 80, height: 125 }] : []),
    ],
    edges: [{ ...edge, ...(label ? { x: 195, y: 255, width: 90, height: 30 } : {}) }],
  });

export const routingPolicyFixtures: readonly RoutingPolicyFixture[] = [
  {
    id: "midpoint",
    title: "Label follows the curve",
    graph: single("midpoint", true),
    strategy: "bezier",
    before: {},
  },
  {
    id: "tangents",
    title: "Independent endpoint tangents",
    graph: single("tangents"),
    strategy: "bezier",
    before: {},
  },
  {
    id: "label-tangents",
    title: "Perpendicular label attachments",
    graph: single("label-tangents", true),
    strategy: "bezier",
    before: { bezier: { attachmentMode: "floating" } },
  },
  {
    id: "obstacles",
    title: "Curve clearance around obstacles",
    graph: single("obstacles", true, true),
    strategy: "bezier",
    before: { bezier: {} },
  },
  {
    id: "catmull-rom",
    title: "Centripetal Catmull–Rom waypoints",
    graph: single("catmull-rom"),
    strategy: "polyline",
    before: {
      edges: {
        edge: {
          waypoints: [
            { x: 175, y: 205 },
            { x: 280, y: 65 },
            { x: 365, y: 190 },
          ],
        },
      },
    },
  },
  {
    id: "rounded",
    title: "Rounded orthogonal corridors",
    graph: single("rounded", false, true),
    strategy: "orthogonal",
    before: {},
  },
  {
    id: "crossings",
    title: "Final geometry crossing preferences",
    graph: createGraph({
      id: "crossings",
      nodes: [node("a", 35, 60), node("b", 435, 220), node("c", 35, 220), node("d", 435, 60)],
      edges: [edge, { id: "second", sourceId: "c", targetId: "d" }],
    }),
    strategy: "bezier",
    before: { crossingPenalty: 0, overlapPenalty: 0 },
  },
  {
    id: "monotonic",
    title: "Monotonic flow direction",
    graph: single("monotonic", false, true),
    strategy: "orthogonal",
    before: {},
  },
  {
    id: "bundle",
    title: "Shared trunks and branch spacing",
    graph: createGraph({
      id: "bundle",
      nodes: [node("a", 35, 145), node("b", 435, 40), node("c", 435, 145), node("d", 435, 250)],
      edges: [
        edge,
        { id: "branch-c", sourceId: "a", targetId: "c" },
        { id: "branch-d", sourceId: "a", targetId: "d" },
      ],
    }),
    strategy: "bundle",
    before: {},
  },
];

export const routingPolicySettings: Readonly<Record<string, RoutingSettings>> = {
  midpoint: {
    policy: {
      curve: { kind: "bezier" },
      label: { kind: "follow", fraction: 0.5 },
      sourceTangent: { kind: "border-normal" },
      targetTangent: { kind: "border-normal" },
    },
  },
  tangents: {
    policy: {
      curve: { kind: "bezier", curvature: 0.5 },
      sourceTangent: { kind: "vector", direction: { x: 1, y: 0.6 } },
      targetTangent: { kind: "border-normal" },
    },
  },
  "label-tangents": {
    policy: {
      curve: { kind: "bezier" },
      label: { kind: "gap", tangent: { kind: "border-normal" } },
      sourceTangent: { kind: "border-normal" },
      targetTangent: { kind: "border-normal" },
    },
  },
  obstacles: {
    policy: {
      curve: { kind: "bezier" },
      label: { kind: "follow" },
      collisions: { nodes: "avoid", labels: "avoid" },
    },
  },
  "catmull-rom": {
    policy: { curve: { kind: "catmull-rom" } },
    edges: {
      edge: {
        waypoints: [
          { x: 175, y: 205 },
          { x: 280, y: 65 },
          { x: 365, y: 190 },
        ],
      },
    },
  },
  rounded: {
    policy: {
      curve: { kind: "rounded-orthogonal", radius: 22 },
      sourceTangent: { kind: "border-normal" },
      targetTangent: { kind: "border-normal" },
    },
  },
  crossings: {
    policy: {
      curve: { kind: "bezier" },
      collisions: { crossingPenalty: 1000, overlapPenalty: 12 },
    },
  },
  monotonic: {
    policy: {
      curve: { kind: "rounded-orthogonal", radius: 14 },
      monotonic: { axis: "both", strength: "require" },
    },
  },
  bundle: {
    edgeSpacing: 20,
    policy: {
      curve: { kind: "rounded-orthogonal", radius: 18 },
      collisions: { crossingPenalty: 80, overlapPenalty: 8 },
    },
  },
};
