import { nativeGeometry, worldGeometry } from "./coordinates";
import type {
  Graph,
  VisualGraph,
  VisualNode,
  VisualEdge,
  EntityRect,
  Point,
} from "@statelyai/graph";
import { getNodeSize } from "@statelyai/graph/layout";
import type { LayeredLayoutOptions } from "../layered/types";
import type { LayoutExecutionContext } from "../types";
import { LayoutError, UnsupportedLayoutError } from "../errors";
import {
  constraintFailure,
  solveGeometryConstraints,
  type GeometryReference,
  type LayoutConstraint,
} from "../constraints";
import { getPolylineMidpoint } from "../layered/strategies";
import { overlaps, routeCrosses, routeOrthogonal } from "./routing";

const geometryKeys = ["x", "y", "width", "height"] as const;
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function samePosition(a: EntityRect, b: EntityRect) {
  return a.x === b.x && a.y === b.y;
}
function onRoute(point: Point, points: readonly Point[] | undefined): boolean {
  return (
    points?.some((b, i) => {
      if (!i) return false;
      const a = points[i - 1]!;
      const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
      return (
        Math.abs(cross) < 1e-6 &&
        point.x >= Math.min(a.x, b.x) - 1e-6 &&
        point.x <= Math.max(a.x, b.x) + 1e-6 &&
        point.y >= Math.min(a.y, b.y) - 1e-6 &&
        point.y <= Math.max(a.y, b.y) + 1e-6
      );
    }) ?? false
  );
}
function labelReferences(constraints: readonly LayoutConstraint[]): Set<string> {
  const ids = new Set<string>();
  const add = (ref: GeometryReference) => {
    if ("edgeId" in ref) ids.add(ref.edgeId);
  };
  for (const c of constraints) {
    if (c.kind === "align" || c.kind === "distribute") c.entities.forEach(add);
    else if (c.kind === "pin") add(c.entity);
    else if (c.kind === "linear") c.terms.forEach((term) => add(term.entity));
  }
  return ids;
}

type Arrange = <N, E, G, P>(
  graph: Graph<N, E, G, P>,
  options: LayeredLayoutOptions,
) => VisualGraph<N, E, G, P>;

