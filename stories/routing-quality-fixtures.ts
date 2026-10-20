import { createGraph } from "@statelyai/graph";
import type { RoutingGraph, RoutingSettings, RouteStyle, RoutingLabel } from "../src/routing";
import {
  createRoutingCatalogGraph,
  createRoutingCoordinationGraph,
} from "./routing-catalog-fixtures";
import { routingPolicyFixtures, routingPolicySettings } from "../scripts/routing-policy-fixtures";

export interface RoutingQualityFixture {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly graph: RoutingGraph;
  readonly strategy: RouteStyle;
  readonly settings: RoutingSettings;
  readonly before?: RoutingSettings;
  readonly obstacleId?: string;
}

const node = (id: string, x: number, y: number, width = 72, height = 48) => ({
  id,
  x,
  y,
  width,
  height,
});
const edge = { id: "edge", sourceId: "a", targetId: "b" };
const curveSettings: RoutingSettings = {
  policy: {
    curve: { kind: "bezier" },
    sourceTangent: { kind: "border-normal" },
    targetTangent: { kind: "border-normal" },
    collisions: { nodes: "avoid", labels: "avoid" },
  },
};

export const policyReviewFixtures: readonly RoutingQualityFixture[] = routingPolicyFixtures.map(
  (fixture) => ({
    ...fixture,
    description: "Original policy fixture. Drag a node or compare the original settings.",
    settings: routingPolicySettings[fixture.id] ?? {},
    ...(fixture.graph.nodes.some((item) => item.id === "obstacle")
      ? { obstacleId: "obstacle" }
      : {}),
  }),
);

export const labelReviewGraph = createGraph({
  id: "label-modes",
  nodes: [node("a", 35, 65), node("b", 475, 235)],
  edges: [{ ...edge, x: 245, y: 145, width: 106, height: 32 }],
});

const portsGraph = createGraph({
  id: "ports",
  nodes: [
    { ...node("a", 35, 145), ports: [{ name: "out", x: 72, y: 12 }] },
    { ...node("b", 475, 90), ports: [{ name: "in", x: 0, y: 36 }] },
    node("obstacle", 255, 75, 76, 180),
  ],
  edges: [edge],
});

const labelKinds: readonly RoutingLabel["kind"][] = ["follow", "fixed", "through", "gap"];

const branchGraph = createGraph({
  id: "parallel-branches",
  nodes: [node("a", 35, 155), node("b", 475, 55), node("c", 475, 175), node("d", 475, 295)],
  edges: [
    edge,
    { ...edge, id: "parallel" },
    { id: "branch-c", sourceId: "a", targetId: "c" },
    { id: "branch-d", sourceId: "a", targetId: "d" },
  ],
});

function originalFixture(id: string) {
  const fixture = routingPolicyFixtures.find((item) => item.id === id);
  if (!fixture) throw new Error(`Unknown original policy fixture ${id}`);
  return fixture;
}
const catmullFixture = originalFixture("catmull-rom");

