import type { GraphNode, VisualGraph } from "@statelyai/graph";
import type { LayeredLayoutOptions } from "./types";
import { routeCrosses } from "../authoring/routing";
import {
  orthogonalRouting,
  routeToPoints,
  type EdgeRoutingSettings,
  type RouteSide,
  type RouteEndpoint,
} from "../routing";
import { recordRouteGeometry } from "../routing/layout-cache";

/** Keep valid layered tracks; repair infeasible port leads and obstacle crossings. */
export function repairFlatRouting<N, E, G, P>(
  graph: VisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
): VisualGraph<N, E, G, P> {
  if (
    graph.nodes.some((n) => n.parentId != null) ||
    options.settings?.noLayout ||
    (options.settings?.edgeRouting ?? "ORTHOGONAL") !== "ORTHOGONAL" ||
    options.strategies?.routeEdges
  )
    return graph;
  const overlaps = (
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  // Leave room for port centers outside the node and their 9px exit leads.
  const portClearance = (n: (typeof graph.nodes)[number]) => {
    const reach = Math.max(
      0,
      ...(n.ports ?? []).flatMap((p) => [
        -(p.x ?? 0) - (p.width ?? 0) / 2,
        -(p.y ?? 0) - (p.height ?? 0) / 2,
        (p.x ?? 0) + (p.width ?? 0) / 2 - n.width,
        (p.y ?? 0) + (p.height ?? 0) / 2 - n.height,
      ]),
    );
    const margin = 9 + reach;
    return {
      x: n.x - margin,
      y: n.y - margin,
      width: n.width + 2 * margin,
      height: n.height + 2 * margin,
    };
  };
  const labels = graph.edges.filter((e) => e.width > 0 && e.height > 0);
  const labelCollision = labels.some(
    (e, i) =>
      graph.nodes.some((n) => overlaps(e, portClearance(n))) ||
      labels.slice(i + 1).some((other) => overlaps(e, other)),
  );
  const routingDefect = graph.edges.some((edge) => {
    if (
      graph.nodes.some((node) => routeCrosses(edge.points, node)) ||
      labels.some((label) => label.id !== edge.id && routeCrosses(edge.points, label))
    )
      return true;
    const points = edge.points ?? [];
    const loopNode =
      edge.sourceId === edge.targetId ? graph.nodes.find((n) => n.id === edge.sourceId) : undefined;
    const terminals = [
      ...(loopNode
        ? [
            {
              x: loopNode.x - 12,
              y: loopNode.y - 12,
              width: loopNode.width + 24,
              height: loopNode.height + 24,
            },
          ]
        : []),
      ...(edge.width > 0 && edge.height > 0 ? [edge] : []),
    ];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!;
      if (Math.abs(a.x - b.x) > 1e-8 && Math.abs(a.y - b.y) > 1e-8) return true;
      for (let j = i + 1; j < points.length; j++) {
        const c = points[j - 1]!,
          d = points[j]!;
        const horizontal =
          Math.abs(a.y - b.y) < 1e-8 && Math.abs(c.y - d.y) < 1e-8 && Math.abs(a.y - c.y) < 1e-8;
        const vertical =
          Math.abs(a.x - b.x) < 1e-8 && Math.abs(c.x - d.x) < 1e-8 && Math.abs(a.x - c.x) < 1e-8;
        if (!horizontal && !vertical) continue;
        const axis = horizontal ? "x" : "y",
          fixed = horizontal ? "y" : "x";
        const lo = Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
        const hi = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]));
        if (hi - lo < 1e-8) continue;
        let intervals = [[lo, hi]];
        for (const rect of terminals) {
          const span = horizontal ? rect.height : rect.width;
          if (a[fixed] < rect[fixed] || a[fixed] > rect[fixed] + span) continue;
          const lower = rect[axis],
            upper = lower + (horizontal ? rect.width : rect.height);
          intervals = intervals
            .flatMap(([start, end]) => [
              [start!, Math.min(end!, lower)],
              [Math.max(start!, upper), end!],
            ])
            .filter(([start, end]) => end! - start! > 1e-8);
        }
        if (intervals.length) return true;
      }
    }
    return false;
  });
  if (!labelCollision && !routingDefect) return graph;
  const edges = graph.edges.map((edge) => ({ ...edge }));
  // The original track may put an exterior label partly inside a node. Move
  // only colliding labels before routing their actual boundary connections.
  for (const edge of edges.filter((e) => e.width > 0 && e.height > 0)) {
    const obstacles = [
      ...graph.nodes.map(portClearance),
      ...edges.filter((e) => e.id !== edge.id && e.width > 0 && e.height > 0),
    ];
    if (!obstacles.some((rect) => overlaps(edge, rect))) continue;
    const xs = [edge.x, ...obstacles.flatMap((r) => [r.x - edge.width - 8, r.x + r.width + 8])];
    const ys = [edge.y, ...obstacles.flatMap((r) => [r.y - edge.height - 8, r.y + r.height + 8])];
    let best: { x: number; y: number; distance: number } | undefined;
    for (const x of xs)
      for (const y of ys) {
        const distance = Math.abs(x - edge.x) + Math.abs(y - edge.y);
        if (best && distance >= best.distance) continue;
        if (!obstacles.some((rect) => overlaps({ ...edge, x, y }, rect))) best = { x, y, distance };
      }
    if (best) {
      edge.x = best.x;
      edge.y = best.y;
    }
  }
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const fixedImplicitSide = (
    nodeId: string,
    portName: string | undefined,
    point: { x: number; y: number } | undefined,
    away: { x: number; y: number } | undefined,
  ): RouteSide | undefined => {
    const node = nodes.get(nodeId);
    if (
      !node ||
      portName !== undefined ||
      !point ||
      !["FIXED_SIDE", "FIXED_ORDER", "FIXED_RATIO", "FIXED_POS"].includes(
        String(options.nodeSettings?.(node)?.portConstraints),
      )
    )
      return undefined;
    // Fixed implicit attachments are assigned before reversal. Repair must
    // preserve the initial face, including special self-loop attachments.
    const faces: [RouteSide, number][] = [
      ["left", Math.abs(point.x - node.x)],
      ["right", Math.abs(point.x - node.x - node.width)],
      ["top", Math.abs(point.y - node.y)],
      ["bottom", Math.abs(point.y - node.y - node.height)],
    ];
    const leadSide: RouteSide | undefined =
      away && (Math.abs(away.x - point.x) > 1e-8 || Math.abs(away.y - point.y) > 1e-8)
        ? Math.abs(away.x - point.x) >= Math.abs(away.y - point.y)
          ? away.x > point.x
            ? "right"
            : "left"
          : away.y > point.y
            ? "bottom"
            : "top"
        : undefined;
    faces.sort((a, b) => a[1] - b[1] || Number(b[0] === leadSide) - Number(a[0] === leadSide));
    return faces[0]![1] < 1e-6 ? faces[0]![0] : undefined;
  };
  const attachments: Record<string, EdgeRoutingSettings> = Object.fromEntries(
    graph.edges.map((edge) => [
      edge.id,
      {
        sourceSide: fixedImplicitSide(
          edge.sourceId,
          edge.sourcePort,
          edge.points?.[0],
          edge.points?.[1],
        ),
        targetSide: fixedImplicitSide(
          edge.targetId,
          edge.targetPort,
          edge.points?.at(-1),
          edge.points?.at(-2),
        ),
      },
    ]),
  );
  const routingNodes = new Map<string, GraphNode>(graph.nodes.map((node) => [node.id, node]));
  const syntheticPorts = new Map<string, Set<string>>();
  const attach = (
    edgeId: string,
    nodeId: string,
    portName: string | undefined,
    point: { x: number; y: number } | undefined,
    source: boolean,
  ) => {
    const side = source ? attachments[edgeId]?.sourceSide : attachments[edgeId]?.targetSide;
    if (
      !side ||
      !point ||
      !["FIXED_POS", "FIXED_RATIO"].includes(
        String(options.nodeSettings?.(nodes.get(nodeId)!)?.portConstraints),
      )
    )
      return portName;
    const node = routingNodes.get(nodeId)!;
    let name = `__layout_implicit:${edgeId}:${source ? "source" : "target"}`;
    while (node.ports?.some((p) => p.name === name)) name += ":";
    const names = syntheticPorts.get(nodeId) ?? new Set<string>();
    names.add(name);
    syntheticPorts.set(nodeId, names);
    routingNodes.set(nodeId, {
      ...node,
      ports: [
        ...(node.ports ?? []),
        {
          name,
          data: undefined,
          direction: "inout",
          x: point.x - node.x!,
          y: point.y - node.y!,
          width: 0,
          height: 0,
        },
      ],
    });
    return name;
  };
  const routingEdges = edges.map((edge) => ({
    ...edge,
    sourcePort: attach(edge.id, edge.sourceId, edge.sourcePort, edge.points?.[0], true),
    targetPort: attach(edge.id, edge.targetId, edge.targetPort, edge.points?.at(-1), false),
  }));
  const snapshot = orthogonalRouting.route(
    { ...graph, nodes: [...routingNodes.values()], edges: routingEdges },
    { coordinateSpace: "world", maxSearchNodes: 40000, edges: attachments },
  );
  const authoredEndpoint = (endpoint: RouteEndpoint): RouteEndpoint => {
    if (
      endpoint.kind !== "node" ||
      endpoint.port === undefined ||
      !syntheticPorts.get(endpoint.nodeId)?.has(endpoint.port)
    )
      return endpoint;
    const { port: _privatePort, ...authored } = endpoint;
    return authored;
  };
  const routes = new Map(
    [...snapshot.routes].map(([id, route]) => [
      id,
      {
        ...route,
        sections: route.sections.map((section) => ({
          ...section,
          from: authoredEndpoint(section.from),
          to: authoredEndpoint(section.to),
        })),
      },
    ]),
  );
  const result = {
    ...graph,
    edges: edges.map((edge) => ({
      ...edge,
      points: routeToPoints(routes.get(edge.id)!),
    })),
    compoundRoutes: routes,
  };
  recordRouteGeometry(result, routes);
  return result;
}
