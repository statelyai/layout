/*
 * Copyright (c) 2012, 2017, 2020 Kiel University and others.
 * Native adaptation of ELK LabelDummyInserter, LabelSideSelector and LabelDummyRemover (v0.11.0).
 * SPDX-License-Identifier: EPL-2.0
 */
import type { GraphNode, GraphEdge, Point, EntityRect } from "@statelyai/graph";
import type { LayeredPhaseInput, AcyclicOrientation, LayerOrder, EdgeRoutes } from "./types";
import type { LongEdgeExpansion } from "./long-edges";
import { inheritCycleRandom } from "./cycle-random";

type LabelSide = "ABOVE" | "BELOW" | "INLINE";
interface LabelDummy {
  edge: GraphEdge;
  thickness: number;
  spacing: number;
  inline: boolean;
  reversed: boolean;
}
export interface CenterLabelExpansion {
  input: LayeredPhaseInput;
  orientation: AcyclicOrientation;
  segmentIdsByEdgeId: ReadonlyMap<string, readonly string[]>;
  labelDummyIdByEdgeId: ReadonlyMap<string, string>;
  dummyById: ReadonlyMap<string, LabelDummy>;
}

/** Before layering: reserve raw label dimensions, then select sides after crossing minimization. */
export function insertCenterLabelDummies(
  input: LayeredPhaseInput,
  orientation: AcyclicOrientation,
): CenterLabelExpansion {
  const nodes: GraphNode[] = [...input.graph.nodes],
    edges: GraphEdge[] = [];
  const sizes = new Map(input.sizes),
    ids = new Set(nodes.map((n) => n.id)),
    edgeIds = new Set(input.graph.edges.map((e) => e.id));
  const dummyById = new Map<string, LabelDummy>(),
    originals = new Map<string, GraphEdge>();
  const reversed = new Set<string>(),
    segments = new Map<string, string[]>(),
    labels = new Map<string, string>();
  const horizontal = input.direction === "right" || input.direction === "left";
  const forward =
    input.direction === "right"
      ? "EAST"
      : input.direction === "left"
        ? "WEST"
        : input.direction === "down"
          ? "SOUTH"
          : "NORTH";
  const negativeFlow = input.direction === "left" || input.direction === "up";
  const backward = ({ EAST: "WEST", WEST: "EAST", SOUTH: "NORTH", NORTH: "SOUTH" } as const)[
    forward
  ];
  for (const edge of input.graph.edges) {
    const settings = input.edgeSettings?.(edge);
    if (
      edge.sourceId === edge.targetId ||
      !((edge.width ?? 0) > 0 || (edge.height ?? 0) > 0) ||
      (settings?.["edgeLabels.placement"] ?? "CENTER") !== "CENTER"
    ) {
      edges.push(edge);
      segments.set(edge.id, [edge.id]);
      if (orientation.reversedEdgeIds.has(edge.id)) reversed.add(edge.id);
      continue;
    }
    let id = `__layout_dummy:label:${edge.id}`;
    while (ids.has(id)) id += ":";
    ids.add(id);
    const inline = settings?.["edgeLabels.inline"] === true;
    const thickness = Math.max(0, Number(settings?.["edge.thickness"] ?? 1));
    const spacing = Number(input.settings["spacing.edgeLabel"] ?? 2);
    // ELK stacks horizontal label heights on the initial edge thickness,
    // but takes the maximum for vertical labels before adding edge spacing.
    const width = horizontal
      ? (edge.width ?? 0)
      : Math.max(edge.width ?? 0, thickness) + spacing + thickness;
    const height = (edge.height ?? 0) + (horizontal ? spacing + 2 * thickness : 0);
    const anchor = Math.floor(thickness / 2);
    const rect = { width, height };
    const node: GraphNode = {
      type: "node",
      id,
      data: undefined,
      ...rect,
      ports: [
        {
          name: "input",
          direction: "in",
          x: horizontal ? (negativeFlow ? width : 0) : anchor,
          y: horizontal ? anchor : negativeFlow ? height : 0,
          width: 0,
          height: 0,
          data: undefined,
        },
        {
          name: "output",
          direction: "out",
          x: horizontal ? (negativeFlow ? 0 : width) : anchor,
          y: horizontal ? anchor : negativeFlow ? 0 : height,
          width: 0,
          height: 0,
          data: undefined,
        },
      ],
    };
    nodes.push(node);
    sizes.set(id, rect);
    labels.set(edge.id, id);
    dummyById.set(id, {
      edge,
      thickness,
      spacing,
      inline,
      reversed: orientation.reversedEdgeIds.has(edge.id),
    });
    const chain = [edge.sourceId, id, edge.targetId],
      partIds: string[] = [];
    const rev = orientation.reversedEdgeIds.has(edge.id);
    for (let i = 0; i < 2; i++) {
      let partId = `${edge.id}::label:${i}`;
      while (edgeIds.has(partId)) partId += ":";
      edgeIds.add(partId);
      partIds.push(partId);
      const part: GraphEdge = {
        ...edge,
        id: partId,
        sourceId: chain[i]!,
        targetId: chain[i + 1]!,
        sourcePort: i === 0 ? edge.sourcePort : rev ? "input" : "output",
        targetPort: i === 1 ? edge.targetPort : rev ? "output" : "input",
        width: 0,
        height: 0,
        points: undefined,
      };
      edges.push(part);
      originals.set(partId, edge);
      if (rev) reversed.add(partId);
    }
    segments.set(edge.id, partIds);
  }
  const prepared = labels.size
    ? inheritCycleRandom(input, {
        ...input,
        graph: { ...input.graph, nodes, edges },
        sizes,
        nodeSettings: (n: GraphNode) =>
          dummyById.has(n.id) ? { portConstraints: "FIXED_POS" as const } : input.nodeSettings?.(n),
        portSettings: (p: NonNullable<GraphNode["ports"]>[number], n: GraphNode) =>
          dummyById.has(n.id)
            ? { "port.side": p.name === "input" ? backward : forward }
            : input.portSettings?.(p, n),
        edgeSettings: (e: GraphEdge) => input.edgeSettings?.(originals.get(e.id) ?? e),
      })
    : input;
  return {
    input: prepared,
    orientation: labels.size ? { reversedEdgeIds: reversed } : orientation,
    segmentIdsByEdgeId: segments,
    labelDummyIdByEdgeId: labels,
    dummyById,
  };
}

