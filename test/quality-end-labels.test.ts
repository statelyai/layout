import { expect, it } from "vitest";
import ELK from "../src/elkjs";
import type { ElkEdge, ElkNode } from "../src/elkjs/types";

type Rect = { x?: number; y?: number; width?: number; height?: number };

const overlaps = (left: Rect, right: Rect) =>
  (left.x ?? 0) < (right.x ?? 0) + (right.width ?? 0) &&
  (left.x ?? 0) + (left.width ?? 0) > (right.x ?? 0) &&
  (left.y ?? 0) < (right.y ?? 0) + (right.height ?? 0) &&
  (left.y ?? 0) + (left.height ?? 0) > (right.y ?? 0);

const edge = (id: string, source: string, target: string, placement: string): ElkEdge => ({
  id,
  sources: [source],
  targets: [target],
  labels: [
    {
      id: `${id}-label`,
      text: id,
      width: 84,
      height: 40,
      layoutOptions: { "elk.edgeLabels.inline": "true", "elk.edgeLabels.placement": placement },
    },
  ],
});

// A feedback edge's HEAD label used to land inside its target or beside a
// neighboring state, because it was placed as if the route ran forward.
it.each([
  ["DOWN", "ORTHOGONAL"],
  ["UP", "ORTHOGONAL"],
  ["RIGHT", "ORTHOGONAL"],
  ["LEFT", "ORTHOGONAL"],
  ["DOWN", "POLYLINE"],
  ["DOWN", "SPLINES"],
])("keeps %s %s end labels clear of nodes and other labels", async (direction, routing) => {
  const side = direction === "DOWN" || direction === "UP" ? "EAST" : "SOUTH";
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.edgeRouting": routing,
      "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
      "elk.layered.layering.strategy": "INTERACTIVE",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      "elk.spacing.nodeNode": "50",
      "elk.layered.spacing.nodeNodeBetweenLayers": "40",
    },
    children: ["a", "b", "c", "d"].map((id) => ({
      id,
      width: 120,
      height: 64,
      ports: [
        { id: `${id}-port`, width: 10, height: 10, layoutOptions: { "elk.port.side": side } },
      ],
    })),
    edges: [
      edge("ab", "a", "b", "TAIL"),
      edge("bc", "b", "c", "CENTER"),
      edge("cd", "c", "d", "CENTER"),
      edge("da", "d", "a", "CENTER"),
      edge("ca", "c", "a", "HEAD"),
      edge("db", "d", "b", "CENTER"),
    ],
  };
  const result = await new ELK().layout(graph);
  const labels = result.edges!.flatMap((current) =>
    (current.labels ?? []).map((label) => ({ id: current.id, label })),
  );
  for (const { id, label } of labels) {
    for (const node of result.children!)
      expect(overlaps(label, node), `${id} label / ${node.id}`).toBe(false);
    for (const other of labels)
      if (other.id !== id)
        expect(overlaps(label, other.label), `${id} label / ${other.id} label`).toBe(false);
  }
});