export const routingStressFixtures: readonly RoutingQualityFixture[] = [
  ...labelKinds.map((kind): RoutingQualityFixture => ({
    id: `label-${kind}`,
    title: `Label ${kind}`,
    description: "Same graph and label bounds across all four label modes.",
    graph: labelReviewGraph,
    strategy: "bezier",
    settings: { ...curveSettings, policy: { ...curveSettings.policy, label: { kind } } },
  })),
  {
    id: "automatic-ports",
    title: "Automatic attachments",
    description:
      "Floating endpoints choose their attachment around the same obstacle as fixed ports.",
    graph: portsGraph,
    strategy: "bezier",
    settings: curveSettings,
    obstacleId: "obstacle",
  },
  {
    id: "fixed-ports",
    title: "Fixed ports",
    description: "Named output and input ports constrain both endpoints.",
    graph: {
      ...portsGraph,
      edges: portsGraph.edges.map((item) => ({ ...item, sourcePort: "out", targetPort: "in" })),
    },
    strategy: "bezier",
    settings: curveSettings,
    obstacleId: "obstacle",
  },
  {
    id: "opposing-faces",
    title: "Outward facing endpoints",
    description:
      "Fixed faces point away from the target. Inspect terminal clearance and the return curve.",
    graph: createGraph({
      id: "opposing-faces",
      nodes: [node("a", 105, 120), node("b", 435, 120)],
      edges: [edge],
    }),
    strategy: "bezier",
    settings: { ...curveSettings, edges: { edge: { sourceSide: "left", targetSide: "right" } } },
  },
  {
    id: "same-face-loops",
    title: "Same face self loops",
    description: "Two self loops on one node. Both ends of each loop share a face.",
    graph: createGraph({
      id: "same-face-loops",
      nodes: [node("a", 220, 170, 100, 64)],
      edges: [
        { id: "top-loop", sourceId: "a", targetId: "a" },
        { id: "right-loop", sourceId: "a", targetId: "a" },
      ],
    }),
    strategy: "self-loop",
    settings: {
      ...curveSettings,
      edges: {
        "top-loop": { sourceSide: "top", targetSide: "top" },
        "right-loop": { sourceSide: "right", targetSide: "right" },
      },
    },
  },
  {
    id: "tight-corridor",
    title: "Tight corridor",
    description: "A narrow horizontal passage tests corner rounding and clearance.",
    graph: createGraph({
      id: "tight-corridor",
      nodes: [
        node("a", 35, 171),
        node("b", 475, 171),
        node("upper", 190, 45, 205, 110),
        node("obstacle", 190, 235, 205, 110),
      ],
      edges: [edge],
    }),
    strategy: "orthogonal",
    settings: { clearance: 14, policy: { curve: { kind: "rounded-orthogonal", radius: 22 } } },
    obstacleId: "obstacle",
  },
  {
    id: "multiple-obstacles",
    title: "Multiple staggered obstacles",
    description: "Three obstacles test the complete route, including long external detours.",
    graph: createGraph({
      id: "multiple-obstacles",
      nodes: [
        node("a", 35, 135),
        node("b", 650, 135),
        node("obstacle", 190, 65, 75, 170),
        node("lower", 345, 165, 75, 160),
        node("upper", 500, 25, 75, 150),
      ],
      edges: [edge],
    }),
    strategy: "bezier",
    settings: curveSettings,
    obstacleId: "obstacle",
  },
  {
    id: "parallel-branches",
    title: "Parallel edges and branches",
    description: "Repeated source-target pairs and separate targets test visible edge separation.",
    graph: branchGraph,
    strategy: "parallel",
    settings: { edgeSpacing: 22, policy: { curve: { kind: "bezier" } } },
  },
  {
    id: "shared-bundle",
    title: "Shared bundle and parallel branch",
    description: "Shared trunks render once. Arrowheads appear only at actual edge targets.",
    graph: branchGraph,
    strategy: "bundle",
    settings: { edgeSpacing: 22, policy: { curve: { kind: "rounded-orthogonal", radius: 18 } } },
  },
  {
    id: "reversed-edges",
    title: "Reversed edges",
    description: "Forward and reverse edges share terminals. Arrowheads identify direction.",
    graph: createGraph({
      id: "reversed-edges",
      nodes: [node("a", 35, 130), node("b", 475, 130)],
      edges: [edge, { id: "reverse", sourceId: "b", targetId: "a" }],
    }),
    strategy: "parallel",
    settings: { edgeSpacing: 28, policy: { curve: { kind: "bezier" } } },
  },
  {
    id: "incremental-moves",
    title: "Incremental source and obstacle moves",
    description: "Move either the source or obstacle. The independent bottom edge exposes reuse.",
    graph: createGraph({
      id: "incremental-moves",
      nodes: [
        node("a", 35, 85),
        node("b", 475, 220),
        node("obstacle", 245, 120, 80, 100),
        node("c", 35, 370),
        node("d", 475, 370),
      ],
      edges: [edge, { id: "independent", sourceId: "c", targetId: "d" }],
    }),
    strategy: "bezier",
    settings: {
      ...curveSettings,
      policy: { ...curveSettings.policy, stability: { kind: "preserve-valid" } },
    },
    obstacleId: "obstacle",
  },
];

