import type { Graph, VisualGraph } from "@statelyai/graph";
import { getNodeSize } from "@statelyai/graph/layout";
import type { CompoundLayoutGeometry, LayoutPadding } from "../compound";
import { LayoutError } from "../errors";
import { routeToPoints, routeToPolylines } from "../routing/adapters";
import { segmentCrossesRect } from "../routing/path";
import { recordRouteGeometry } from "../routing/layout-cache";
import { splitPathAtBounds } from "../routing/path-split";
import { orthogonalRouting } from "../routing/strategies";
import type { EdgeRoutingSettings, Route, RoutePath } from "../routing/types";
import type { LayoutDirection } from "../types";
import type { PeleLayoutOptions, PeleVisualGraph } from "./index";
import { cnode, compoundLayout, type CEdge, type Dir } from "./upstream-compound";
import { curveFromTriples as curve } from "./curve";

const directions: Record<LayoutDirection, Dir> = { down: "TB", up: "BT", right: "LR", left: "RL" };

function dimension(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new LayoutError(`${name} must be finite and nonnegative`, "INVALID_OPTIONS");
  return value;
}

function paddingOf(value: number | Partial<LayoutPadding> | undefined): LayoutPadding {
  const side = (key: keyof LayoutPadding) =>
    dimension(typeof value === "number" ? value : (value?.[key] ?? 20), "padding");
  return { top: side("top"), right: side("right"), bottom: side("bottom"), left: side("left") };
}

type EdgePlacement =
  | { kind: "connection"; index: number }
  | { kind: "loop"; label: number }
  | { kind: "ancestor"; label: number };

