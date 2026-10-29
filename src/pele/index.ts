import type { Graph, GraphEdge, Point, VisualGraph, VisualNode } from "@statelyai/graph";
import { getNodeSize, type LayoutOptions } from "@statelyai/graph/layout";
import { LayoutError, UnsupportedLayoutError } from "../errors";
import { recordRouteGeometry } from "../routing/layout-cache";
import { routeToPoints } from "../routing/adapters";
import type { Route, RoutePath, RouteSegment } from "../routing/types";
import type { LayoutAlgorithm } from "../types";
import { layered, ledge, lnode } from "./upstream";
import { routePath } from "./upstream-path";

export interface PeleLayoutOptions extends Pick<LayoutOptions, "direction" | "measure"> {
  spacing?: { node?: number; layer?: number; edge?: number };
  padding?: number;
  /** Resolve the complete label box, including descriptions and guards. */
  measureLabel?: (edge: GraphEdge) => { width: number; height: number };
}

export interface PeleVisualGraph<
  N = unknown,
  E = unknown,
  G = unknown,
  P = unknown,
> extends VisualGraph<N, E, G, P> {
  /** Exact curves and label gaps; read with getLayoutRoutes(). */
  compoundRoutes: ReadonlyMap<string, Route>;
}

function dimension(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new LayoutError(`${name} must be finite and nonnegative`, "INVALID_OPTIONS");
  return value;
}

function curve(points: readonly number[]): RoutePath {
  if (points.length < 4) throw new LayoutError("Missing Pele route", "INVALID_GEOMETRY");
  const triples: number[] = [];
  for (let i = 0; i < points.length; i += 2) triples.push(points[i]!, points[i + 1]!, 0);
  const tokens = routePath(triples, undefined, 0, 0, 0, 13).tokens!;
  const start = { x: tokens[2]!, y: tokens[3]! };
  const segments: RouteSegment[] = [];
  for (let i = 4; i < tokens.length;) {
    const command = tokens[i]!;
    const count = tokens[i + 1]!;
    if (command === 76)
      segments.push({ kind: "line", to: { x: tokens[i + 2]!, y: tokens[i + 3]! } });
    else if (command === 67)
      segments.push({
        kind: "cubic",
        control1: { x: tokens[i + 2]!, y: tokens[i + 3]! },
        control2: { x: tokens[i + 4]!, y: tokens[i + 5]! },
        to: { x: tokens[i + 6]!, y: tokens[i + 7]! },
      });
    else throw new LayoutError("Unexpected Pele curve command", "INVALID_GEOMETRY");
    i += count + 2;
  }
  return { start, segments };
}

function mapPath(path: RoutePath, transform: (p: Point) => Point): RoutePath {
  return {
    start: transform(path.start),
    segments: path.segments.map((segment) => {
      if (segment.kind === "line") return { ...segment, to: transform(segment.to) };
      if (segment.kind === "cubic")
        return {
          ...segment,
          to: transform(segment.to),
          control1: transform(segment.control1),
          control2: transform(segment.control2),
        };
      throw new LayoutError("Unexpected Pele segment", "INVALID_GEOMETRY");
    }),
  };
}

