import OracleELK from "elkjs/lib/elk.bundled.js";
import { describe, expect, it } from "vitest";
import BaselineELK from "@statelyai/layout-pre-exterior-label-separation/elkjs";
import PatchedELK, { type ElkEdge, type ElkNode } from "../../src/elkjs";

type Routing = "ORTHOGONAL" | "POLYLINE" | "SPLINES";
type Direction = "DOWN" | "UP" | "RIGHT" | "LEFT";
type Rect = { x: number; y: number; width: number; height: number };

interface CorpusCase {
  id: string;
  graph: ElkNode;
  repairApplicable: boolean;
}

interface Metrics {
  labelLabelOverlaps: number;
  labelNodeOverlaps: number;
  invalidRoutes: number;
  nonOrthogonalSegments: number;
  area: number;
  entities: string[];
}

const number = (value: number | undefined): number => value ?? 0;
const finite = (value: number | undefined): boolean => Number.isFinite(value);
const overlaps = (left: Rect, right: Rect): boolean =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

function edge(
  id: string,
  source: string,
  target: string,
  placement: "CENTER" | "HEAD" | "TAIL" = "CENTER",
  width = 104,
): ElkEdge {
  return {
    id,
    sources: [source],
    targets: [target],
    labels: [
      {
        id: `${id}-label`,
        text: id,
        width,
        height: 40,
        layoutOptions: {
          "elk.edgeLabels.inline": "true",
          "elk.edgeLabels.placement": placement,
        },
      },
    ],
  };
}

function options(direction: Direction, routing: Routing): Record<string, string> {
  return {
    "elk.algorithm": "layered",
    "elk.direction": direction,
    "elk.edgeRouting": routing,
    "elk.layered.cycleBreaking.strategy": "MODEL_ORDER",
    "elk.layered.layering.strategy": "INTERACTIVE",
    "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
    "elk.spacing.edgeEdge": "10",
    "elk.spacing.nodeNode": "50",
    "elk.layered.spacing.nodeNodeBetweenLayers": "40",
  };
}

function feedbackGraph(direction: Direction, routing: Routing): ElkNode {
  const portSide = direction === "DOWN" || direction === "UP" ? "EAST" : "SOUTH";
  const nodes = ["a", "b", "c", "d"];
  return {
    id: "root",
    layoutOptions: options(direction, routing),
    children: nodes.map((id) => ({
      id,
      width: 120,
      height: 64,
      ports: [
        {
          id: `${id}-port`,
          width: 10,
          height: 10,
          layoutOptions: { "elk.port.side": portSide },
        },
      ],
    })),
    edges: [
      edge("ab", "a", "b", "TAIL", 72),
      edge("bc", "b", "c", "CENTER", 88),
      edge("cd", "c", "d", "CENTER", 96),
      edge("da", "d", "a", "CENTER", 132),
      edge("ca", "c", "a", "HEAD", 84),
      edge("db", "d", "b", "CENTER", 116),
    ],
  };
}

function clearGraph(direction: Direction): ElkNode {
  return {
    id: "root",
    layoutOptions: options(direction, "ORTHOGONAL"),
    children: ["a", "b", "c"].map((id) => ({ id, width: 90, height: 50 })),
    edges: [edge("ab", "a", "b", "CENTER", 32), edge("bc", "b", "c", "CENTER", 32)],
  };
}