export function getCompoundPeleLayout<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: PeleLayoutOptions,
): PeleVisualGraph<N, E, G, P> {
  const direction = options.direction ?? graph.direction ?? "down";
  const indices = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const ancestors = graph.nodes.map((node) => {
    const result = new Set<string>([node.id]);
    let parent = node.parentId;
    while (parent != null) {
      if (result.has(parent)) throw new LayoutError("Cyclic compound hierarchy", "INVALID_GRAPH");
      result.add(parent);
      const index = indices.get(parent);
      if (index === undefined) throw new LayoutError(`Missing parent ${parent}`, "INVALID_GRAPH");
      parent = graph.nodes[index]!.parentId;
    }
    result.delete(node.id);
    return result;
  });
  const parents = new Set(
    graph.nodes.flatMap((node) => (node.parentId == null ? [] : [node.parentId])),
  );
  const configs = graph.nodes.map((node) => options.compound?.(node));
  const insets = configs.map((config) => {
    const inset = paddingOf(config?.padding);
    if (config?.header) {
      const side = config.header.side ?? "top";
      inset[side] += dimension(
        side === "top" || side === "bottom" ? config.header.height : config.header.width,
        "header size",
      );
    }
    return inset;
  });
  const nodes = graph.nodes.map((node, i) => {
    const size = getNodeSize(node, options);
    const config = configs[i];
    const inset = insets[i]!;
    const result = cnode(
      dimension(size.width, "node width"),
      dimension(size.height, "node height"),
      node.parentId == null ? -1 : indices.get(node.parentId)!,
    );
    result.seq = i;
    const parentDirection =
      [...ancestors[i]!]
        .map((id) => configs[indices.get(id)!]?.direction)
        .find((value) => value !== undefined) ?? direction;
    result.span = Math.max(
      0,
      (parentDirection === "left" || parentDirection === "right" ? result.h : result.w) - 24,
    );
    result.isGroup = parents.has(node.id) || config !== undefined;
    result.dir = config?.direction && directions[config.direction];
    result.padLeft = inset.left;
    result.padRight = inset.right;
    result.padTop = inset.top;
    result.padBottom = inset.bottom;
    result.minW = Math.max(
      result.w,
      dimension(config?.header?.width ?? 0, "header width"),
      dimension(config?.minContentSize?.width ?? 0, "minimum content width") +
        inset.left +
        inset.right,
    );
    result.minH = Math.max(
      result.h,
      dimension(config?.header?.height ?? 0, "header height"),
      dimension(config?.minContentSize?.height ?? 0, "minimum content height") +
        inset.top +
        inset.bottom,
    );
    return result;
  });
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
  const edges: CEdge[] = [];
  const addEdge = (src: number, dst: number, width = 0, height = 0): number =>
    edges.push({
      src,
      dst,
      minlen: 1,
      labelW: width,
      labelH: height,
      route: [],
      labelX: 0,
      labelY: 0,
    }) - 1;
  const placements: EdgePlacement[] = graph.edges.map((edge, i) => {
    const src = indices.get(edge.sourceId),
      dst = indices.get(edge.targetId);
    if (src === undefined || dst === undefined)
      throw new LayoutError(`Missing endpoint for ${edge.id}`, "INVALID_GRAPH");
    const label = labels[i]!;
    const ancestor = ancestors[dst]!.has(edge.sourceId) || ancestors[src]!.has(edge.targetId);
    if (src !== dst && !ancestor)
      return { kind: "connection", index: addEdge(src, dst, label.width, label.height) };
    // A label vertex reserves space during placement, including loops and ancestor edges
    // that upstream's compound engine otherwise leaves to its renderer.
    const container = ancestors[dst]!.has(edge.sourceId) ? src : dst;
    const intent = options.edgeAttachment?.(edge);
    const outer = container === src ? intent?.source === "outer" : intent?.target === "outer";
    const owner = src === dst ? nodes[src]!.parent : outer ? nodes[container]!.parent : container;
    const proxy = cnode(Math.max(label.width, 16), Math.max(label.height, 16), owner);
    proxy.seq = graph.nodes.length + i;
    const labelIndex = nodes.push(proxy) - 1;
    if (src === dst) {
      addEdge(src, labelIndex);
      addEdge(labelIndex, dst);
      return { kind: "loop", label: labelIndex };
    }
    if (outer) {
      addEdge(src, labelIndex);
      addEdge(labelIndex, dst);
    } else addEdge(src === container ? labelIndex : src, dst === container ? labelIndex : dst);
    return { kind: "ancestor", label: labelIndex };
  });
  compoundLayout(nodes, edges, directions[direction], {
    nodeSep: dimension(options.spacing?.node ?? 40, "node spacing"),
    rankSep: dimension(options.spacing?.layer ?? 44, "layer spacing"),
    edgeSep: dimension(options.spacing?.edge ?? 16, "edge spacing"),
    portSep: 16,
    headRoom: 7,
  });
  const outerPadding = dimension(options.padding ?? 20, "padding");
  const worldNodes = graph.nodes.map((node, i) => {
    const placed = nodes[i]!;
    return {
      ...node,
      ports: undefined,
      x: placed.x - placed.w / 2 + outerPadding,
      y: placed.y - placed.h / 2 + outerPadding,
      width: placed.w,
      height: placed.h,
    };
  });
  const compoundGeometry = new Map<string, CompoundLayoutGeometry>();
  const placedNodes = worldNodes.map((node, i) => {
    const parent = node.parentId == null ? undefined : worldNodes[indices.get(node.parentId)!];
    const position = { x: node.x - (parent?.x ?? 0), y: node.y - (parent?.y ?? 0) };
    if (nodes[i]!.isGroup) {
      const inset = insets[i]!,
        header = configs[i]?.header,
        side = header?.side ?? "top";
      compoundGeometry.set(node.id, {
        bounds: { ...position, width: node.width, height: node.height },
        content: {
          x: inset.left,
          y: inset.top,
          width: node.width - inset.left - inset.right,
          height: node.height - inset.top - inset.bottom,
        },
        ...(header
          ? {
              header: {
                x: side === "right" ? node.width - header.width : 0,
                y: side === "bottom" ? node.height - header.height : 0,
                width: side === "top" || side === "bottom" ? node.width : header.width,
                height: side === "left" || side === "right" ? node.height : header.height,
              },
            }
          : {}),
      });
    }
    return { ...node, ...position };
  });
  const routes = new Map<string, Route>();
  const routedEdges = graph.edges.map((edge, i) => {
    const placement = placements[i]!;
    const label = labels[i]!;
    const center =
      placement.kind === "connection"
        ? {
            x: edges[placement.index]!.labelX + outerPadding,
            y: edges[placement.index]!.labelY + outerPadding,
          }
        : {
            x: nodes[placement.label]!.x + outerPadding,
            y: nodes[placement.label]!.y + outerPadding,
          };
    const bounds = { x: center.x - label.width / 2, y: center.y - label.height / 2, ...label };
    const convert = (index: number) =>
      curve(edges[index]!.route.map((value, k) => (k % 3 === 2 ? value : value + outerPadding)));
    let paths: RoutePath[] = [];
    if (placement.kind === "connection") {
      const path = convert(placement.index),
        split = splitPathAtBounds(path, bounds);
      paths = split ? [split.before, split.after] : [path];
    }
    if (paths.length) {
      const first = paths[0]!,
        last = paths.at(-1)!;
      const before = first.segments.at(-1)?.to ?? first.start;
      const dx = last.start.x - before.x,
        dy = last.start.y - before.y,
        length = Math.hypot(dx, dy) || 1;
      routes.set(edge.id, {
        edgeId: edge.id,
        status: "routed",
        diagnostics: [],
        ...(label.width && label.height
          ? { label: { bounds, anchor: center, tangent: { x: dx / length, y: dy / length } } }
          : {}),
        sections: paths.map((path, part) => ({
          id: `${edge.id}:${part}`,
          from:
            part === 0
              ? { kind: "node", nodeId: edge.sourceId }
              : { kind: "label", edgeId: edge.id },
          to:
            part === paths.length - 1
              ? { kind: "node", nodeId: edge.targetId }
              : { kind: "label", edgeId: edge.id },
          path,
        })),
      });
    }
    return {
      ...edge,
      ...bounds,
      routing: "polyline" as const,
      points: [] as { x: number; y: number }[],
    };
  });
  const supplemental = graph.edges.filter((edge, i) => {
    const intent = options.edgeAttachment?.(edge);
    const placement = placements[i]!;
    const source = indices.get(edge.sourceId)!,
      target = indices.get(edge.targetId)!;
    const headerIds = new Set([
      ...ancestors[source]!,
      ...ancestors[target]!,
      edge.sourceId,
      edge.targetId,
    ]);
    const route = routes.get(edge.id);
    const crossesHeader =
      route &&
      [...headerIds].some((id) => {
        const header = compoundGeometry.get(id)?.header;
        if (!header) return false;
        const node = worldNodes[indices.get(id)!]!;
        const bounds = {
          x: node.x + header.x + 0.01,
          y: node.y + header.y + 0.01,
          width: Math.max(0, header.width - 0.02),
          height: Math.max(0, header.height - 0.02),
        };
        return routeToPolylines(route, { tolerance: 0.25 }).some((points) =>
          points.some(
            (point, j) =>
              j > 0 && segmentCrossesRect(points[j - 1]!, { kind: "line", to: point }, bounds),
          ),
        );
      });
    return (
      placement.kind === "ancestor" ||
      placement.kind === "loop" ||
      (placement.kind === "connection" &&
        (edges[placement.index]!.src !== source || edges[placement.index]!.dst !== target)) ||
      crossesHeader ||
      intent?.source === "content" ||
      intent?.target === "content"
    );
  });
  if (supplemental.length) {
    const settings: Record<string, EdgeRoutingSettings> = {};
    const selected = new Set(supplemental.map((edge) => edge.id));
    for (const [i, edge] of graph.edges.entries()) {
      const src = indices.get(edge.sourceId)!,
        dst = indices.get(edge.targetId)!;
      const source = compoundGeometry.get(edge.sourceId),
        target = compoundGeometry.get(edge.targetId),
        intent = options.edgeAttachment?.(edge);
      settings[edge.id] = {
        disabled: !selected.has(edge.id),
        ...(!labels[i]!.width || !labels[i]!.height
          ? { policy: { label: { kind: "follow" } } }
          : {}),
        ...(source &&
        edge.sourceId !== edge.targetId &&
        (intent?.source !== undefined || ancestors[dst]!.has(edge.sourceId))
          ? {
              sourceAttachment: {
                bounds:
                  intent?.source === "outer"
                    ? { x: 0, y: 0, width: source.bounds.width, height: source.bounds.height }
                    : source.content,
                facing: intent?.source === "outer" ? "outward" : "inward",
              },
            }
          : {}),
        ...(target &&
        edge.sourceId !== edge.targetId &&
        (intent?.target !== undefined || ancestors[src]!.has(edge.targetId))
          ? {
              targetAttachment: {
                bounds:
                  intent?.target === "outer"
                    ? { x: 0, y: 0, width: target.bounds.width, height: target.bounds.height }
                    : target.content,
                facing: intent?.target === "outer" ? "outward" : "inward",
              },
            }
          : {}),
      };
    }
    const usedIds = new Set(indices.keys());
    const headers = worldNodes.flatMap((node) => {
      const header = compoundGeometry.get(node.id)?.header;
      if (!header) return [];
      let id = `__pele_header_${node.id}`;
      while (usedIds.has(id)) id += "_";
      usedIds.add(id);
      return [
        { ...node, ...header, id, parentId: node.id, x: node.x + header.x, y: node.y + header.y },
      ];
    });
    // Retain Pele routes. Only topology/attachments absent from upstream are completed
    // against fixed geometry using the shared constrained router.
    const snapshot = orthogonalRouting.route(
      { ...graph, nodes: [...worldNodes, ...headers], edges: routedEdges },
      {
        coordinateSpace: "world",
        edges: settings,
        policy: {
          curve: { kind: "bezier" },
          label: { kind: "gap", attachment: "side-midpoint", tangent: { kind: "border-normal" } },
        },
        maxSearchNodes: 40000,
      },
    );
    for (const edge of supplemental) routes.set(edge.id, snapshot.routes.get(edge.id)!);
  }
  for (const edge of routedEdges) edge.points = routeToPoints(routes.get(edge.id)!);
  const result: PeleVisualGraph<N, E, G, P> = {
    ...graph,
    direction,
    nodes: placedNodes,
    edges: routedEdges,
    edgeCoordinateSpace: "world",
    compoundGeometry,
    compoundRoutes: routes,
  };
  recordRouteGeometry(result, routes);
  return result;
}
