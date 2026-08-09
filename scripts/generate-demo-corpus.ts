import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createGraph,
  type EdgeRouting,
  type Point,
  type PortDirection,
  type VisualGraph,
} from "@statelyai/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import { demoScenarios, type DemoNodeSpec, type DemoScenario } from "../demo/scenarios";
import { getBoxLayout } from "../src/box";
import { getFixedLayout } from "../src/fixed";
import { getLayeredLayout } from "../src/layered";
import { getRectanglePackingLayout } from "../src/packing";
import { getRandomLayout } from "../src/random";
import { getSporeCompactionLayout, getSporeOverlapRemovalLayout } from "../src/spore";
import type { ElkEdge, ElkNode } from "../src/elkjs/types";

type EmbedNode = {
  type: "node";
  id: string;
  parentId: string | null;
  initialNodeId: string | null;
  label: string;
  position: Point;
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
  ports?: EmbedPort[];
  data: Record<string, unknown>;
};

type EmbedPort = {
  name: string;
  direction: PortDirection;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: null;
};

type EmbedEdge = {
  type: "edge";
  id: string;
  sourceId: string;
  targetId: string;
  position: Point;
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  height: number;
  sourcePort?: string;
  targetPort?: string;
  points: Point[];
  routing: EdgeRouting;
  data: Record<string, unknown>;
};

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function stateData(id: string, parentId: string | null, initialId: string | null) {
  return {
    nodeId: id,
    parentId,
    key: id,
    type: "normal",
    initialId,
    history: false,
    entry: [],
    exit: [],
    invokes: [],
    tags: [],
    meta: null,
  };
}

function transitionData(eventType: string) {
  return {
    eventType,
    transitionType: "normal",
    guard: null,
    actions: [],
    description: null,
    meta: null,
  };
}

function midpoint(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0] ?? { x: 0, y: 0 };
  const middle = Math.floor((points.length - 1) / 2);
  const first = points[middle] ?? points[0]!;
  const second = points[middle + 1] ?? first;
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function elkEdgePoints(edge: ElkEdge, offset: Point): Point[] {
  const section = edge.sections?.[0];
  return section
    ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((point) => ({
        x: point.x + offset.x,
        y: point.y + offset.y,
      }))
    : [];
}