function gameGraph(): ElkNode {
  const port = (id: string, side: "NORTH" | "SOUTH") => ({
    id,
    width: 20,
    height: 20,
    layoutOptions: { "elk.port.side": side },
  });
  return {
    id: "root",
    layoutOptions: {
      ...options("DOWN", "ORTHOGONAL"),
      "elk.spacing.edgeNode": "10",
      "elk.spacing.edgeLabel": "2",
      "elk.layered.spacing.nodeNodeBetweenLayers": "30",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "10",
      "elk.layered.spacing.edgeNodeBetweenLayers": "10",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.nodePlacement.favorStraightEdges": "true",
      "elk.layered.considerModelOrder.strategy": "PREFER_NODES",
      "elk.layered.considerModelOrder.longEdgeStrategy": "DUMMY_NODE_OVER",
      "elk.layered.considerModelOrder.components": "MODEL_ORDER",
      "elk.layered.compaction.postCompaction.strategy": "LEFT",
      "elk.layered.compaction.postCompaction.constraints": "SCANLINE",
    },
    children: [
      {
        id: "title",
        width: 71.74,
        height: 52,
        ports: [port("START__src", "SOUTH"), port("RESTART__tgt", "NORTH")],
        layoutOptions: { "elk.layered.layering.layerConstraint": "FIRST_SEPARATE" },
      },
      {
        id: "playing",
        width: 112.75,
        height: 52,
        ports: [
          port("START__tgt", "NORTH"),
          port("PAUSE__src", "SOUTH"),
          port("PLAYING_DONE__src", "SOUTH"),
          port("RESUME__tgt", "NORTH"),
        ],
      },
      {
        id: "paused",
        width: 114.05,
        height: 52,
        ports: [
          port("PAUSE__tgt", "NORTH"),
          port("RESUME__src", "SOUTH"),
          port("PAUSED_DONE__src", "SOUTH"),
        ],
      },
      {
        id: "gameOver",
        width: 148.41,
        height: 52,
        ports: [
          port("PLAYING_DONE__tgt", "NORTH"),
          port("PAUSED_DONE__tgt", "NORTH"),
          port("RESTART__src", "SOUTH"),
        ],
      },
    ],
    edges: [
      edge("START", "START__src", "START__tgt", "CENTER", 73.6),
      edge("PAUSE", "PAUSE__src", "PAUSE__tgt", "CENTER", 73.71),
      edge("PLAYING_DONE", "PLAYING_DONE__src", "PLAYING_DONE__tgt", "CENTER", 113.71),
      edge("RESUME", "RESUME__src", "RESUME__tgt", "CENTER", 86.41),
      edge("PAUSED_DONE", "PAUSED_DONE__src", "PAUSED_DONE__tgt", "CENTER", 113.71),
      edge("RESTART", "RESTART__src", "RESTART__tgt", "CENTER", 91.2),
    ],
  };
}

function hierarchyGraph(): ElkNode {
  return {
    id: "root",
    layoutOptions: options("RIGHT", "ORTHOGONAL"),
    children: [
      {
        id: "group",
        layoutOptions: options("DOWN", "ORTHOGONAL"),
        children: [
          { id: "inside-a", width: 70, height: 40 },
          { id: "inside-b", width: 70, height: 40 },
        ],
        edges: [edge("inside-edge", "inside-a", "inside-b", "CENTER", 44)],
      },
      { id: "outside", width: 90, height: 50 },
    ],
    edges: [edge("group-edge", "group", "outside", "CENTER", 52)],
  };
}

const corpus: CorpusCase[] = [
  { id: "game-feedback-down-orthogonal", graph: gameGraph(), repairApplicable: true },
  ...(["DOWN", "UP", "RIGHT", "LEFT"] as const).map((direction) => ({
    id: `feedback-${direction.toLowerCase()}-orthogonal`,
    graph: feedbackGraph(direction, "ORTHOGONAL"),
    repairApplicable: true,
  })),
  ...(["DOWN", "RIGHT"] as const).map((direction) => ({
    id: `clear-${direction.toLowerCase()}-orthogonal`,
    graph: clearGraph(direction),
    repairApplicable: false,
  })),
  ...(["POLYLINE", "SPLINES"] as const).map((routing) => ({
    id: `feedback-down-${routing.toLowerCase()}`,
    graph: feedbackGraph("DOWN", routing),
    repairApplicable: false,
  })),
  { id: "hierarchy", graph: hierarchyGraph(), repairApplicable: false },
];

