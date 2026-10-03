/*******************************************************************************
 * Copyright (c) 2010, 2020 Kiel University and others.
 * Native adaptation of ELK orthogonal routing junction generation.
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { GraphEdge, GraphNode, GraphPort, Point } from "@statelyai/graph";
import type { AcyclicOrientation, LayeredPhaseInput } from "./types";
import type { OrthogonalSegment } from "./orthogonal-segments";
import { createOrthogonalHypersegments, type OrthogonalPort } from "./orthogonal-hypersegments";
import { isMergedHyperedgeDummy } from "./hyperedge-dummy-merger";
export type OrthogonalJunctionGroup = Array<{
  edgeId: string;
  reversed: boolean;
  segment: OrthogonalSegment;
  partner?: OrthogonalSegment;
  sourceValue: number;
  targetValue: number;
}>;
/** Emit branches from routing-port spans, before endpoint restoration and compaction. */
export function orthogonalJunctionPoints(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
  raw: ReadonlyMap<string, { source: Point; target: Point }>,
  flowLayerByNodeId: ReadonlyMap<string, number>,
  junctionGroups: OrthogonalJunctionGroup[],
  pointsByEdgeId: ReadonlyMap<string, readonly Point[]>,
  orthogonalTrackByEdgeId: ReadonlyMap<string, number>,
  orthogonalDetourByEdgeId: ReadonlyMap<
    string,
    { firstTrack: number; secondTrack: number; crossover: number }
  >,
  portDirection: (node: GraphNode, port: GraphPort) => GraphPort["direction"],
): ReadonlyMap<string, readonly Point[]> {
  const horizontal = input.direction === "left" || input.direction === "right";
  const increasing = input.direction === "right" || input.direction === "down";
  const nodeById = new Map(input.graph.nodes.map((n) => [n.id, n]));
  const junctionPointsByEdgeId = new Map<string, readonly Point[]>();

  type BoundaryEdge = {
    edge: GraphEdge;
    source: string;
    target: string;
    sourceValue: number;
    targetValue: number;
    inLayer: boolean;
  };
  const boundaries = new Map<
    number,
    { ports: Map<string, OrthogonalPort>; edges: BoundaryEdge[] }
  >();
  const face = (edge: GraphEdge, source: boolean) => {
    const id = source ? edge.sourceId : edge.targetId;
    const node = nodeById.get(id)!;
    const name = source ? edge.sourcePort : edge.targetPort;
    const port = node.ports?.find((p) => p.name === name);
    if (node.id.startsWith("__layout_dummy:") && (name === "input" || name === "output"))
      return horizontal
        ? (name === "output") === increasing
          ? "EAST"
          : "WEST"
        : (name === "output") === increasing
          ? "SOUTH"
          : "NORTH";
    const side = port && input.portSettings?.(port, node)?.["port.side"];
    if (side && side !== "UNDEFINED") return side;
    const physicalSource = source !== orientation.reversedEdgeIds.has(edge.id);
    const outgoing = port
      ? (portDirection(node, port) ?? port.direction) === "out"
      : physicalSource;
    return horizontal
      ? outgoing === increasing
        ? "EAST"
        : "WEST"
      : outgoing === increasing
        ? "SOUTH"
        : "NORTH";
  };
  for (const edge of input.graph.edges) {
    const from = flowLayerByNodeId.get(edge.sourceId),
      to = flowLayerByNodeId.get(edge.targetId);
    const endpoints = raw.get(edge.id);
    if (from === undefined || to === undefined || !endpoints || edge.sourceId === edge.targetId)
      continue;
    const firstFace = face(edge, true),
      lastFace = face(edge, false);
    const positiveFace = horizontal ? "EAST" : "SOUTH",
      negativeFace = horizontal ? "WEST" : "NORTH";
    if (
      ![positiveFace, negativeFace].includes(String(firstFace)) ||
      ![positiveFace, negativeFace].includes(String(lastFace))
    )
      continue;
    const firstBoundary = from - (firstFace === negativeFace ? 1 : 0),
      lastBoundary = to - (lastFace === negativeFace ? 1 : 0);
    if (firstBoundary !== lastBoundary) continue;
    let boundary = boundaries.get(firstBoundary);
    if (!boundary) boundaries.set(firstBoundary, (boundary = { ports: new Map(), edges: [] }));
    const key = (source: boolean) => {
      const id = source ? edge.sourceId : edge.targetId,
        name = source ? edge.sourcePort : edge.targetPort;
      if (isMergedHyperedgeDummy(input, id))
        return JSON.stringify([id, source ? firstFace : lastFace]);
      return name !== undefined ? JSON.stringify([id, name]) : JSON.stringify([edge.id, source]);
    };
    for (const source of [true, false]) {
      const id = key(source),
        point = source ? endpoints.source : endpoints.target;
      if (!boundary.ports.has(id))
        boundary.ports.set(id, {
          id,
          side:
            ((source ? firstFace : lastFace) === positiveFace) === increasing ? "source" : "target",
          position: horizontal ? point.y : point.x,
        });
    }
    const reversed = orientation.reversedEdgeIds.has(edge.id);
    const source = key(!reversed),
      target = key(reversed);
    boundary.edges.push({
      edge,
      source,
      target,
      sourceValue: boundary.ports.get(source)!.position,
      targetValue: boundary.ports.get(target)!.position,
      inLayer: from === to,
    });
  }
  const inLayerGroups: typeof junctionGroups = [];
  for (const [, boundary] of [...boundaries].sort(([a], [b]) => (increasing ? a - b : b - a))) {
    if (!boundary.edges.some((e) => e.inLayer)) continue;
    const ports = [...boundary.ports.values()].sort((a, b) => a.position - b.position);
    const grouped = createOrthogonalHypersegments(ports, boundary.edges);
    const records: (typeof junctionGroups)[number] = [];
    for (const group of grouped.segments)
      for (const port of group.ports) {
        const members = boundary.edges.filter((e) => e.source === port && e.inLayer);
        for (const record of members) {
          const values = [...group.incoming, ...group.outgoing];
          records.push({
            edgeId: record.edge.id,
            reversed: orientation.reversedEdgeIds.has(record.edge.id),
            sourceValue: record.sourceValue,
            targetValue: record.targetValue,
            segment: { ...group, start: Math.min(...values), end: Math.max(...values), slot: 0 },
          });
        }
      }
    inLayerGroups.push(records);
  }
  junctionGroups = [...inLayerGroups, ...junctionGroups];
  const createdJunctions = new Set<string>();
  for (const group of junctionGroups) {
    for (const { edgeId, reversed, segment, partner, sourceValue, targetValue } of group) {
      const physical = [...(pointsByEdgeId.get(edgeId) ?? [])];
      if (reversed) physical.reverse();
      const bends = Math.abs(segment.start - segment.end) < 1e-3 ? [] : physical.slice(1, -1);
      const junctions: Point[] = [];
      for (const [index, point] of bends.entries()) {
        const track = orthogonalTrackByEdgeId.get(edgeId);
        const detour = orthogonalDetourByEdgeId.get(edgeId);
        const flow = horizontal ? point.x : point.y;
        if (track !== undefined && Math.abs(flow - track) > 1e-9) continue;
        if (
          detour &&
          Math.abs(flow - detour.firstTrack) > 1e-9 &&
          Math.abs(flow - detour.secondTrack) > 1e-9
        )
          continue;
        const current = partner && index >= 2 ? partner : segment;
        const value =
          index === 0
            ? sourceValue
            : index === bends.length - 1
              ? targetValue
              : segment.outgoing[0]!;
        const boundary =
          current.incoming.length > 0 &&
          current.outgoing.length > 0 &&
          ((Math.abs(value - current.incoming[0]!) < 1e-3 &&
            Math.abs(value - current.outgoing[0]!) < 1e-3) ||
            (Math.abs(value - current.incoming.at(-1)!) < 1e-3 &&
              Math.abs(value - current.outgoing.at(-1)!) < 1e-3));
        const key = `${point.x}:${point.y}`;
        if (
          !createdJunctions.has(key) &&
          ((value > current.start && value < current.end) || boundary)
        ) {
          junctions.push(point);
          createdJunctions.add(key);
        }
      }
      junctionPointsByEdgeId.set(edgeId, junctions);
    }
  }

  return junctionPointsByEdgeId;
}