function toEmbedGraph(scenario: DemoScenario, graph: ElkNode) {
  const nodes: EmbedNode[] = [];
  const edges: EmbedEdge[] = [];
  const syntheticRootId = `${scenario.id}:root`;

  const visitNode = (node: ElkNode, parentId: string, parentOffset: Point): void => {
    const id = String(node.id);
    const childIds = (node.children ?? []).map((child) => String(child.id));
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const absoluteOffset = { x: parentOffset.x + x, y: parentOffset.y + y };
    const ports = node.ports?.map((port) => ({
      name: String(port.id),
      direction: String(port.properties?.["stately.direction"] ?? "inout") as PortDirection,
      ...(port.labels?.[0]?.text ? { label: port.labels[0].text } : {}),
      x: port.x ?? 0,
      y: port.y ?? 0,
      width: port.width ?? 10,
      height: port.height ?? 10,
      data: null,
    }));
    nodes.push({
      type: "node",
      id,
      parentId,
      initialNodeId: childIds[0] ?? null,
      label: node.labels?.[0]?.text ?? id,
      position: { x, y },
      x,
      y,
      dx: 0,
      dy: 0,
      width: node.width ?? 100,
      height: node.height ?? 56,
      ...(ports?.length ? { ports } : {}),
      data: stateData(id, parentId, childIds[0] ?? null),
    });
    for (const child of node.children ?? []) visitNode(child, id, absoluteOffset);
    for (const edge of node.edges ?? []) visitEdge(edge, absoluteOffset);
  };

  const visitEdge = (edge: ElkEdge, offset: Point): void => {
    const points = elkEdgePoints(edge, offset);
    const center = midpoint(points);
    const unlabeled = ["box", "random", "rectpacking", "sporeCompaction", "sporeOverlap"].includes(
      scenario.algorithm,
    );
    const width = unlabeled ? 0 : Math.max(64, String(edge.id).length * 8 + 24);
    const height = unlabeled ? 0 : 32;
    edges.push({
      type: "edge",
      id: String(edge.id),
      sourceId: String(edge.sources?.[0] ?? edge.source),
      targetId: String(edge.targets?.[0] ?? edge.target),
      position: { x: center.x - width / 2, y: center.y - height / 2 },
      x: center.x - width / 2,
      y: center.y - height / 2,
      dx: 0,
      dy: 0,
      width,
      height,
      ...(edge.sourcePort === undefined ? {} : { sourcePort: String(edge.sourcePort) }),
      ...(edge.targetPort === undefined ? {} : { targetPort: String(edge.targetPort) }),
      points,
      routing: String(
        edge.properties?.["stately.routing"] ??
          (scenario.algorithm === "layered" ? "orthogonal" : "polyline"),
      ) as EdgeRouting,
      data: transitionData(unlabeled ? "" : String(edge.id)),
    });
  };

  const topLevelIds = (graph.children ?? []).map((node) => String(node.id));
  nodes.push({
    type: "node",
    id: syntheticRootId,
    parentId: null,
    initialNodeId: topLevelIds[0] ?? null,
    label: scenario.name,
    position: { x: 0, y: 0 },
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    width: graph.width ?? 100,
    height: graph.height ?? 100,
    data: stateData(syntheticRootId, null, topLevelIds[0] ?? null),
  });
  for (const child of graph.children ?? []) visitNode(child, syntheticRootId, { x: 0, y: 0 });
  for (const edge of graph.edges ?? []) visitEdge(edge, { x: 0, y: 0 });

  return {
    id: scenario.id,
    mode: "directed",
    type: "directed",
    initialNodeId: syntheticRootId,
    parentId: null,
    direction: "right",
    layout: { status: "complete", direction: "RIGHT" },
    annotations: [],
    nodes,
    edges,
    data: {
      profile: "xstate-v5",
      implementations: { actions: [], guards: [], actors: [], delays: [], tags: [] },
      schemas: {
        context: null,
        events: {},
        input: null,
        output: null,
        actions: {},
        guards: {},
        actors: {},
        tags: {},
        delays: {},
      },
    },
  };
}

function toElkNode(node: DemoNodeSpec): ElkNode {
  return {
    id: node.id,
    ...(node.x === undefined ? {} : { x: node.x }),
    ...(node.y === undefined ? {} : { y: node.y }),
    ...(node.children
      ? { children: node.children.map(toElkNode) }
      : { width: node.width ?? 100, height: node.height ?? 56 }),
    ...(node.ports
      ? {
          ports: node.ports.map((port) => ({
            id: port.name,
            width: port.width ?? 10,
            height: port.height ?? 10,
            labels: port.label ? [{ text: port.label }] : undefined,
            properties: { "stately.direction": port.direction },
          })),
        }
      : {}),
    ...(node.edges
      ? {
          edges: node.edges.map((edge) => ({
            id: edge.id,
            sources: [edge.sourceId],
            targets: [edge.targetId],
            sourcePort: edge.sourcePort,
            targetPort: edge.targetPort,
          })),
        }
      : {}),
  };
}

function toElkInput(scenario: DemoScenario): ElkNode {
  return {
    id: scenario.id,
    layoutOptions: {
      "elk.algorithm": scenario.algorithm,
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "34",
      "elk.layered.spacing.nodeNodeBetweenLayers": "72",
      ...scenario.options,
    },
    children: scenario.nodes.map(toElkNode),
    edges: scenario.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.sourceId],
      targets: [edge.targetId],
      sourcePort: edge.sourcePort,
      targetPort: edge.targetPort,
      ...(scenario.id === "layered-compound"
        ? {}
        : {
            labels: [{ text: edge.id, width: Math.max(48, edge.id.length * 7), height: 20 }],
          }),
    })),
  };
}