/** Pele's independent Sugiyama engine with its coordinated smooth routing. */
export function getPeleLayout<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: PeleLayoutOptions = {},
): PeleVisualGraph<N, E, G, P> {
  if (graph.nodes.some((node) => node.parentId != null))
    throw new UnsupportedLayoutError("Pele layout does not support nested nodes yet");
  if (
    graph.nodes.some((node) => node.ports?.length) ||
    graph.edges.some((edge) => edge.sourcePort !== undefined || edge.targetPort !== undefined)
  )
    throw new UnsupportedLayoutError(
      "Pele layout uses floating node attachments; named ports are not supported yet",
    );
  const direction = options.direction ?? graph.direction ?? "down";
  const horizontal = direction === "left" || direction === "right";
  const padding = dimension(options.padding ?? 20, "padding");
  const spacing = {
    nodeSep: dimension(options.spacing?.node ?? 40, "node spacing"),
    rankSep: dimension(options.spacing?.layer ?? 44, "layer spacing"),
    edgeSep: dimension(options.spacing?.edge ?? 16, "edge spacing"),
    portSep: 16,
    headRoom: 7,
  };
  const labels = graph.edges.map((edge) => {
    const size = options.measureLabel?.(edge) ?? {
      width: edge.width ?? 0,
      height: edge.height ?? 0,
    };
    return {
      width: dimension(size.width, "label width"),
      height: dimension(size.height, "label height"),
    };
  });
  const sizes = graph.nodes.map((node) => {
    const size = getNodeSize(node, options);
    return {
      width: dimension(size.width, "node width"),
      height: dimension(size.height, "node height"),
    };
  });
  const indices = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const loops = graph.nodes.map((node) =>
    graph.edges.flatMap((edge, i) =>
      edge.sourceId === node.id && edge.targetId === node.id ? [i] : [],
    ),
  );
  const reserves = loops.map((list) =>
    list.length === 0
      ? 0
      : 40 +
        (list.length - 1) * 16 +
        Math.max(...list.map((i) => (horizontal ? labels[i]!.height : labels[i]!.width))),
  );
  const nodes = sizes.map((size, i) => {
    const w = horizontal ? size.height : size.width;
    const h = horizontal ? size.width : size.height;
    const loopHeight = loops[i]!.reduce(
      (height, index) => height + (horizontal ? labels[index]!.width : labels[index]!.height) + 8,
      0,
    );
    const node = lnode(w + reserves[i]!, Math.max(h, loopHeight));
    node.span = reserves[i] ? 0 : Math.max(0, w - 24);
    return node;
  });
  const edges = graph.edges.map((edge, i) => {
    const tail = indices.get(edge.sourceId);
    const head = indices.get(edge.targetId);
    if (tail === undefined || head === undefined)
      throw new LayoutError(`Missing endpoint for ${edge.id}`, "INVALID_GRAPH");
    const label = labels[i]!;
    return ledge(
      tail,
      head,
      1,
      horizontal ? label.height : label.width,
      horizontal ? label.width : label.height,
    );
  });
  layered(
    nodes,
    edges.filter((edge) => edge.tail !== edge.head),
    spacing,
  );
  const rotate = (p: Point): Point => {
    switch (direction) {
      case "down":
        return p;
      case "up":
        return { x: p.x, y: -p.y };
      case "right":
        return { x: p.y, y: p.x };
      case "left":
        return { x: -p.y, y: p.x };
    }
  };
  const placedNodes = graph.nodes.map((node, i): VisualNode<N, P> => {
    const position = rotate({ x: nodes[i]!.x - reserves[i]! / 2, y: nodes[i]!.y });
    const size = sizes[i]!;
    return {
      ...node,
      ports: undefined,
      ...size,
      x: position.x - size.width / 2,
      y: position.y - size.height / 2,
    };
  });
  const routes = new Map<string, Route>();
  const placedEdges = graph.edges.map((edge, i) => {
    const e = edges[i]!;
    const label = labels[i]!;
    const from = { kind: "node", nodeId: edge.sourceId } as const;
    const to = { kind: "node", nodeId: edge.targetId } as const;
    let paths: RoutePath[];
    if (e.tail === e.head) {
      const n = nodes[e.tail]!;
      const k = loops[e.tail]!.indexOf(i);
      const x =
        n.x -
        reserves[e.tail]! / 2 +
        (horizontal ? sizes[e.tail]!.height : sizes[e.tail]!.width) / 2;
      const drawnHeight = horizontal ? sizes[e.tail]!.width : sizes[e.tail]!.height;
      const spread = Math.min(drawnHeight / 3, 12 + k * 4);
      const reach = 32 + k * 16;
      paths = [
        {
          start: { x, y: n.y - spread },
          segments: [
            {
              kind: "cubic",
              control1: { x: x + reach, y: n.y - spread * 2 },
              control2: { x: x + reach, y: n.y + spread * 2 },
              to: { x, y: n.y + spread },
            },
          ],
        },
      ];
      e.labelX = x + reach + e.labelW / 2;
      const preceding = loops[e.tail]!.slice(0, k).reduce(
        (height, index) => height + (horizontal ? labels[index]!.width : labels[index]!.height) + 8,
        0,
      );
      const total = loops[e.tail]!.reduce(
        (height, index) => height + (horizontal ? labels[index]!.width : labels[index]!.height) + 8,
        0,
      );
      e.labelY = n.y - total / 2 + preceding + e.labelH / 2;
    } else {
      const points = [...e.points];
      points[0] = points[0]! - reserves[e.tail]! / 2;
      points[points.length - 2] = points[points.length - 2]! - reserves[e.head]! / 2;
      const sourceHeight = horizontal ? sizes[e.tail]!.width : sizes[e.tail]!.height;
      const targetHeight = horizontal ? sizes[e.head]!.width : sizes[e.head]!.height;
      points[1] = nodes[e.tail]!.y + (Math.sign(points[1]! - nodes[e.tail]!.y) * sourceHeight) / 2;
      points[points.length - 1] =
        nodes[e.head]!.y +
        (Math.sign(points[points.length - 1]! - nodes[e.head]!.y) * targetHeight) / 2;
      paths = [curve(points)];
      if (e.labelW > 0 && e.labelH > 0) {
        const top = e.labelY - e.labelH / 2;
        const bottom = e.labelY + e.labelH / 2;
        for (let j = 0; j < points.length - 2; j += 2) {
          const y0 = points[j + 1]!;
          const y1 = points[j + 3]!;
          if (Math.abs(points[j]! - e.labelX) > 0.01 || Math.abs(points[j + 2]! - e.labelX) > 0.01)
            continue;
          if (Math.min(y0, y1) > top + 0.01 || Math.max(y0, y1) < bottom - 0.01) continue;
          const entry = y1 >= y0 ? top : bottom;
          const exit = y1 >= y0 ? bottom : top;
          paths = [
            curve([...points.slice(0, j + 2), e.labelX, entry]),
            curve([e.labelX, exit, ...points.slice(j + 2)]),
          ];
          break;
        }
      }
    }
    const center = rotate({ x: e.labelX, y: e.labelY });
    const bounds = { x: center.x - label.width / 2, y: center.y - label.height / 2, ...label };
    const labelEndpoint = { kind: "label", edgeId: edge.id } as const;
    const route: Route = {
      edgeId: edge.id,
      status: "routed",
      diagnostics: [],
      ...(label.width > 0 && label.height > 0
        ? {
            label: {
              bounds,
              anchor: center,
              tangent: horizontal
                ? { x: direction === "left" ? -1 : 1, y: 0 }
                : { x: 0, y: direction === "up" ? -1 : 1 },
            },
          }
        : {}),
      sections: paths.map((path, index) => ({
        id: `${edge.id}:${index}`,
        from: index === 0 ? from : labelEndpoint,
        to: index === paths.length - 1 ? to : labelEndpoint,
        path: mapPath(path, rotate),
      })),
    };
    routes.set(edge.id, route);
    return { ...edge, ...bounds, routing: "polyline" as const, points: routeToPoints(route) };
  });
  const allPoints: Point[] = [];
  for (const node of placedNodes)
    allPoints.push(node, { x: node.x + node.width, y: node.y + node.height });
  for (const route of routes.values()) {
    if (route.label) allPoints.push(route.label.bounds);
    for (const section of route.sections) {
      allPoints.push(section.path.start);
      for (const segment of section.path.segments) {
        allPoints.push(segment.to);
        if (segment.kind === "cubic") allPoints.push(segment.control1, segment.control2);
      }
    }
  }
  const minimum = allPoints.reduce(
    (min, p) => ({ x: Math.min(min.x, p.x), y: Math.min(min.y, p.y) }),
    { x: 0, y: 0 },
  );
  const offset = { x: padding - minimum.x, y: padding - minimum.y };
  const translate = (p: Point): Point => ({ x: p.x + offset.x, y: p.y + offset.y });
  const finalRoutes = new Map(
    [...routes].map(([id, route]) => [
      id,
      {
        ...route,
        ...(route.label
          ? {
              label: {
                ...route.label,
                bounds: { ...route.label.bounds, ...translate(route.label.bounds) },
                anchor: translate(route.label.anchor),
              },
            }
          : {}),
        sections: route.sections.map((section) => ({
          ...section,
          path: mapPath(section.path, translate),
        })),
      },
    ]),
  );
  const result: PeleVisualGraph<N, E, G, P> = {
    ...graph,
    direction,
    nodes: placedNodes.map((node) => ({ ...node, ...translate(node) })),
    edges: placedEdges.map((edge) => ({
      ...edge,
      ...translate(edge),
      points: edge.points.map(translate),
    })),
    compoundRoutes: finalRoutes,
  };
  recordRouteGeometry(result, finalRoutes);
  return result;
}

export const peleAlgorithm: LayoutAlgorithm<PeleLayoutOptions> = {
  id: "pele",
  capabilities: {
    full: true,
    incremental: false,
    partial: false,
    routeOnly: false,
    hierarchy: false,
    ports: false,
  },
  layout(graph, options, context) {
    context.throwIfAborted();
    return context.measurePhase("pele", () => getPeleLayout(graph, options));
  },
};
