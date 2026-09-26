import { createGraph, type VisualGraph } from "@statelyai/graph";
import { c, getFixedLayout, type LayoutRequest, type LayoutDirection } from "../src";

export type Scenario =
  | "routes"
  | "groups"
  | "selection"
  | "affected"
  | "conflict"
  | "overlap"
  | "nested"
  | "incremental";
export interface AuthoringControls {
  scenario: Scenario;
  direction: LayoutDirection;
  spacing: number;
  obstacleX: number;
  routing: "selected" | "affected";
  groupA: string;
  groupB: string;
}
export const defaults: AuthoringControls = {
  scenario: "routes",
  direction: "right",
  spacing: 24,
  obstacleX: 280,
  routing: "affected",
  groupA: "one,two,three",
  groupB: "four,five",
};
export const descriptions: Record<
  Scenario,
  { title: string; description: string; limitation: string }
> = {
  routes: {
    title: "Edge-only routing",
    description:
      "Reroute ab while preserving every node and label position. Change direction or move the blocker.",
    limitation:
      "Current partial router: shortest orthogonal paths, not ELK routing. Bend penalties, endpoint exit segments, and edge-to-edge clearance are not implemented.",
  },
  groups: {
    title: "Independent constraint groups",
    description:
      "Each comma-separated list defines an alignment and distribution group. Only listed labels may move; routes stay fixed.",
    limitation:
      "Groups are entity lists, not named graph containers. Overlapping groups can produce conflicting required constraints.",
  },
  selection: {
    title: "Arrange selection around fixed entities",
    description:
      "Arrange a and b; the fixed node remains an obstacle. Change spacing and blocker position.",
    limitation:
      "Placement searches a bounded set of offsets. If none fits, it preserves the input and reports PLACEMENT_BLOCKED.",
  },
  affected: {
    title: "Selected versus affected routing",
    description:
      "Move a with a required pin. Compare automatic route repair against leaving unselected edges unchanged.",
    limitation:
      "Selected-only routing preserves an invalidated edge and reports that repair is required.",
  },
  conflict: {
    title: "Required constraint conflict",
    description:
      "Pin an unselected node somewhere else. The request must fail instead of silently moving a fixed entity.",
    limitation: "Constraint references do not grant movement permission.",
  },
  overlap: {
    title: "Constraint-induced overlap",
    description:
      "Pin selected a into the fixed blocker. This exposes the current collision policy after constraint solving.",
    limitation:
      "Collision avoidance is not a hard solver constraint. This request reports NODE_OVERLAP rather than refusing the required pin.",
  },
  nested: {
    title: "Nested leaf coordinate frames",
    description:
      "Move a nested child using a world-coordinate pin. The fixed parent stays put; output uses parent-relative coordinates.",
    limitation:
      "Moving containers is unsupported. Selecting a leaf does not select its ancestors or siblings.",
  },
  incremental: {
    title: "Incremental layout is unsupported",
    description: "Request an update using a previous layout as a stability baseline.",
    limitation:
      "Partial selection is implemented; general incremental layout deliberately returns UNSUPPORTED_LAYOUT.",
  },
};

const ids = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];
export function authoringRequest(controls: AuthoringControls): {
  graph: VisualGraph;
  request: LayoutRequest;
} {
  const { scenario, direction, spacing, obstacleX, routing } = controls;
  let graph = getFixedLayout(
    createGraph({
      nodes: [
        { id: "a", x: 40, y: 100, width: 80, height: 44 },
        { id: "b", x: 470, y: 100, width: 80, height: 44 },
        { id: "fixed", x: obstacleX, y: 65, width: 100, height: 125 },
      ],
      edges: [
        {
          id: "ab",
          sourceId: "a",
          targetId: "b",
          x: 165,
          y: 270,
          width: 80,
          height: 26,
          points: [
            { x: 120, y: 122 },
            { x: 470, y: 122 },
          ],
          routing: "orthogonal",
        },
      ],
    }),
    { direction },
  );
  const request: LayoutRequest = {
    graph,
    options: { direction, spacing: { node: spacing } },
    scope: { mode: "partial", edgeIds: ["ab"], edgeGeometry: "routes" },
  };
  if (scenario === "groups") {
    graph = getFixedLayout(
      createGraph({
        nodes: [
          { id: "source", x: 20, y: 180, width: 80, height: 44 },
          { id: "target", x: 510, y: 180, width: 80, height: 44 },
        ],
        edges: ["one", "two", "three", "four", "five"].map((id, index) => ({
          id,
          sourceId: "source",
          targetId: "target",
          x: [140, 230, 165, 340, 420][index]!,
          y: [40, 150, 280, 75, 250][index]!,
          width: 70,
          height: 26,
          points: [
            { x: 100, y: 202 },
            { x: 130, y: 202 },
            { x: 130, y: 15 + index * 65 },
            { x: 490, y: 15 + index * 65 },
            { x: 490, y: 202 },
            { x: 510, y: 202 },
          ],
        })),
      }),
      { direction },
    );
    const groups = [ids(controls.groupA), ids(controls.groupB)];
    request.scope = {
      mode: "partial",
      edgeIds: [...new Set(groups.flat())],
      edgeGeometry: "labels",
      routing: "selected",
    };
    request.constraints = groups.flatMap((group, index) => [
      c.align({
        id: `group-${index}-align`,
        entities: group.map((edgeId) => ({ edgeId, part: "label" })),
        axis: "x",
        anchor: "center",
      }),
      c.distribute({
        id: `group-${index}-gaps`,
        entities: group.map((edgeId) => ({ edgeId, part: "label" })),
        axis: "y",
        gap: spacing,
      }),
    ]);
  } else if (scenario === "selection") {
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === "b" ? { ...n, x: 55, y: 280 } : n)),
    };
    request.scope = { mode: "partial", nodeIds: ["a", "b"], routing };
  } else if (scenario === "affected") {
    request.scope = { mode: "partial", nodeIds: ["a"], routing };
    request.constraints = [c.pin({ id: "move-a", entity: { nodeId: "a" }, y: 260 })];
  } else if (scenario === "conflict") {
    request.scope = { mode: "partial", edgeIds: ["ab"] };
    request.constraints = [c.pin({ id: "fixed-node", entity: { nodeId: "a" }, y: 260 })];
  } else if (scenario === "overlap") {
    request.scope = { mode: "partial", nodeIds: ["a"], routing };
    request.constraints = [
      c.pin({ id: "pin-into-obstacle", entity: { nodeId: "a" }, x: obstacleX + 10, y: 100 }),
    ];
  } else if (scenario === "nested") {
    graph = getFixedLayout(
      createGraph({
        nodes: [
          { id: "parent", x: 80, y: 50, width: 440, height: 280 },
          { id: "child", parentId: "parent", x: 25, y: 35, width: 80, height: 44 },
          { id: "sibling", parentId: "parent", x: 310, y: 150, width: 80, height: 44 },
        ],
        edges: [],
      }),
      { direction },
    );
    request.scope = { mode: "partial", nodeIds: ["child"] };
    request.constraints = [
      c.pin({ id: "world-position", entity: { nodeId: "child" }, x: 250, y: 180 }),
    ];
  } else if (scenario === "incremental") request.scope = { mode: "incremental", previous: graph };
  request.graph = graph;
  return { graph, request };
}
