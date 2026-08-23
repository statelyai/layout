import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type EdgeRouting, type Point, type PortDirection } from "@statelyai/graph";
import ELK from "elkjs/lib/elk.bundled.js";
import { format } from "oxfmt";
import examplesCatalog from "../demo/generated/elk-live-examples.json";
import type { ElkEdge, ElkNode } from "../src/elkjs/types";

type Example = (typeof examplesCatalog.examples)[number];
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
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  const middle = Math.floor((points.length - 1) / 2);
  const first = points[middle] ?? points[0]!;
  const second = points[middle + 1] ?? first;
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function prepareExampleGraph(input: Example["graph"]): ElkNode {
  const graph = structuredClone(input) as ElkNode;
  const sizeNode = (node: ElkNode): void => {
    for (const child of node.children ?? []) sizeNode(child);
    for (const label of node.labels ?? []) {
      if (!label.width) label.width = Math.max(12, (label.text?.length ?? 0) * 7);
      if (!label.height) label.height = 16;
    }
    for (const port of node.ports ?? []) {
      if (!port.width) port.width = 10;
      if (!port.height) port.height = 10;
      for (const label of port.labels ?? []) {
        if (!label.width) label.width = Math.max(12, (label.text?.length ?? 0) * 7);
        if (!label.height) label.height = 16;
      }
    }
    if ((node.children?.length ?? 0) === 0) {
      const label = node.labels?.[0]?.text ?? String(node.id ?? "");
      if (!node.width) node.width = Math.max(48, label.length * 8 + 24);
      if (!node.height) node.height = 36;
    }
  };
  for (const child of graph.children ?? []) sizeNode(child);
  return graph;
}

function toEmbedGraph(example: Example, graph: ElkNode) {
  const nodes: Array<Record<string, unknown>> = [];
  const edges: Array<Record<string, unknown>> = [];
  const syntheticRootId = `${example.id}:root`;
  const portOwners = new Map<string, string>();
  const portUses = new Map<string, { source: boolean; target: boolean }>();

  const collectPorts = (node: ElkNode): void => {
    for (const port of node.ports ?? []) portOwners.set(String(port.id), String(node.id));
    for (const child of node.children ?? []) collectPorts(child);
  };
  const collectEdgePorts = (edge: ElkEdge): void => {
    for (const source of edge.sources ?? []) {
      const id = String(source);
      if (portOwners.has(id))
        portUses.set(id, { source: true, target: portUses.get(id)?.target ?? false });
    }
    for (const target of edge.targets ?? []) {
      const id = String(target);
      if (portOwners.has(id))
        portUses.set(id, { source: portUses.get(id)?.source ?? false, target: true });
    }
  };
  const collectEdges = (node: ElkNode): void => {
    for (const edge of node.edges ?? []) collectEdgePorts(edge);
    for (const child of node.children ?? []) collectEdges(child);
  };
  collectPorts(graph);
  collectEdges(graph);

  const visitEdge = (edge: ElkEdge, offset: Point): void => {
    const sourceRef = String(edge.sources?.[0] ?? edge.source ?? "");
    const targetRef = String(edge.targets?.[0] ?? edge.target ?? "");
    const sourcePort = portOwners.has(sourceRef) ? sourceRef : undefined;
    const targetPort = portOwners.has(targetRef) ? targetRef : undefined;
    const sourceId = portOwners.get(sourceRef) ?? sourceRef;
    const targetId = portOwners.get(targetRef) ?? targetRef;
    const sections = edge.sections?.length ? edge.sections : [];
    const label = edge.labels?.[0];
    for (const [index, section] of sections.entries()) {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
        (point) => ({ x: point.x + offset.x, y: point.y + offset.y }),
      );
      const center =
        label?.x === undefined
          ? midpoint(points)
          : {
              x: label.x + offset.x + (label.width ?? 0) / 2,
              y: (label.y ?? 0) + offset.y + (label.height ?? 0) / 2,
            };
      const width = index === 0 ? (label?.width ?? 0) : 0;
      const height = index === 0 ? (label?.height ?? 0) : 0;
      edges.push({
        type: "edge",
        id: sections.length > 1 ? `${String(edge.id)}:section-${index + 1}` : String(edge.id),
        sourceId,
        targetId,
        position: { x: center.x - width / 2, y: center.y - height / 2 },
        x: center.x - width / 2,
        y: center.y - height / 2,
        dx: 0,
        dy: 0,
        width,
        height,
        ...(sourcePort ? { sourcePort } : {}),
        ...(targetPort ? { targetPort } : {}),
        points,
        routing: "polyline" satisfies EdgeRouting,
        data: transitionData(index === 0 ? (label?.text ?? "") : ""),
      });
    }
  };

  const visitNode = (node: ElkNode, parentId: string, parentOffset: Point): void => {
    const id = String(node.id);
    const childIds = (node.children ?? []).map((child) => String(child.id));
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const absoluteOffset = { x: parentOffset.x + x, y: parentOffset.y + y };
    const ports: EmbedPort[] = (node.ports ?? []).map((port) => {
      const usage = portUses.get(String(port.id));
      const direction: PortDirection =
        usage?.source && !usage.target ? "out" : usage?.target && !usage.source ? "in" : "inout";
      return {
        name: String(port.id),
        direction,
        ...(port.labels?.[0]?.text ? { label: port.labels[0].text } : {}),
        x: port.x ?? 0,
        y: port.y ?? 0,
        width: port.width ?? 10,
        height: port.height ?? 10,
        data: null,
      };
    });
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
      width: node.width ?? 30,
      height: node.height ?? 30,
      ...(ports.length ? { ports } : {}),
      data: stateData(id, parentId, childIds[0] ?? null),
    });
    for (const child of node.children ?? []) visitNode(child, id, absoluteOffset);
    for (const edge of node.edges ?? []) visitEdge(edge, absoluteOffset);
  };

  const topLevelIds = (graph.children ?? []).map((node) => String(node.id));
  nodes.push({
    type: "node",
    id: syntheticRootId,
    parentId: null,
    initialNodeId: topLevelIds[0] ?? null,
    label: example.name,
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
    id: example.id,
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

async function main(): Promise<void> {
  const oracle = new ELK();
  const corpus = [];
  for (const example of examplesCatalog.examples) {
    console.log(`Laying out ${example.path}`);
    const layout = (await oracle.layout(
      prepareExampleGraph(example.graph) as never,
    )) as unknown as ElkNode;
    corpus.push({
      id: example.id,
      name: example.name,
      description: example.description,
      category: example.category,
      sourcePath: example.path,
      source: example.source,
      engine: "elkjs-oracle" as const,
      graph: toEmbedGraph(example, layout),
    });
  }
  const outputPath = resolve(rootDir, "demo/generated/corpus.json");
  const formatted = await format(outputPath, `${JSON.stringify(corpus, null, 2)}\n`);
  if (formatted.errors.length) throw new Error("Unable to format the demo corpus");
  const serialized = formatted.code;
  if (process.argv.includes("--check")) {
    if ((await readFile(outputPath, "utf8")) !== serialized) {
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