function nativeLayout(scenario: DemoScenario): ElkNode {
  const graph = createGraph({
    id: scenario.id,
    nodes: scenario.nodes.map((node) => ({
      id: node.id,
      label: node.label ?? node.id,
      width: node.width ?? 100,
      height: node.height ?? 56,
      x: node.x,
      y: node.y,
      data: null,
      ports: node.ports?.map((port) => ({
        name: port.name,
        direction: port.direction,
        label: port.label,
        width: port.width ?? 10,
        height: port.height ?? 10,
        data: null,
      })),
    })),
    edges: scenario.edges.map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      label: edge.id,
      width: Math.max(48, edge.id.length * 7),
      height: 20,
      data: null,
      sourcePort: edge.sourcePort,
      targetPort: edge.targetPort,
    })),
  });
  const visual: VisualGraph =
    scenario.algorithm === "box"
      ? getBoxLayout(graph)
      : scenario.algorithm === "random"
        ? getRandomLayout(graph, {
            seed: Number(scenario.options?.randomSeed ?? 1729),
          })
        : scenario.algorithm === "fixed"
          ? getFixedLayout(graph, { direction: "right" })
          : scenario.algorithm === "rectpacking"
            ? getRectanglePackingLayout(graph, { padding: 24, spacing: 28 })
            : scenario.algorithm === "sporeCompaction"
              ? getSporeCompactionLayout(graph, { padding: 24, spacing: 28 })
              : scenario.algorithm === "sporeOverlap"
                ? getSporeOverlapRemovalLayout(graph, { padding: 24, spacing: 28 })
                : getLayeredLayout(graph, {
                    direction: "right",
                    padding: 24,
                    spacing: { node: 40, layer: 76 },
                  });
  const maxX = Math.max(0, ...visual.nodes.map((node) => node.x + node.width));
  const maxY = Math.max(0, ...visual.nodes.map((node) => node.y + node.height));
  return {
    id: scenario.id,
    width: maxX + 24,
    height: maxY + 24,
    children: visual.nodes.map((node) => ({
      id: node.id,
      labels: [{ text: node.label ?? node.id }],
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      ports: node.ports?.map((port) => ({
        id: port.name,
        x: port.x,
        y: port.y,
        width: port.width,
        height: port.height,
        labels: port.label ? [{ text: port.label }] : undefined,
        properties: { "stately.direction": port.direction },
      })),
    })),
    edges: visual.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.sourceId],
      targets: [edge.targetId],
      sourcePort: edge.sourcePort,
      targetPort: edge.targetPort,
      properties: { "stately.routing": edge.routing ?? "polyline" },
      sections:
        edge.points && edge.points.length >= 2
          ? [
              {
                startPoint: edge.points[0]!,
                endPoint: edge.points.at(-1)!,
                bendPoints: edge.points.slice(1, -1),
              },
            ]
          : undefined,
    })),
  };
}

async function main(): Promise<void> {
  const oracle = new ELK();
  const corpus = [];
  for (const scenario of demoScenarios) {
    console.log(`Laying out ${scenario.id} with ${scenario.engine}`);
    const layout =
      scenario.engine === "native"
        ? nativeLayout(scenario)
        : ((await oracle.layout(toElkInput(scenario) as never)) as unknown as ElkNode);
    corpus.push({
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      algorithm: scenario.algorithm,
      engine: scenario.engine,
      graph: toEmbedGraph(scenario, layout),
    });
  }
  const outputPath = resolve(rootDir, "demo/generated/corpus.json");
  const serialized = `${JSON.stringify(corpus, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const current = await readFile(outputPath, "utf8");
    if (current !== serialized) {
      throw new Error("Demo corpus is stale. Run pnpm demo:generate.");
    }
    console.log(`Verified ${corpus.length} generated demo graphs`);
    return;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized);
  console.log(`Generated ${corpus.length} demo graphs at ${outputPath}`);
}

await main();