/** Authoring path: plan only selected nodes; route against the complete fixed scene. */
export function runPartialLayout<N, E, G, P>(
  input: Graph<N, E, G, P>,
  options: LayeredLayoutOptions,
  context: LayoutExecutionContext,
  arrange: Arrange,
  arrangeNodes = true,
): VisualGraph<N, E, G, P> {
  const scope = context.scope;
  if (scope.mode !== "partial" && scope.mode !== "route-only")
    throw new Error("Expected authoring scope");
  const selectedNodes = new Set(scope.mode === "partial" ? (scope.nodeIds ?? []) : []);
  const selectedEdges = new Set(
    scope.mode === "route-only"
      ? (scope.edgeIds ?? input.edges.map((e) => e.id))
      : (scope.edgeIds ?? []),
  );
  const geometry = scope.mode === "partial" ? (scope.edgeGeometry ?? "both") : "routes";
  const routing = scope.mode === "partial" ? (scope.routing ?? "affected") : "selected";
  const constraints = context.constraints ?? [];
  const constrainedLabels = labelReferences(constraints);
  for (const [ids, entities] of [
    [selectedNodes, input.nodes],
    [selectedEdges, input.edges],
  ] as const) {
    const known = new Set(entities.map((e) => e.id));
    for (const id of ids)
      if (!known.has(id))
        throw new LayoutError(`Unknown selected entity: ${id}`, "INVALID_SELECTION");
  }
  const containers = new Set(input.nodes.flatMap((n) => (n.parentId == null ? [] : [n.parentId])));
  if ([...selectedNodes].some((id) => containers.has(id)))
    throw new UnsupportedLayoutError(
      "Authoring layout cannot move containers; select leaf nodes or use full layout without geometry constraints",
    );
  const previousNodes = new Map(scope.previous?.nodes.map((n) => [n.id, n]));
  const previousEdges = new Map(scope.previous?.edges.map((e) => [e.id, e]));
  const missing = (id: string): never => {
    throw new LayoutError(
      `Fixed entity ${id} requires finite geometry in graph or previous`,
      "MISSING_GEOMETRY",
    );
  };
  let nodes = input.nodes.map((node): VisualNode<N, P> => {
    const previous = previousNodes.get(node.id);
    const size = getNodeSize(node, options);
    const rect = { ...node };
    for (const key of geometryKeys) {
      const value = node[key] ?? previous?.[key];
      if (
        value !== undefined &&
        (!finite(value) || ((key === "width" || key === "height") && value < 0))
      )
        missing(node.id);
      rect[key] =
        value ??
        (selectedNodes.has(node.id)
          ? key === "width" || key === "height"
            ? size[key]
            : 0
          : missing(node.id));
      if (!finite(rect[key]) || ((key === "width" || key === "height") && rect[key]! < 0))
        missing(node.id);
    }
    return rect as VisualNode<N, P>;
  });
  let edges = input.edges.map((edge): VisualEdge<E> => {
    const previous = previousEdges.get(edge.id);
    const absentLabel =
      !edge.label &&
      (edge.width ?? previous?.width ?? 0) === 0 &&
      (edge.height ?? previous?.height ?? 0) === 0;
    const rect = {
      ...edge,
      ...(edge.points === undefined && previous?.points !== undefined
        ? { points: previous.points }
        : {}),
      ...(edge.routing === undefined && previous?.routing !== undefined
        ? { routing: previous.routing }
        : {}),
    };
    for (const key of geometryKeys) {
      const value = edge[key] ?? previous?.[key];
      if (
        value !== undefined &&
        (!finite(value) || ((key === "width" || key === "height") && value < 0))
      )
        missing(edge.id);
      // An absent label has a canonical zero-sized rectangle. Measured labels must be supplied.
      rect[key] =
        value ??
        ((selectedEdges.has(edge.id) && geometry !== "routes" && (key === "x" || key === "y")) ||
        absentLabel
          ? 0
          : missing(edge.id));
    }
    return rect as VisualEdge<E>;
  });
  const authored: VisualGraph<N, E, G, P> = {
    ...input,
    direction: input.direction ?? options.direction ?? scope.previous?.direction ?? "down",
    nodes,
    edges,
  };
  const baseline = worldGeometry(authored);
  nodes = baseline.nodes;
  edges = baseline.edges;
  let graph = baseline;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ancestors = (id: string): Set<string> => {
    const result = new Set<string>();
    let parent = byId.get(id)?.parentId;
    while (parent != null && !result.has(parent)) {
      result.add(parent);
      parent = byId.get(parent)?.parentId;
    }
    return result;
  };
  const direction = options.direction ?? input.direction ?? scope.previous?.direction ?? "down";
  const gap = options.spacing?.node ?? 20;
  if (!finite(gap) || gap < 0)
    throw new LayoutError("Spacing must be finite and non-negative", "INVALID_OPTIONS");
  context.throwIfAborted();
  if (selectedNodes.size && arrangeNodes) {
    // The existing layered phases plan the selection, never the surrounding graph.
    // Keep parents separate so selection does not reparent or resize anything.
    const groups = new Map<string | null, VisualNode<N, P>[]>();
    for (const node of nodes)
      if (selectedNodes.has(node.id)) {
        const group = groups.get(node.parentId ?? null) ?? [];
        group.push(node);
        groups.set(node.parentId ?? null, group);
      }
    const placed = new Map(nodes.map((n) => [n.id, n]));
    for (const group of groups.values()) {
      const ids = new Set(group.map((n) => n.id));
      const local = arrange(
        {
          ...input,
          initialNodeId: undefined,
          nodes: group.map((n) => ({ ...n, parentId: undefined, initialNodeId: undefined })),
          edges: edges.filter((e) => ids.has(e.sourceId) && ids.has(e.targetId)),
        },
        { ...options, padding: 0 },
      );
      const anchorX = Math.min(...group.map((n) => n.x));
      const anchorY = Math.min(...group.map((n) => n.y));
      const localX = Math.min(...local.nodes.map((n) => n.x));
      const localY = Math.min(...local.nodes.map((n) => n.y));
      const proposed = group.map((n) => {
        const p = local.nodes.find((item) => item.id === n.id)!;
        return { ...n, x: p.x - localX + anchorX, y: p.y - localY + anchorY };
      });
      const obstacles = [...placed.values()].filter((n) => !ids.has(n.id));
      const fixedLabels = edges.filter((e) => geometry === "routes" || !selectedEdges.has(e.id));
      const candidates: Point[] = [{ x: 0, y: 0 }];
      for (const obstacle of [...obstacles, ...fixedLabels])
        for (const node of proposed) {
          candidates.push(
            { x: obstacle.x + obstacle.width + gap - node.x, y: 0 },
            { x: obstacle.x - gap - node.x - node.width, y: 0 },
            { x: 0, y: obstacle.y + obstacle.height + gap - node.y },
            { x: 0, y: obstacle.y - gap - node.y - node.height },
          );
        }
      candidates.sort((a, b) => Math.abs(a.x) + Math.abs(a.y) - Math.abs(b.x) - Math.abs(b.y));
      const fits = (offset: Point) =>
        proposed.every((n) => {
          const translated = { ...n, x: n.x + offset.x, y: n.y + offset.y };
          const parent = n.parentId == null ? undefined : placed.get(n.parentId);
          if (
            parent &&
            (translated.x < parent.x ||
              translated.y < parent.y ||
              translated.x + translated.width > parent.x + parent.width ||
              translated.y + translated.height > parent.y + parent.height)
          )
            return false;
          return (
            !fixedLabels.some((label) => overlaps(translated, label, gap)) &&
            obstacles.every(
              (o) =>
                ancestors(n.id).has(o.id) ||
                ancestors(o.id).has(n.id) ||
                !overlaps(translated, o, gap),
            )
          );
        });
      const offset = candidates.find(fits);
      if (offset)
        for (const n of proposed) placed.set(n.id, { ...n, x: n.x + offset.x, y: n.y + offset.y });
      else
        context.diagnostics.push({
          severity: "warning",
          code: "PLACEMENT_BLOCKED",
          message:
            "Selected nodes could not fit without moving fixed geometry; preserved their positions",
          entityIds: [...ids],
          geometry: "node",
        });
    }
    graph = { ...graph, nodes: nodes.map((n) => placed.get(n.id)!) };
  }
  graph = solveGeometryConstraints(
    graph,
    constraints,
    selectedNodes,
    geometry === "routes" ? new Set() : selectedEdges,
    context.diagnostics,
  );
  const moved = graph.nodes.filter((n) => !samePosition(n, byId.get(n.id)!));
  const movedIds = new Set(moved.map((n) => n.id));
  const resultNodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const automatic = new Set<string>();
  const affected = (edge: VisualEdge<E>) =>
    movedIds.has(edge.sourceId) ||
    movedIds.has(edge.targetId) ||
    moved.some(
      (n) =>
        !ancestors(edge.sourceId).has(n.id) &&
        !ancestors(edge.targetId).has(n.id) &&
        (routeCrosses(edge.points, n) ||
          overlaps(edge, n) ||
          (edge.routing === "splines" &&
            edge.points?.length &&
            overlaps(n, {
              x: Math.min(...edge.points.map((p) => p.x)),
              y: Math.min(...edge.points.map((p) => p.y)),
              width:
                Math.max(...edge.points.map((p) => p.x)) - Math.min(...edge.points.map((p) => p.x)),
              height:
                Math.max(...edge.points.map((p) => p.y)) - Math.min(...edge.points.map((p) => p.y)),
            }))),
    );
  const edgeById = new Map(graph.edges.map((e) => [e.id, e]));
  for (const constraint of constraints)
    if (constraint.kind === "waypoint") {
      if (
        !finite(constraint.point.x) ||
        !finite(constraint.point.y) ||
        !edgeById.has(constraint.edgeId)
      )
        throw new LayoutError(`${constraint.id}: invalid waypoint`, "INVALID_CONSTRAINT");
    }
  graph = {
    ...graph,
    edges: graph.edges.map((edge) => {
      context.throwIfAborted();
      const needsRepair = affected(edge);
      const allowed = selectedEdges.has(edge.id) || (routing === "affected" && needsRepair);
      const routeAllowed = allowed && geometry !== "labels";
      const labelAllowed = allowed && geometry !== "routes" && !constrainedLabels.has(edge.id);
      const waypoints = constraints.filter((c) => c.kind === "waypoint" && c.edgeId === edge.id);
      const source = resultNodes.get(edge.sourceId)!;
      const target = resultNodes.get(edge.targetId)!;
      let next = edge;
      let routeFailed = false;
      if (needsRepair && !routeAllowed)
        context.diagnostics.push({
          severity: "warning",
          code: "ROUTE_REPAIR_REQUIRED",
          message: `Edge ${edge.id} needs routing outside the permitted geometry`,
          entityIds: [edge.id],
          geometry: "routes",
        });
      if (routeAllowed) {
        if (options.settings?.edgeRouting === "SPLINES" || options.strategies?.routeEdges)
          throw new UnsupportedLayoutError(
            "Partial layout supports its built-in orthogonal router only",
          );
        const ancestorIds = new Set([...ancestors(source.id), ...ancestors(target.id)]);
        const nodeObstacles = graph.nodes
          .filter((n) => !ancestorIds.has(n.id))
          .map((n) =>
            n.id === source.id || n.id === target.id
              ? n
              : { ...n, x: n.x - 1, y: n.y - 1, width: n.width + 2, height: n.height + 2 },
          );
        const labelObstacles = [...edgeById.values()].filter(
          (e) => e.id !== edge.id && e.width > 0 && e.height > 0,
        );
        const required = waypoints.filter((c) => (c.strength ?? "required") === "required");
        const accepted = new Set(required.map((c) => c.id));
        const route = () =>
          routeOrthogonal(
            edge,
            source,
            target,
            direction,
            [...nodeObstacles, ...labelObstacles],
            waypoints
              .filter((c) => c.kind === "waypoint" && accepted.has(c.id))
              .map((c) => (c.kind === "waypoint" ? c.point : { x: 0, y: 0 })),
            () => context.throwIfAborted(),
          );
        let points = route();
        const priorities = { strong: 3, medium: 2, weak: 1, required: 4 };
        for (const preference of waypoints
          .filter((c) => !accepted.has(c.id))
          .sort(
            (a, b) => priorities[b.strength ?? "required"] - priorities[a.strength ?? "required"],
          )) {
          accepted.add(preference.id);
          const candidate = route();
          if (candidate) points = candidate;
          else accepted.delete(preference.id);
        }
        if (points) next = { ...next, points, routing: "orthogonal" };
        else {
          routeFailed = true;
          context.diagnostics.push({
            severity: "warning",
            code: "ROUTE_BLOCKED",
            message: `No route found for ${edge.id} within the search budget; preserved the route`,
            entityIds: [edge.id],
            geometry: "routes",
          });
        }
      }
      for (const constraint of waypoints)
        if (
          constraint.kind === "waypoint" &&
          (routeFailed || next.routing === "splines" || !onRoute(constraint.point, next.points))
        ) {
          if ((constraint.strength ?? "required") === "required")
            constraintFailure(
              constraint,
              "route cannot pass through the waypoint within the permitted geometry",
            );
          context.diagnostics.push({
            severity: "warning",
            code: "CONSTRAINT_VIOLATION",
            message: `Waypoint ${constraint.id} could not be satisfied`,
            entityIds: [edge.id],
            constraintIds: [constraint.id],
            geometry: "routes",
          });
        }
      if (labelAllowed) {
        const midpoint = getPolylineMidpoint(next.points ?? []);
        const candidates = [
          { x: midpoint.x - next.width / 2, y: midpoint.y - next.height / 2 },
          { x: midpoint.x - next.width / 2, y: midpoint.y - next.height - gap },
          { x: midpoint.x - next.width / 2, y: midpoint.y + gap },
          { x: midpoint.x + gap, y: midpoint.y - next.height / 2 },
          { x: midpoint.x - next.width - gap, y: midpoint.y - next.height / 2 },
        ];
        const parentIds = new Set([...ancestors(source.id), ...ancestors(target.id)]);
        for (const obstacle of [...graph.nodes, ...edgeById.values()]) {
          candidates.push(
            { x: midpoint.x - next.width / 2, y: obstacle.y - next.height - gap },
            { x: midpoint.x - next.width / 2, y: obstacle.y + obstacle.height + gap },
            { x: obstacle.x - next.width - gap, y: midpoint.y - next.height / 2 },
            { x: obstacle.x + obstacle.width + gap, y: midpoint.y - next.height / 2 },
          );
        }
        candidates.sort(
          (a, b) =>
            Math.hypot(a.x + next.width / 2 - midpoint.x, a.y + next.height / 2 - midpoint.y) -
            Math.hypot(b.x + next.width / 2 - midpoint.x, b.y + next.height / 2 - midpoint.y),
        );
        const chosen = candidates.find((p) => {
          const rect = { ...next, ...p };
          return (
            !graph.nodes.some((n) => !parentIds.has(n.id) && overlaps(rect, n)) &&
            ![...edgeById.values()].some((e) => e.id !== edge.id && overlaps(rect, e))
          );
        });
        if (chosen) next = { ...next, ...chosen };
        else
          context.diagnostics.push({
            severity: "warning",
            code: "LABEL_PLACEMENT_BLOCKED",
            message: `No clear label position found for ${edge.id}; preserved label position`,
            entityIds: [edge.id],
            geometry: "labels",
          });
      }
      if (
        geometry === "labels" &&
        allowed &&
        !samePosition(
          next,
          baseline.edges.find((e) => e.id === edge.id)!,
        )
      ) {
        context.diagnostics.push({
          severity: "info",
          code: "ROUTE_PRESERVED",
          message: `Route for ${edge.id} was preserved; label attachment may need repair`,
          entityIds: [edge.id],
          geometry: "routes",
        });
      }
      edgeById.set(edge.id, next);
      if (
        !selectedEdges.has(edge.id) &&
        (next.x !== edge.x ||
          next.y !== edge.y ||
          next.routing !== edge.routing ||
          JSON.stringify(next.points) !== JSON.stringify(edge.points))
      )
        automatic.add(edge.id);
      return next;
    }),
  };
  if (automatic.size)
    context.diagnostics.push({
      severity: "info",
      code: "AFFECTED_EDGES_UPDATED",
      message: "Repaired geometry affected by moved nodes",
      entityIds: [...automatic],
    });
  // Constraint solving must not silently imply containment or collision guarantees.
  for (const node of graph.nodes)
    if (selectedNodes.has(node.id) || (node.parentId != null && movedIds.has(node.parentId))) {
      const parent = node.parentId == null ? undefined : resultNodes.get(node.parentId);
      if (
        parent &&
        (node.x < parent.x ||
          node.y < parent.y ||
          node.x + node.width > parent.x + parent.width ||
          node.y + node.height > parent.y + parent.height)
      )
        context.diagnostics.push({
          severity: "warning",
          code: "CONTAINMENT_VIOLATION",
          message: `Node ${node.id} extends outside its fixed parent`,
          entityIds: [node.id, parent.id],
          geometry: "node",
        });
      if (
        graph.nodes.some(
          (other) =>
            other.id !== node.id &&
            !ancestors(node.id).has(other.id) &&
            !ancestors(other.id).has(node.id) &&
            overlaps(node, other),
        )
      )
        context.diagnostics.push({
          severity: "warning",
          code: "NODE_OVERLAP",
          message: `Node ${node.id} overlaps another node`,
          entityIds: [node.id],
          geometry: "node",
        });
    }
  for (const edge of graph.edges) {
    const before = baseline.edges.find((e) => e.id === edge.id)!;
    if (!samePosition(edge, before)) {
      const containerIds = new Set([...ancestors(edge.sourceId), ...ancestors(edge.targetId)]);
      const collisions = [
        ...graph.nodes.filter((n) => !containerIds.has(n.id) && overlaps(edge, n)),
        ...graph.edges.filter((other) => other.id !== edge.id && overlaps(edge, other)),
      ];
      if (collisions.length)
        context.diagnostics.push({
          severity: "warning",
          code: "LABEL_OVERLAP",
          message: `Label ${edge.id} overlaps fixed or constrained geometry`,
          entityIds: [edge.id, ...collisions.map((e) => e.id)],
          geometry: "labels",
        });
      for (const other of graph.edges)
        if (
          other.id !== edge.id &&
          routeCrosses(other.points, edge) &&
          !routeCrosses(other.points, before)
        ) {
          context.diagnostics.push({
            severity: "warning",
            code: "ROUTE_REPAIR_REQUIRED",
            message: `Route ${other.id} crosses the moved label ${edge.id}`,
            entityIds: [other.id, edge.id],
            geometry: "routes",
          });
        }
    }
    if (
      geometry === "routes" &&
      routeCrosses(before.points, before) &&
      !routeCrosses(edge.points, edge)
    ) {
      context.diagnostics.push({
        severity: "warning",
        code: "LABEL_REPAIR_REQUIRED",
        message: `Label ${edge.id} is no longer attached to its route`,
        entityIds: [edge.id],
        geometry: "labels",
      });
    }
  }
  return nativeGeometry(graph, authored);
}