function collect(
  graph: ElkNode,
  offsetX = 0,
  offsetY = 0,
): {
  entities: string[];
  labels: Rect[];
  nodes: Rect[];
  routes: { points: { x: number; y: number }[] }[];
} {
  const entities = [`graph:${graph.id}`];
  const labels: Rect[] = [];
  const nodes: Rect[] = [];
  const routes: { points: { x: number; y: number }[] }[] = [];
  for (const child of graph.children ?? []) {
    entities.push(`node:${child.id}`);
    for (const port of child.ports ?? []) entities.push(`port:${port.id}`);
    const x = offsetX + number(child.x);
    const y = offsetY + number(child.y);
    nodes.push({ x, y, width: number(child.width), height: number(child.height) });
    if (child.children?.length) {
      const nested = collect(child, x, y);
      entities.push(...nested.entities);
      labels.push(...nested.labels);
      nodes.push(...nested.nodes);
      routes.push(...nested.routes);
    }
  }
  for (const currentEdge of graph.edges ?? []) {
    entities.push(`edge:${currentEdge.id}`);
    for (const label of currentEdge.labels ?? []) {
      entities.push(`label:${label.id}`);
      labels.push({
        x: offsetX + number(label.x),
        y: offsetY + number(label.y),
        width: number(label.width),
        height: number(label.height),
      });
    }
    for (const section of currentEdge.sections ?? []) {
      routes.push({
        points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
          (point) => ({ x: offsetX + point.x, y: offsetY + point.y }),
        ),
      });
    }
  }
  return { entities, labels, nodes, routes };
}

function metrics(graph: ElkNode, routing: Routing): Metrics {
  const data = collect(graph);
  let labelLabelOverlaps = 0;
  for (const [index, label] of data.labels.entries()) {
    labelLabelOverlaps += data.labels
      .slice(index + 1)
      .filter((other) => overlaps(label, other)).length;
  }
  const labelNodeOverlaps = data.labels.reduce(
    (count, label) => count + data.nodes.filter((node) => overlaps(label, node)).length,
    0,
  );
  const invalidRoutes = data.routes.filter(
    (route) =>
      route.points.length < 2 || route.points.some((point) => !finite(point.x) || !finite(point.y)),
  ).length;
  const nonOrthogonalSegments =
    routing === "ORTHOGONAL"
      ? data.routes.reduce(
          (count, route) =>
            count +
            route.points.slice(1).filter((point, index) => {
              const previous = route.points[index]!;
              return previous.x !== point.x && previous.y !== point.y;
            }).length,
          0,
        )
      : 0;
  return {
    labelLabelOverlaps,
    labelNodeOverlaps,
    invalidRoutes,
    nonOrthogonalSegments,
    area: number(graph.width) * number(graph.height),
    entities: data.entities.toSorted(),
  };
}

function geometry(graph: ElkNode): unknown {
  return {
    id: graph.id,
    x: graph.x,
    y: graph.y,
    width: graph.width,
    height: graph.height,
    ports: graph.ports?.map(geometry),
    labels: graph.labels?.map(geometry),
    children: graph.children?.map(geometry),
    edges: graph.edges?.map((currentEdge) => ({
      id: currentEdge.id,
      labels: currentEdge.labels?.map(geometry),
      sections: currentEdge.sections,
    })),
  };
}