/** Before node placement: reproduce direction and consecutive-dummy label-side rules. */
export function selectCenterLabelSides(
  expansion: LongEdgeExpansion,
  labels: CenterLabelExpansion,
  order: LayerOrder,
): { expansion: LongEdgeExpansion; sides: ReadonlyMap<string, LabelSide> } {
  const input = expansion.input;
  const mode = String(input.settings["edgeLabels.sideSelection"] ?? "SMART_DOWN");
  const defaultSide: LabelSide = mode.endsWith("_UP") ? "ABOVE" : "BELOW";
  const sides = new Map<string, LabelSide>();
  const set = (id: string, side: LabelSide) => {
    const info = labels.dummyById.get(id);
    if (info) sides.set(id, info.inline ? "INLINE" : side);
  };
  const sameEndpoints = (first: string, second: string) => {
    const a = labels.dummyById.get(first),
      b = labels.dummyById.get(second);
    if (!a || !b) return false;
    const source = (info: LabelDummy) => (info.reversed ? info.edge.targetId : info.edge.sourceId);
    const target = (info: LabelDummy) => (info.reversed ? info.edge.sourceId : info.edge.targetId);
    return source(a) === source(b) && target(a) === target(b);
  };
  for (const layer of order.layers) {
    if (!mode.startsWith("SMART_")) {
      for (const id of layer) {
        const info = labels.dummyById.get(id);
        if (info)
          set(
            id,
            mode.startsWith("DIRECTION_") && info.reversed
              ? defaultSide === "ABOVE"
                ? "BELOW"
                : "ABOVE"
              : defaultSide,
          );
      }
      continue;
    }
    const applyRun = (run: string[], top: boolean, bottom: boolean) => {
      const labelIds = run.filter((id) => labels.dummyById.has(id));
      if (
        top &&
        (!bottom || run.length > 1) &&
        labelIds.length === 1 &&
        labels.dummyById.has(run[0]!)
      )
        set(run[0]!, "ABOVE");
      else if (
        bottom &&
        (!top || run.length > 1) &&
        labelIds.length === 1 &&
        labels.dummyById.has(run.at(-1)!)
      )
        set(run.at(-1)!, "BELOW");
      else if (run.length === 2) {
        set(run[0]!, "ABOVE");
        set(run[1]!, "BELOW");
      } else {
        let group: string[] = [];
        const flush = () => {
          if (group.length === 2) {
            set(group[0]!, "ABOVE");
            set(group[1]!, "BELOW");
          } else for (const id of group) set(id, defaultSide);
          group = [];
        };
        for (const id of run) {
          if (group.length && !sameEndpoints(group.at(-1)!, id)) flush();
          group.push(id);
        }
        flush();
      }
    };
    let run: string[] = [],
      top = true;
    for (const id of layer) {
      if (id.startsWith("__layout_dummy:")) run.push(id);
      else {
        if (run.length) applyRun(run, top, false);
        run = [];
        top = false;
      }
    }
    if (run.length) applyRun(run, top, true);
  }
  const horizontal = input.direction === "right" || input.direction === "left";
  const sizes = new Map(input.sizes);
  const nodes = input.graph.nodes.map((node) => {
    const info = labels.dummyById.get(node.id),
      side = sides.get(node.id);
    if (!info || !side) return node;
    const original = sizes.get(node.id)!;
    const cross =
      (horizontal ? original.height : original.width) -
      (side === "INLINE" ? info.spacing + info.thickness : 0);
    const physicalSide =
      !horizontal && side !== "INLINE" ? (side === "ABOVE" ? "BELOW" : "ABOVE") : side;
    const anchor =
      physicalSide === "INLINE"
        ? Math.ceil(cross) / 2
        : physicalSide === "ABOVE"
          ? cross - Math.ceil(info.thickness / 2)
          : Math.floor(info.thickness / 2);
    const rect = horizontal ? { ...original, height: cross } : { ...original, width: cross };
    sizes.set(node.id, rect);
    return {
      ...node,
      ...rect,
      ports: node.ports?.map((port) => ({
        ...port,
        x: horizontal ? port.x : anchor,
        y: horizontal ? anchor : port.y,
      })),
    };
  });
  return {
    expansion: {
      ...expansion,
      input: inheritCycleRandom(input, { ...input, graph: { ...input.graph, nodes }, sizes }),
    },
    sides,
  };
}

