import type { PeleVisualGraph } from "../pele";
import { worldGeometry } from "../authoring/coordinates";
import { routeEdges } from "./api";
import { hasCurrentRouteGeometry, type LayoutRouting } from "./layout-cache";
import { routingPolicies } from "./model";
import type {
  EdgeRoutingSettings,
  Route,
  RouteBounds,
  RoutePoint,
  RouteSide,
  RoutingSettings,
} from "./types";

function boundarySide(point: RoutePoint, bounds: RouteBounds): RouteSide {
  const sides = [
    ["left", Math.abs(point.x - bounds.x)],
    ["right", Math.abs(point.x - bounds.x - bounds.width)],
    ["top", Math.abs(point.y - bounds.y)],
    ["bottom", Math.abs(point.y - bounds.y - bounds.height)],
  ] satisfies [RouteSide, number][];
  sides.sort((a, b) => a[1] - b[1]);
  return sides[0]![0];
}

/** Capture once, before editing the layout. Subsequent edits use updateRoutes. */
export function createPeleRouting(
  layout: PeleVisualGraph,
  settings: RoutingSettings = {},
): LayoutRouting {
  if (!hasCurrentRouteGeometry(layout, layout.compoundRoutes))
    throw new Error("Capture Pele routing before editing layout geometry");
  const world = worldGeometry(layout);
  const nodes = new Map(world.nodes.map((node) => [node.id, node]));
  const usedIds = new Set(nodes.keys());
  const headers = world.nodes.flatMap((node) => {
    const header = layout.compoundGeometry.get(node.id)?.header;
    if (!header) return [];
    let id = `__pele_routing_header_${node.id}`;
    while (usedIds.has(id)) id += "_";
    usedIds.add(id);
    return [
      {
        ...node,
        ...header,
        ports: undefined,
        id,
        parentId: node.id,
        x: node.x + header.x,
        y: node.y + header.y,
      },
    ];
  });
  const edges: Record<string, EdgeRoutingSettings> = {};
  const hints = new Map<string, Route>();
  for (const edge of world.edges) {
    const route = layout.compoundRoutes.get(edge.id);
    const first = route?.sections[0],
      last = route?.sections.at(-1);
    const start = first?.path.start,
      end = last?.path.segments.at(-1)?.to;
    const source = nodes.get(edge.sourceId)!,
      target = nodes.get(edge.targetId)!;
    const attachment = (id: string, point: RoutePoint | undefined) => {
      const geometry = layout.compoundGeometry.get(id),
        node = nodes.get(id)!;
      if (!geometry || !point) return undefined;
      const content = {
        ...geometry.content,
        x: node.x + geometry.content.x,
        y: node.y + geometry.content.y,
      };
      const side = boundarySide(point, content);
      const distance =
        side === "left"
          ? Math.abs(point.x - content.x)
          : side === "right"
            ? Math.abs(point.x - content.x - content.width)
            : side === "top"
              ? Math.abs(point.y - content.y)
              : Math.abs(point.y - content.y - content.height);
      const onBoundary =
        distance < 1e-6 &&
        point.x >= content.x - 1e-6 &&
        point.x <= content.x + content.width + 1e-6 &&
        point.y >= content.y - 1e-6 &&
        point.y <= content.y + content.height + 1e-6;
      return onBoundary ? { bounds: geometry.content, facing: "inward" as const } : undefined;
    };
    const sourceAttachment = attachment(edge.sourceId, start);
    const targetAttachment = attachment(edge.targetId, end);
    const sourceSide =
      (sourceAttachment ? undefined : first?.fromSide) ??
      (start &&
        boundarySide(
          start,
          sourceAttachment
            ? {
                ...sourceAttachment.bounds,
                x: source.x + sourceAttachment.bounds.x,
                y: source.y + sourceAttachment.bounds.y,
              }
            : source,
        ));
    const targetSide =
      (targetAttachment ? undefined : last?.toSide) ??
      (end &&
        boundarySide(
          end,
          targetAttachment
            ? {
                ...targetAttachment.bounds,
                x: target.x + targetAttachment.bounds.x,
                y: target.y + targetAttachment.bounds.y,
              }
            : target,
        ));
    const label = route?.label;
    const entry = first?.to.kind === "label" ? first.path.segments.at(-1)?.to : undefined;
    const exit = last?.from.kind === "label" ? last.path.start : undefined;
    const tangent = entry && exit ? { x: exit.x - entry.x, y: exit.y - entry.y } : label?.tangent;
    const hasTangent =
      tangent && Math.hypot(tangent.x, tangent.y) > 1e-6 && Math.abs(tangent.x * tangent.y) < 1e-6;
    edges[edge.id] = {
      sourceSide,
      targetSide,
      sourceAttachment,
      targetAttachment,
      policy: {
        label:
          edge.width && edge.height
            ? {
                kind: "gap",
                attachment: "side-midpoint",
                tangent: hasTangent
                  ? { kind: "vector", direction: tangent }
                  : { kind: "border-normal" },
              }
            : { kind: "follow" },
      },
      ...settings.edges?.[edge.id],
    };
    if (route)
      hints.set(edge.id, {
        ...route,
        sections: route.sections.map((section, i) => ({
          ...section,
          ...(i === 0 && !sourceAttachment ? { fromSide: sourceSide } : {}),
          ...(i === route.sections.length - 1 && !targetAttachment ? { toSide: targetSide } : {}),
          ...(section.from.kind === "label" && label
            ? { fromSide: boundarySide(section.path.start, label.bounds) }
            : {}),
          ...(section.to.kind === "label" && label
            ? {
                toSide: boundarySide(
                  section.path.segments.at(-1)?.to ?? section.path.start,
                  label.bounds,
                ),
              }
            : {}),
        })),
      });
  }
  const graph = { ...world, nodes: [...world.nodes, ...headers] };
  const snapshot = routeEdges({
    graph,
    initialRoutes: hints,
    settings: {
      ...settings,
      coordinateSpace: "world",
      policy: { ...routingPolicies.pele, ...settings.policy },
      edges,
    },
  });
  return { graph, snapshot };
}
