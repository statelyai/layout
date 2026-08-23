import JSON5 from "json5";
import type { GeometryGraph } from "./geometry-renderer";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as UnknownRecord;
}

function finite(value: unknown, label: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is required`);
  return value;
}

export function parseXGraph(source: string): GeometryGraph {
  return parseXGraphDocument(source).graph;
}

export function parseXGraphDocument(source: string): {
  graph: GeometryGraph;
  needsLayout: boolean;
} {
  const parsed = record(JSON5.parse(source), "XGraph");
  const value =
    "graph" in parsed && !Array.isArray(parsed.nodes) ? record(parsed.graph, "graph") : parsed;
  if (!Array.isArray(value.nodes)) throw new Error("XGraph.nodes must be an array");
  if (!Array.isArray(value.edges)) throw new Error("XGraph.edges must be an array");

  const nodeIds = new Set<string>();
  let needsLayout = false;
  const nodes = value.nodes.map((candidate, index) => {
    const node = record(candidate, `nodes[${index}]`);
    const id = string(node.id, `nodes[${index}].id`);
    if (nodeIds.has(id)) throw new Error(`Duplicate node id: ${id}`);
    nodeIds.add(id);
    const position =
      node.position === undefined ? undefined : record(node.position, `${id}.position`);
    if (
      (node.x === undefined && position?.x === undefined) ||
      (node.y === undefined && position?.y === undefined) ||
      node.width === undefined ||
      node.height === undefined
    ) {
      needsLayout = true;
    }
    const ports =
      node.ports === undefined
        ? undefined
        : (Array.isArray(node.ports)
            ? node.ports
            : (() => {
                throw new Error(`${id}.ports must be an array`);
              })()
          ).map((candidatePort, portIndex) => {
            const port = record(candidatePort, `${id}.ports[${portIndex}]`);
            return {
              ...port,
              name: string(port.name, `${id}.ports[${portIndex}].name`),
              direction:
                port.direction === "in" || port.direction === "out" || port.direction === "inout"
                  ? port.direction
                  : "inout",
              x: finite(port.x, `${id}.${String(port.name)}.x`, 0),
              y: finite(port.y, `${id}.${String(port.name)}.y`, 0),
              width: finite(port.width, `${id}.${String(port.name)}.width`, 10),
              height: finite(port.height, `${id}.${String(port.name)}.height`, 10),
            };
          });
    return {
      ...node,
      id,
      parentId: typeof node.parentId === "string" ? node.parentId : null,
      label: typeof node.label === "string" ? node.label : id,
      x: finite(node.x, `${id}.x`, finite(position?.x, `${id}.position.x`, 0)),
      y: finite(node.y, `${id}.y`, finite(position?.y, `${id}.position.y`, 0)),
      width: finite(node.width, `${id}.width`, 80),
      height: finite(node.height, `${id}.height`, 40),
      ...(ports ? { ports } : {}),
    };
  });

  const edges = value.edges.map((candidate, index) => {
    const edge = record(candidate, `edges[${index}]`);
    const id = string(edge.id, `edges[${index}].id`);
    const sourceId = string(edge.sourceId, `${id}.sourceId`);
    const targetId = string(edge.targetId, `${id}.targetId`);
    if (!nodeIds.has(sourceId))
      throw new Error(`${id}.sourceId references missing node ${sourceId}`);
    if (!nodeIds.has(targetId))
      throw new Error(`${id}.targetId references missing node ${targetId}`);
    const points =
      edge.points === undefined
        ? []
        : (Array.isArray(edge.points)
            ? edge.points
            : (() => {
                throw new Error(`${id}.points must be an array`);
              })()
          ).map((candidatePoint, pointIndex) => {
            const point = record(candidatePoint, `${id}.points[${pointIndex}]`);
            return {
              x: finite(point.x, `${id}.points[${pointIndex}].x`),
              y: finite(point.y, `${id}.points[${pointIndex}].y`),
            };
          });
    if (points.length < 2) needsLayout = true;
    return {
      ...edge,
      id,
      sourceId,
      targetId,
      x: finite(edge.x, `${id}.x`, 0),
      y: finite(edge.y, `${id}.y`, 0),
      width: finite(edge.width, `${id}.width`, 0),
      height: finite(edge.height, `${id}.height`, 0),
      points,
    };
  });

  return { graph: { ...value, nodes, edges } as unknown as GeometryGraph, needsLayout };
}

export function formatXGraph(source: string): string {
  return `${JSON.stringify(JSON5.parse(source), null, 2)}\n`;
}