export function composeCenterLabelExpansion(
  labels: CenterLabelExpansion,
  expanded: LongEdgeExpansion,
): LongEdgeExpansion {
  return {
    ...expanded,
    segmentIdsByEdgeId: new Map(
      [...labels.segmentIdsByEdgeId].map(([id, parts]) => [
        id,
        parts.flatMap((p) => expanded.segmentIdsByEdgeId.get(p) ?? [p]),
      ]),
    ),
    labelDummyIdByEdgeId: new Map([
      ...expanded.labelDummyIdByEdgeId,
      ...labels.labelDummyIdByEdgeId,
    ]),
  };
}

/** LABEL junctions do not introduce auxiliary orthogonal bend points. */
export function removeCenterLabelJunctions(
  routes: EdgeRoutes,
  expansion: LongEdgeExpansion,
  labels: ReadonlyMap<string, string>,
  routing: string,
): EdgeRoutes {
  if (routing !== "ORTHOGONAL" || !labels.size) return routes;
  const horizontal = expansion.input.direction === "right" || expansion.input.direction === "left";
  const cross = (point: Point) => (horizontal ? point.y : point.x);
  const ids = new Set<string>();
  for (const id of labels.values()) {
    const neighbors: Point[] = [];
    for (const edge of expansion.input.graph.edges) {
      const route = routes.pointsByEdgeId.get(edge.id);
      if (!route || route.length < 2) continue;
      if (edge.sourceId === id) neighbors.push(route[1]!);
      if (edge.targetId === id) neighbors.push(route.at(-2)!);
    }
    // Remove straight synthetic junctions only. A compacted track can still
    // turn at a label port; deleting that corner would create a diagonal.
    if (neighbors.length === 2 && cross(neighbors[0]!) === cross(neighbors[1]!)) ids.add(id);
  }
  const points = new Map(routes.pointsByEdgeId);
  for (const edge of expansion.input.graph.edges) {
    const route = points.get(edge.id);
    if (!route) continue;
    const first = ids.has(edge.sourceId) ? 1 : 0;
    const last = route.length - (ids.has(edge.targetId) ? 1 : 0);
    if (first || last !== route.length) points.set(edge.id, route.slice(first, last));
  }
  return { ...routes, pointsByEdgeId: points };
}

export function centerLabelPosition(
  rect: EntityRect,
  info: LabelDummy,
  side: LabelSide | undefined,
  direction: string,
): Point {
  const horizontal = direction === "right" || direction === "left";
  const crossOffset = side === "BELOW" ? info.thickness + info.spacing : 0;
  return horizontal
    ? { x: rect.x + (rect.width - (info.edge.width ?? 0)) / 2, y: rect.y + crossOffset }
    : {
        x:
          rect.x +
          (side === "INLINE"
            ? (rect.width - (info.edge.width ?? 0)) / 2
            : side === "ABOVE"
              ? info.thickness + info.spacing
              : 0),
        y: rect.y + (info.inline ? (rect.height - (info.edge.height ?? 0)) / 2 : 0),
      };
}