export const routingRegressionFixtures: readonly RoutingQualityFixture[] = [
  {
    id: "high-curvature-obstacle",
    title: "High curvature obstacle clearance",
    description:
      "Curvature 2 around the original obstacle. Inspect clearance without changing the authored geometry.",
    graph: originalFixture("obstacles").graph,
    strategy: "bezier",
    settings: {
      ...curveSettings,
      policy: {
        ...curveSettings.policy,
        curve: { kind: "bezier", curvature: 2 },
        label: { kind: "follow" },
      },
    },
    obstacleId: "obstacle",
  },
  {
    id: "restricted-label-sides",
    title: "Restricted perpendicular label sides",
    description:
      "Gap attachments allow only the top and right label faces and require border normals.",
    graph: originalFixture("label-tangents").graph,
    strategy: "bezier",
    settings: {
      ...curveSettings,
      policy: {
        ...curveSettings.policy,
        label: { kind: "gap", tangent: { kind: "border-normal" } },
      },
      edges: { edge: { labelSides: ["top", "right"] } },
    },
  },
  {
    id: "catmull-fixed-ports",
    title: "Catmull–Rom fixed ports and normals",
    description:
      "Original authored waypoints with fixed right/left ports and explicit endpoint border normals.",
    graph: createGraph({
      ...catmullFixture.graph,
      nodes: catmullFixture.graph.nodes.map((item) => ({
        ...item,
        ports: [
          { name: "route", x: item.id === "a" ? (item.width ?? 0) : 0, y: (item.height ?? 0) / 2 },
        ],
      })),
      edges: catmullFixture.graph.edges.map((item) => ({
        ...item,
        sourcePort: "route",
        targetPort: "route",
      })),
    }),
    strategy: "polyline",
    settings: {
      ...routingPolicySettings["catmull-rom"],
      policy: {
        curve: { kind: "catmull-rom" },
        sourceTangent: { kind: "border-normal" },
        targetTangent: { kind: "border-normal" },
      },
    },
  },
  {
    id: "dense-same-face",
    title: "Dense same face attachments",
    description:
      "Multiple branches constrain both ends to right faces. Attachment positions remain automatic.",
    graph: createGraph({
      id: "dense-same-face",
      nodes: [node("a", 65, 155), node("b", 395, 70), node("c", 395, 160), node("d", 395, 250)],
      edges: [
        edge,
        { id: "branch-c", sourceId: "a", targetId: "c" },
        { id: "branch-d", sourceId: "a", targetId: "d" },
      ],
    }),
    strategy: "bezier",
    settings: {
      ...curveSettings,
      edges: Object.fromEntries(
        ["edge", "branch-c", "branch-d"].map((id) => [
          id,
          { sourceSides: ["right"], targetSides: ["right"] },
        ]),
      ),
    },
  },
  {
    id: "loop-near-obstacle",
    title: "Self loop near an obstacle",
    description:
      "A right face self loop must clear both its terminal and the neighboring obstacle.",
    graph: createGraph({
      id: "loop-near-obstacle",
      nodes: [node("a", 220, 170, 100, 64), node("obstacle", 343, 145, 64, 112)],
      edges: [{ id: "loop", sourceId: "a", targetId: "a" }],
    }),
    strategy: "self-loop",
    settings: { ...curveSettings, edges: { loop: { sourceSide: "right", targetSide: "right" } } },
    obstacleId: "obstacle",
  },
];

export const routingQualityFixtures: readonly RoutingQualityFixture[] = [
  ...policyReviewFixtures,
  ...routingStressFixtures,
  ...routingRegressionFixtures,
];

export const routingCurveFamilies = [
  { kind: "polyline" },
  { kind: "bezier" },
  { kind: "catmull-rom" },
  { kind: "rounded-orthogonal", radius: 18 },
] satisfies NonNullable<RoutingSettings["policy"]>["curve"][];

const catalogGraph = createRoutingCatalogGraph();
const strategyNames: readonly RouteStyle[] = [
  "straight",
  "bezier",
  "orthogonal",
  "polyline",
  "octilinear",
  "curved",
  "organic",
  "parallel",
  "self-loop",
  "fan",
  "bus",
  "bundle",
];
export const routingStrategyFixtures: readonly RoutingQualityFixture[] = strategyNames.map(
  (strategy) => ({
    id: `strategy-${strategy}`,
    title: strategy,
    description:
      "Original incremental routing catalog graph and default settings. Drag nodes to inspect this strategy.",
    graph: catalogGraph,
    strategy,
    settings: {},
    obstacleId: "Obstacle",
  }),
);
const coordinationGraph = createRoutingCoordinationGraph();
export const routingCoordinationFixtures: readonly RoutingQualityFixture[] = [0, 800].map(
  (crossingPenalty) => ({
    id: `coordination-${crossingPenalty}`,
    title: `Crossing penalty ${crossingPenalty}`,
    description: "Original coordination graph and crossing penalties.",
    graph: coordinationGraph,
    strategy: "orthogonal",
    settings: { crossingPenalty },
  }),
);

export function getRoutingQualityFixture(id: string): RoutingQualityFixture {
  const fixture = [...routingQualityFixtures, ...routingStrategyFixtures].find(
    (item) => item.id === id,
  );
  if (!fixture) throw new Error(`Unknown routing quality fixture ${id}`);
  return fixture;
}