describe("exterior label separation: ELK/pre-change/patched differential", () => {
  it.each(corpus)("preserves compatibility invariants for $id", async (entry) => {
    const routing = entry.graph.layoutOptions?.["elk.edgeRouting"] as Routing;
    const inputEntities = collect(entry.graph).entities.toSorted();
    const [oracle, baseline, patched] = await Promise.all([
      new OracleELK().layout(structuredClone(entry.graph) as never) as Promise<ElkNode>,
      new BaselineELK().layout(structuredClone(entry.graph) as never) as Promise<ElkNode>,
      new PatchedELK().layout(structuredClone(entry.graph)),
    ]);
    const reports = {
      oracle: metrics(oracle, routing),
      baseline: metrics(baseline, routing),
      patched: metrics(patched, routing),
    };

    for (const [implementation, report] of Object.entries(reports)) {
      expect(report.entities, `${entry.id}: ${implementation} entities`).toEqual(inputEntities);
      expect(report.invalidRoutes, `${entry.id}: ${implementation} routes`).toBe(0);
      expect(report.area, `${entry.id}: ${implementation} area`).toBeGreaterThan(0);
    }
    expect(
      reports.patched.labelLabelOverlaps,
      `${entry.id}: label/label regression`,
    ).toBeLessThanOrEqual(reports.baseline.labelLabelOverlaps);
    expect(
      Math.abs(reports.patched.labelLabelOverlaps - reports.oracle.labelLabelOverlaps),
      `${entry.id}: label/label divergence from ELK`,
    ).toBeLessThanOrEqual(
      Math.abs(reports.baseline.labelLabelOverlaps - reports.oracle.labelLabelOverlaps),
    );
    expect(
      reports.patched.labelNodeOverlaps,
      `${entry.id}: label/node regression`,
    ).toBeLessThanOrEqual(reports.baseline.labelNodeOverlaps);
    expect(
      Math.abs(reports.patched.labelNodeOverlaps - reports.oracle.labelNodeOverlaps),
      `${entry.id}: label/node divergence from ELK`,
    ).toBeLessThanOrEqual(
      Math.abs(reports.baseline.labelNodeOverlaps - reports.oracle.labelNodeOverlaps),
    );
    expect(
      Math.abs(reports.patched.nonOrthogonalSegments - reports.oracle.nonOrthogonalSegments),
      `${entry.id}: orthogonality divergence from ELK`,
    ).toBeLessThanOrEqual(
      Math.abs(reports.baseline.nonOrthogonalSegments - reports.oracle.nonOrthogonalSegments),
    );
    expect(reports.patched.area / reports.baseline.area, `${entry.id}: area growth`).toBeLessThan(
      1.02,
    );
    expect(
      reports.patched.area / reports.oracle.area,
      `${entry.id}: ELK area envelope`,
    ).toBeLessThan(3.1);

    if (!entry.repairApplicable) expect(geometry(patched)).toEqual(geometry(baseline));
  });

  it("strictly improves at least one affected feedback graph without worsening any", async () => {
    const affected = corpus.filter((entry) => entry.repairApplicable);
    const comparisons = await Promise.all(
      affected.map(async (entry) => {
        const [baseline, patched] = await Promise.all([
          new BaselineELK().layout(structuredClone(entry.graph) as never) as Promise<ElkNode>,
          new PatchedELK().layout(structuredClone(entry.graph)),
        ]);
        return {
          baseline: metrics(baseline, "ORTHOGONAL"),
          patched: metrics(patched, "ORTHOGONAL"),
        };
      }),
    );
    expect(
      comparisons.some(
        ({ baseline, patched }) =>
          patched.labelLabelOverlaps < baseline.labelLabelOverlaps ||
          patched.labelNodeOverlaps < baseline.labelNodeOverlaps,
      ),
    ).toBe(true);
  });

  it("removes the game-loop collision with bounded growth", async () => {
    const graph = gameGraph();
    const [oracle, baseline, patched] = await Promise.all([
      new OracleELK().layout(structuredClone(graph) as never) as Promise<ElkNode>,
      new BaselineELK().layout(structuredClone(graph) as never) as Promise<ElkNode>,
      new PatchedELK().layout(structuredClone(graph)),
    ]);
    const oracleMetrics = metrics(oracle, "ORTHOGONAL");
    const baselineMetrics = metrics(baseline, "ORTHOGONAL");
    const patchedMetrics = metrics(patched, "ORTHOGONAL");
    expect(baselineMetrics.labelLabelOverlaps).toBe(1);
    expect(patchedMetrics.labelLabelOverlaps).toBe(0);
    expect(patchedMetrics.labelLabelOverlaps).toBe(oracleMetrics.labelLabelOverlaps);
    expect(patchedMetrics.area / baselineMetrics.area).toBeLessThan(1.02);
  });
});
