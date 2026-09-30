import type { ElkExtendedEdge, ElkNode, ElkPoint } from "./public-types";
import { pathFromPoints } from "../routing/path";
import { pathFromSplinePoints } from "../routing/adapters";
import { freeze } from "../routing/model";
import type { Route, RouteEndpoint, RoutePath, RoutePoint, RouteSection } from "../routing/types";

export interface ElkRouteOptions {
  /** ELK stores spline controls in bendPoints; the caller must identify that encoding. */
  routing?: "ORTHOGONAL" | "POLYLINE" | "SPLINES";
}
/** Normalize any ELK layout's section geometry, preserving ports and hyperedge junctions. */
export function getElkRoutes(
  graph: ElkNode,
  options: ElkRouteOptions = {},
): ReadonlyMap<string, Route> {
  const shapes = new Map<string, { ref: RouteEndpoint; center: RoutePoint }>(),
    frames = new Map<string, RoutePoint>();
  const edges: { edge: ElkExtendedEdge; offset: RoutePoint; routing: string }[] = [];
  function visit(node: ElkNode, offset: RoutePoint, inherited: string) {
    const position = { x: offset.x + (node.x ?? 0), y: offset.y + (node.y ?? 0) };
    const routing =
      node.layoutOptions?.["elk.edgeRouting"] ??
      node.layoutOptions?.["org.eclipse.elk.edgeRouting"] ??
      inherited;
    frames.set(node.id, position);
    shapes.set(node.id, {
      ref: { kind: "node", nodeId: node.id },
      center: { x: position.x + (node.width ?? 0) / 2, y: position.y + (node.height ?? 0) / 2 },
    });
    for (const port of node.ports ?? [])
      shapes.set(port.id, {
        ref: { kind: "node", nodeId: node.id, port: port.id },
        center: {
          x: position.x + (port.x ?? 0) + (port.width ?? 0) / 2,
          y: position.y + (port.y ?? 0) + (port.height ?? 0) / 2,
        },
      });
    for (const edge of node.edges ?? [])
      edges.push({
        edge,
        offset: position,
        routing:
          edge.layoutOptions?.["elk.edgeRouting"] ??
          edge.layoutOptions?.["org.eclipse.elk.edgeRouting"] ??
          routing,
      });
    for (const child of node.children ?? []) visit(child, position, routing);
  }
  visit(graph, { x: 0, y: 0 }, options.routing ?? "POLYLINE");
  const result = new Map<string, Route>();
  for (const { edge, offset: inheritedOffset, routing } of edges) {
    const offset = edge.container
      ? (frames.get(edge.container) ?? inheritedOffset)
      : inheritedOffset;
    const point = (p: ElkPoint): RoutePoint => ({ x: p.x + offset.x, y: p.y + offset.y });
    // Join section endpoints by topology, never by equal coordinates alone.
    const parents = new Map<string, string>();
    const root = (key: string): string => {
      let current = key;
      while (parents.has(current)) current = parents.get(current)!;
      return current;
    };
    const join = (a: string, b: string) => {
      const x = root(a),
        y = root(b);
      if (x !== y) parents.set(x < y ? y : x, x < y ? x : y);
    };
    for (const section of edge.sections ?? []) {
      for (const id of section.outgoingSections ?? []) join(`${section.id}:end`, `${id}:start`);
      for (const id of section.incomingSections ?? []) join(`${id}:end`, `${section.id}:start`);
    }
    const sections: RouteSection[] = [];
    let malformed = false;
    for (const section of edge.sections ?? []) {
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(
        point,
      );
      let path: RoutePath;
      if (points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
        malformed = true;
        for (let i = 0; i < points.length; i++)
          if (!Number.isFinite(points[i]!.x) || !Number.isFinite(points[i]!.y))
            points[i] = { x: offset.x + i * 20, y: offset.y };
      }
      if (routing === "SPLINES") {
        if ((points.length - 1) % 3 || points.length < 4) {
          malformed = true;
          path = pathFromPoints([points[0]!, points.at(-1)!]);
        } else path = pathFromSplinePoints(points);
      } else path = pathFromPoints(points);
      const fromShape =
        section.incomingShape ??
        (!section.incomingSections?.length && edge.sources.length === 1
          ? edge.sources[0]
          : undefined);
      const toShape =
        section.outgoingShape ??
        (!section.outgoingSections?.length && edge.targets.length === 1
          ? edge.targets[0]
          : undefined);
      sections.push({
        id: section.id,
        from: fromShape
          ? (shapes.get(fromShape)?.ref ?? { kind: "node", nodeId: fromShape })
          : { kind: "junction", id: `${edge.id}:${root(`${section.id}:start`)}` },
        to: toShape
          ? (shapes.get(toShape)?.ref ?? { kind: "node", nodeId: toShape })
          : { kind: "junction", id: `${edge.id}:${root(`${section.id}:end`)}` },
        path,
      });
    }
    if (!sections.length) {
      malformed = true;
      const source = shapes.get(edge.sources[0] ?? ""),
        origin = source?.center ?? { x: 0, y: 0 };
      const targets = [...edge.targets, ...edge.sources.slice(1)];
      for (const [i, id] of (targets.length ? targets : [""]).entries()) {
        const target = shapes.get(id);
        sections.push({
          id: `${edge.id}:fallback:${i}`,
          from: source?.ref ?? { kind: "node", nodeId: edge.sources[0] ?? "" },
          to: target?.ref ?? { kind: "node", nodeId: id },
          path: pathFromPoints([origin, target?.center ?? { x: origin.x + 40, y: origin.y + 40 }]),
        });
      }
    }
    result.set(
      edge.id,
      freeze({
        edgeId: edge.id,
        sections,
        status: malformed ? "fallback" : "routed",
        diagnostics: malformed
          ? [
              {
                code: "MISSING_GEOMETRY",
                edgeId: edge.id,
                message:
                  "ELK sections contain missing or invalid geometry; rendered fallback paths",
              },
            ]
          : [],
      }),
    );
  }
  return result;
}
