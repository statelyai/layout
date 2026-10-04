import { orthogonalRouting, routeToPolylines } from "../routing";
import { recordRouteGeometry } from "../routing/layout-cache";
import type { EdgeRoutingSettings, Route } from "../routing/types";
import type {
  EntityRect,
  Graph,
  GraphEdge,
  Point,
  VisualGraph,
  VisualNode,
} from "@statelyai/graph";
import type { CompoundLayoutGeometry, LayeredLayoutOptions, LayoutPadding } from "./types";
import { placePorts } from "./strategies";

export type CompoundVisualGraph<N = unknown, E = unknown, G = unknown, P = unknown> = VisualGraph<
  N,
  E,
  G,
  P
> & {
  /** Nodes remain parent-relative; edge rectangles and points are world-space. */
  readonly edgeCoordinateSpace?: "world";
  readonly compoundGeometry: ReadonlyMap<string, CompoundLayoutGeometry>;
  /** World-space route sections preserve label gaps and fallback diagnostics. */
  readonly compoundRoutes: ReadonlyMap<string, Route>;
};

const paddingOf = (value: number | Partial<LayoutPadding> | undefined): LayoutPadding => ({
  top: typeof value === "number" ? value : (value?.top ?? 12),
  right: typeof value === "number" ? value : (value?.right ?? 12),
  bottom: typeof value === "number" ? value : (value?.bottom ?? 12),
  left: typeof value === "number" ? value : (value?.left ?? 12),
});

/** Solve each scope's occupied envelope bottom-up; never repair returned sibling positions. */
export function layoutCompounds<N, E, G, P>(
  graph: Graph<N, E, G, P> | VisualGraph<N, E, G, P>,
  options: LayeredLayoutOptions,
  flat: (graph: Graph<N, E, G, P>, options: LayeredLayoutOptions) => VisualGraph<N, E, G, P>,
): CompoundVisualGraph<N, E, G, P> {
  const nodes = graph.nodes.map((node) => {
    const size = options.measure?.(node);
    return {
      ...node,
      width: size?.width ?? node.width ?? 0,
      height: size?.height ?? node.height ?? 0,
    };
  }) as VisualNode<N, P>[];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ancestry = (id: string): (string | null)[] => {
    const chain: (string | null)[] = [];
    let current: string | null = id;
    while (current != null) {
      if (chain.includes(current)) throw new Error(`Cyclic compound hierarchy at ${current}`);
      chain.push(current);
      current = byId.get(current)?.parentId ?? null;
    }
    return [...chain, null];
  };
  const branch = (id: string, scope: string | null): string => {
    const chain = ancestry(id);
    return chain[chain.indexOf(scope) - 1] as string;
  };
  const owner = (edge: GraphEdge): string | null => {
    const a = ancestry(edge.sourceId),
      b = ancestry(edge.targetId);
    if (edge.sourceId !== edge.targetId && b.includes(edge.sourceId)) return edge.sourceId;
    if (edge.sourceId !== edge.targetId && a.includes(edge.targetId)) return edge.targetId;
    return a.slice(1).find((id) => b.slice(1).includes(id)) ?? null;
  };
  const owned = new Map<string | null, GraphEdge<E>[]>();
  for (const edge of graph.edges) {
    const scope = owner(edge);
    owned.set(scope, [...(owned.get(scope) ?? []), edge]);
  }
  const edges = new Map(
    graph.edges.map((e) => [
      e.id,
      { ...e, x: 0, y: 0, width: e.width ?? 0, height: e.height ?? 0 },
    ]),
  );
  const localLabels = new Map<string, { scope: string | null; rect: EntityRect }>();
  const compoundGeometry = new Map<string, CompoundLayoutGeometry>();
  const childScopes = [
    ...new Set(nodes.flatMap((n) => (n.parentId == null ? [] : [n.parentId]))),
  ].sort((a, b) => ancestry(b).length - ancestry(a).length);

  const solve = (scope: string | null) => {
    const children = nodes.filter((n) => (n.parentId ?? null) === scope);
    if (!children.length) return;
    const container = scope == null ? undefined : byId.get(scope);
    const config = container && options.compound?.(container);
    const direction = config?.direction ?? options.direction ?? graph.direction ?? "right";
    const horizontal = direction === "left" || direction === "right";
    const padding = paddingOf(config?.padding ?? options.padding);
    const insets = { ...padding };
    const header = config?.header;
    const side = header?.side ?? "top";
    if (header) insets[side] += side === "top" || side === "bottom" ? header.height : header.width;
    const scopeEdges = owned.get(scope) ?? [];
    const boundary = new Map<string, GraphEdge<E>[]>();
    const projected: GraphEdge<E>[] = [];
    for (const edge of scopeEdges) {
      if (edge.sourceId === scope || edge.targetId === scope) {
        const id = branch(edge.sourceId === scope ? edge.targetId : edge.sourceId, scope);
        boundary.set(id, [...(boundary.get(id) ?? []), edge]);
      } else {
        projected.push({
          ...edge,
          sourceId: branch(edge.sourceId, scope),
          targetId: branch(edge.targetId, scope),
          points: undefined,
        });
      }
    }
    const gap = options.settings?.["spacing.labelNode"] ?? options.spacing?.node ?? 20;
    const labelGap = options.settings?.["spacing.labelLabel"] ?? 8;
    const sizes = new Map(
      children.map((n) => {
        const labels = boundary.get(n.id) ?? [];
        const labelWidth = Math.max(0, ...labels.map((e) => e.width ?? 0));
        const labelHeight =
          labels.reduce((sum, e) => sum + (e.height ?? 0), 0) +
          Math.max(0, labels.length - 1) * labelGap;
        return [
          n.id,
          {
            width:
              labels.length && !horizontal
                ? n.width + gap + labelWidth
                : Math.max(n.width, labelWidth),
            height:
              labels.length && horizontal
                ? n.height + gap + labelHeight
                : Math.max(n.height, labelHeight),
          },
        ];
      }),
    );
    // A label is an occupied vertex in the scope's placement problem, including
    // adjacent-layer and feedback edges. It cannot be added after node placement.
    const labels = projected.filter((edge) => (edge.width ?? 0) > 0 && (edge.height ?? 0) > 0);
    const used = new Set([...graph.nodes, ...graph.edges].map((entity) => entity.id));
    const labelIds = new Map<string, string>();
    for (const edge of labels) {
      let id = `__layout_label_${edge.id}`;
      while ([id, `${id}_source`, `${id}_target`].some((key) => used.has(key))) id += "_";
      for (const key of [id, `${id}_source`, `${id}_target`]) used.add(key);
      labelIds.set(edge.id, id);
      sizes.set(id, { width: edge.width!, height: edge.height! });
    }
    const originalEdges = new Map(graph.edges.map((edge) => [edge.id, edge]));
    for (const edge of labels) {
      originalEdges.set(`${labelIds.get(edge.id)}_source`, edges.get(edge.id)!);
      originalEdges.set(`${labelIds.get(edge.id)}_target`, edges.get(edge.id)!);
    }
    // Keep each label between its endpoint representatives in model order.
    // Appending labels would reverse every label->target leg under MODEL_ORDER
    // and collapse a forward chain into one layer of siblings.
    const placementOrder = new Map(children.map((node, index) => [node.id, index]));
    for (const edge of labels)
      placementOrder.set(
        labelIds.get(edge.id)!,
        ((placementOrder.get(edge.sourceId) ?? 0) + (placementOrder.get(edge.targetId) ?? 0)) / 2 +
          (edge.sourceId === edge.targetId ? 0.25 : 0),
      );
    const result = flat(
      {
        ...graph,
        nodes: [
          ...children.map((n) => ({ ...n, parentId: null })),
          ...labels.map((edge) => ({
            type: "node" as const,
            id: labelIds.get(edge.id)!,
            data: undefined as N,
          })),
        ].sort((a, b) => placementOrder.get(a.id)! - placementOrder.get(b.id)!),
        edges: projected.flatMap((edge) => {
          const labelId = labelIds.get(edge.id);
          return labelId
            ? [
                {
                  ...edge,
                  id: `${labelId}_source`,
                  targetId: labelId,
                  targetPort: undefined,
                  width: 0,
                  height: 0,
                },
                {
                  ...edge,
                  id: `${labelId}_target`,
                  sourceId: labelId,
                  sourcePort: undefined,
                  width: 0,
                  height: 0,
                },
              ]
            : [edge];
        }),
      },
      {
        ...options,
        compound: undefined,
        direction,
        padding: insets,
        measure: (node) => sizes.get(node.id)!,
        nodeSettings: (node) => {
          const original = byId.get(node.id);
          return original ? options.nodeSettings?.(original) : undefined;
        },
        edgeSettings: (edge) => options.edgeSettings?.(originalEdges.get(edge.id) ?? edge),
      },
    );
    for (const placed of result.nodes) {
      const node = byId.get(placed.id);
      if (node)
        Object.assign(node, {
          x: placed.x,
          y: placed.y,
          // Placement reserves an envelope for boundary labels. Ports belong to
          // the actual node rectangle, never that larger occupied envelope.
          ports: placePorts(
            node.ports,
            { ...placed, width: node.width, height: node.height },
            direction,
            (port) => options.portSettings?.(port, node),
            { ...options.settings, ...options.nodeSettings?.(node) },
          ),
        });
    }
    for (const edge of projected) {
      const labelId = labelIds.get(edge.id);
      if (labelId) {
        const label = result.nodes.find((n) => n.id === labelId)!;
        localLabels.set(edge.id, {
          scope,
          rect: { x: label.x, y: label.y, width: label.width, height: label.height },
        });
      }
    }
    for (const [id, labels] of boundary) {
      const node = byId.get(id)!;
      const totalHeight =
        labels.reduce((sum, e) => sum + (e.height ?? 0), 0) +
        Math.max(0, labels.length - 1) * labelGap;
      let cross = horizontal ? 0 : (Math.max(node.height, totalHeight) - totalHeight) / 2;
      for (const edge of labels) {
        const width = edge.width ?? 0,
          height = edge.height ?? 0;
        localLabels.set(edge.id, {
          scope,
          rect: {
            x: node.x + (horizontal ? (Math.max(node.width, width) - width) / 2 : node.width + gap),
            y: node.y + (horizontal ? node.height + gap : 0) + cross,
            width,
            height,
          },
        });
        cross += height + labelGap;
      }
    }
    const boxes: EntityRect[] = [
      ...children.map((n) => ({ x: n.x, y: n.y, ...sizes.get(n.id)! })),
      ...[...localLabels.values()].filter((l) => l.scope === scope).map((l) => l.rect),
    ];
    // One scope-local transform preserves labels relative to their nodes.
    let dx = Math.max(0, insets.left - Math.min(...boxes.map((b) => b.x)));
    let dy = Math.max(0, insets.top - Math.min(...boxes.map((b) => b.y)));
    if (header && (side === "top" || side === "bottom")) {
      const occupiedWidth =
        Math.max(...boxes.map((b) => b.x + b.width)) -
        Math.min(...boxes.map((b) => b.x)) +
        padding.left +
        padding.right;
      dx += Math.max(0, (header.width - occupiedWidth) / 2);
    }
    if (header && (side === "left" || side === "right")) {
      const occupiedHeight =
        Math.max(...boxes.map((b) => b.y + b.height)) -
        Math.min(...boxes.map((b) => b.y)) +
        padding.top +
        padding.bottom;
      dy += Math.max(0, (header.height - occupiedHeight) / 2);
    }
    const right = Math.max(...boxes.map((b) => b.x + dx + b.width));
    const bottom = Math.max(...boxes.map((b) => b.y + dy + b.height));
    for (const n of children) {
      n.x += dx;
      n.y += dy;
    }
    for (const l of localLabels.values())
      if (l.scope === scope) {
        l.rect.x += dx;
        l.rect.y += dy;
      }
    if (container) {
      const width = Math.max(
        header?.width ?? 0,
        config?.minContentSize?.width
          ? config.minContentSize.width + insets.left + insets.right
          : 0,
        right + insets.right,
      );
      const height = Math.max(
        header?.height ?? 0,
        config?.minContentSize?.height
          ? config.minContentSize.height + insets.top + insets.bottom
          : 0,
        bottom + insets.bottom,
      );
      container.width = Math.max(container.width, width);
      container.height = Math.max(container.height, height);
      compoundGeometry.set(container.id, {
        bounds: { x: 0, y: 0, width: container.width, height: container.height },
        content: {
          x: insets.left,
          y: insets.top,
          width: container.width - insets.left - insets.right,
          height: container.height - insets.top - insets.bottom,
        },
        ...(header
          ? {
              header: {
                x: side === "right" ? container.width - header.width : 0,
                y: side === "bottom" ? container.height - header.height : 0,
                width: side === "top" || side === "bottom" ? container.width : header.width,
                height: side === "left" || side === "right" ? container.height : header.height,
              },
            }
          : {}),
      });
    }
  };
  for (const scope of childScopes) solve(scope);
  const roots = nodes.filter((n) => n.parentId == null);
  if (roots.length === 1 && compoundGeometry.has(roots[0]!.id) && !owned.get(null)?.length)
    Object.assign(roots[0]!, { x: 0, y: 0 });
  else solve(null);
  const origin = (id: string | null): Point => {
    if (id == null) return { x: 0, y: 0 };
    return ancestry(id)
      .slice(0, -1)
      .reduce<Point>((p, key) => ({ x: p.x + byId.get(key!)!.x, y: p.y + byId.get(key!)!.y }), {
        x: 0,
        y: 0,
      });
  };
  for (const [id, label] of localLabels) {
    const offset = origin(label.scope);
    Object.assign(edges.get(id)!, {
      ...label.rect,
      x: label.rect.x + offset.x,
      y: label.rect.y + offset.y,
    });
  }
  // Route the original endpoints, not their projected ancestor representatives.
  const attachmentSettings: Record<string, EdgeRoutingSettings> = {};
  for (const edge of edges.values()) {
    const sourceGeometry = compoundGeometry.get(edge.sourceId),
      targetGeometry = compoundGeometry.get(edge.targetId);
    const intent = options.edgeAttachment?.(edge);
    attachmentSettings[edge.id] = {
      ...(sourceGeometry &&
      edge.sourceId !== edge.targetId &&
      ancestry(edge.targetId).includes(edge.sourceId)
        ? {
            sourceAttachment: {
              bounds:
                intent?.source === "outer"
                  ? {
                      x: 0,
                      y: 0,
                      width: sourceGeometry.bounds.width,
                      height: sourceGeometry.bounds.height,
                    }
                  : sourceGeometry.content,
              facing: intent?.source === "outer" ? "outward" : "inward",
            },
          }
        : {}),
      ...(targetGeometry &&
      edge.sourceId !== edge.targetId &&
      (intent?.target === "content" || ancestry(edge.sourceId).includes(edge.targetId))
        ? {
            targetAttachment: {
              bounds:
                intent?.target === "outer"
                  ? {
                      x: 0,
                      y: 0,
                      width: targetGeometry.bounds.width,
                      height: targetGeometry.bounds.height,
                    }
                  : targetGeometry.content,
              facing: intent?.target === "outer" ? "outward" : "inward",
            },
          }
        : {}),
    };
  }
  const worldNodes = nodes.map((n) => ({ ...n, ...origin(n.id) }));
  const usedIds = new Set(nodes.map((n) => n.id));
  const headers = [...compoundGeometry].flatMap(([id, geometry]) => {
    if (!geometry.header) return [];
    const p = origin(id);
    let key = `__layout_header_${id}`;
    while (usedIds.has(key)) key += "_";
    usedIds.add(key);
    return [
      {
        type: "node" as const,
        id: key,
        parentId: id,
        data: undefined as N,
        ...geometry.header,
        x: p.x + geometry.header.x,
        y: p.y + geometry.header.y,
      },
    ];
  });
  const snapshot = orthogonalRouting.route(
    { ...graph, nodes: [...worldNodes, ...headers], edges: [...edges.values()] },
    { coordinateSpace: "world", edges: attachmentSettings, maxSearchNodes: 40000 },
  );
  for (const [id, route] of snapshot.routes) {
    const polylines = routeToPolylines(route);
    Object.assign(edges.get(id)!, {
      points: polylines.flatMap((p) => p.map((point) => ({ ...point }))),
      routing: "orthogonal",
    });
  }
  for (const [id, geometry] of compoundGeometry)
    geometry.bounds = { ...geometry.bounds, x: byId.get(id)!.x, y: byId.get(id)!.y };
  const result: CompoundVisualGraph<N, E, G, P> = {
    ...graph,
    edgeCoordinateSpace: "world",
    direction: options.direction ?? graph.direction ?? "right",
    nodes,
    edges: graph.edges.map((e) => edges.get(e.id)!) as VisualGraph<N, E, G, P>["edges"],
    compoundGeometry,
    compoundRoutes: snapshot.routes,
  };
  recordRouteGeometry(result, snapshot.routes);
  return result;
}
