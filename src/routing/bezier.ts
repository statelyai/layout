import { routeEdge, type Batch, type Metrics, type RoutingInput } from "./algorithms";
import { fitBezierTransition } from "./bezier-fit";
import { pathReservations } from "./coordination";
import { ancestors, center, labelRect, sideToward, worldRect, type EdgeGeometry } from "./model";
import {
  distance,
  flattenPath,
  getPathBounds,
  pathFromPoints,
  roundCorners,
  segmentCrossesRect,
} from "./path";
import { inflate, union } from "./spatial";
import type {
  BezierEndpoint,
  BezierGuide,
  EdgeRoutingSettings,
  Route,
  RouteBounds,
  RoutePoint,
  RouteSide,
} from "./types";

const SIDES: readonly RouteSide[] = ["left", "right", "top", "bottom"];

export function labelFamily(id: string, state: RoutingInput): string[] {
  const result: string[] = [],
    seen = new Set<string>();
  let current: string | undefined = id;
  while (current !== undefined && !seen.has(current)) {
    result.push(current);
    seen.add(current);
    current = state.settings.edges[current]?.sourceLabel;
  }
  return result;
}

export function expandLabelFamilies(affected: Set<string>, state: RoutingInput): void {
  const children = new Map<string, string[]>();
  for (const [id, config] of Object.entries(state.settings.edges)) {
    if (config.sourceLabel === undefined) continue;
    const list = children.get(config.sourceLabel) ?? [];
    list.push(id);
    children.set(config.sourceLabel, list);
  }
  const queue = [...affected];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    const parent = state.settings.edges[id]?.sourceLabel;
    for (const member of [...(parent === undefined ? [] : [parent]), ...(children.get(id) ?? [])]) {
      if (affected.has(member)) continue;
      affected.add(member);
      queue.push(member);
    }
  }
}

function boundarySide(point: RoutePoint, bounds: RouteBounds): RouteSide {
  const distances: { side: RouteSide; distance: number }[] = [
    { side: "left", distance: Math.abs(point.x - bounds.x) },
    { side: "right", distance: Math.abs(point.x - bounds.x - bounds.width) },
    { side: "top", distance: Math.abs(point.y - bounds.y) },
    { side: "bottom", distance: Math.abs(point.y - bounds.y - bounds.height) },
  ];
  return distances.sort((a, b) => a.distance - b.distance)[0]!.side;
}
function guide(
  path: BezierGuide["path"],
  from: RouteBounds,
  to: RouteBounds,
): BezierGuide | undefined {
  if (!path) return;
  const points = flattenPath(path);
  const first = points[0],
    last = points.at(-1);
  return first && last
    ? {
        points,
        path,
        sourceDirection: boundarySide(first, from),
        targetDirection: boundarySide(last, to),
      }
    : undefined;
}
function reject(edge: EdgeGeometry, message: string): Route {
  return {
    edgeId: edge.id,
    status: "fallback",
    sections: [],
    diagnostics: [{ code: "CONSTRAINT_VIOLATION", edgeId: edge.id, message }],
  };
}
function endpointBounds(
  edge: EdgeGeometry,
  state: RoutingInput,
  source: boolean,
): RouteBounds | undefined {
  const config = state.settings.edges[edge.id];
  if (source && config?.sourceLabel !== undefined) {
    const parent = state.edges.get(config.sourceLabel);
    return parent && labelRect(parent, state);
  }
  const explicit = source ? config?.bezier?.source : config?.bezier?.target;
  if (explicit) return explicit.kind === "floating" ? explicit.bounds : explicit.owner;
  const node = state.nodes.get(source ? edge.sourceId : edge.targetId);
  const outer = node && worldRect(node, state);
  const attachment = source ? config?.sourceAttachment : config?.targetAttachment;
  return outer && attachment
    ? { ...attachment.bounds, x: outer.x + attachment.bounds.x, y: outer.y + attachment.bounds.y }
    : outer;
}
function choose(sides: readonly RouteSide[], bounds: RouteBounds, toward: RoutePoint): RouteSide {
  const preferred = sideToward(center(bounds), toward);
  return sides.includes(preferred) ? preferred : sides[0]!;
}
function rounded(value: BezierGuide, radius: number): BezierGuide {
  return { ...value, path: value.path ?? roundCorners(pathFromPoints(value.points), { radius }) };
}

export function routeBezierEdge(
  edge: EdgeGeometry,
  state: RoutingInput,
  routes: ReadonlyMap<string, Route>,
  metrics: Metrics,
  batch: Batch,
): Route {
  const config = state.settings.edges[edge.id] ?? {};
  const family =
    config.sourceLabel !== undefined ||
    Object.values(state.settings.edges).some((other) => other.sourceLabel === edge.id);
  if (state.settings.bezier === undefined && config.bezier === undefined && !family)
    return routeEdge(edge, state, "bezier", metrics, batch);
  if (config.bezier?.disabled)
    return reject(edge, "Bézier routing disabled by the edge constraints");
  const ancestry = labelFamily(edge.id, state);
  const repeatedParent = state.settings.edges[ancestry.at(-1)!]?.sourceLabel;
  if (repeatedParent !== undefined && ancestry.includes(repeatedParent))
    return reject(edge, "Cyclic source label reference");
  const sourceBounds = endpointBounds(edge, state, true),
    targetBounds = endpointBounds(edge, state, false),
    label = labelRect(edge, state);
  if (!label) {
    if (family) return reject(edge, "A label chain requires positioned label geometry");
    return routeEdge(edge, state, "bezier", metrics, batch);
  }
  if (!sourceBounds || !targetBounds)
    return reject(edge, "Missing endpoint or source label geometry");
  const declaredSource = config.sourceLabel === undefined ? config.bezier?.source : undefined;
  const sourceSides =
    config.sourceSides ??
    (config.sourceSide
      ? [config.sourceSide]
      : declaredSource?.kind === "floating"
        ? declaredSource.sides
        : declaredSource?.kind === "port"
          ? [declaredSource.direction]
          : SIDES);
  const targetSides =
    config.targetSides ??
    (config.targetSide ? [config.targetSide] : (config.bezier?.target?.sides ?? SIDES));
  const labelSides = config.labelSides ?? SIDES;
  let allowedSource = [...sourceSides];
  if (config.sourceLabel !== undefined) {
    const parent = routes.get(config.sourceLabel);
    if (!parent?.sections.length) return reject(edge, "Source label route was rejected");
    const reserved = new Set<RouteSide>();
    for (const section of parent.sections) {
      if (section.from.kind === "label" && section.from.edgeId === config.sourceLabel)
        reserved.add(boundarySide(section.path.start, sourceBounds));
      if (section.to.kind === "label" && section.to.edgeId === config.sourceLabel)
        reserved.add(
          boundarySide(section.path.segments.at(-1)?.to ?? section.path.start, sourceBounds),
        );
    }
    for (const [id, route] of routes) {
      if (id === edge.id || state.settings.edges[id]?.sourceLabel !== config.sourceLabel) continue;
      if (id > edge.id) continue;
      const section = route.sections[0];
      if (section) reserved.add(boundarySide(section.path.start, sourceBounds));
    }
    allowedSource = allowedSource.filter((side) => !reserved.has(side));
  }
  if (!allowedSource.length || !targetSides.length || !labelSides.length)
    return reject(edge, "No allowed attachment sides remain for this label chain");
  const sourceSide = choose(allowedSource, sourceBounds, center(label));
  const targetNode = state.nodes.get(edge.targetId);
  const targetPort = targetNode?.ports?.find((port) => port.name === edge.targetPort);
  const targetPortSide =
    targetPort?.x !== undefined && targetPort.y !== undefined
      ? sideToward(center(targetBounds), {
          x: targetBounds.x + targetPort.x + (targetPort.width ?? 0) / 2,
          y: targetBounds.y + targetPort.y + (targetPort.height ?? 0) / 2,
        })
      : undefined;
  const targetSide =
    config.targetSide ?? targetPortSide ?? choose(targetSides, targetBounds, center(label));
  if (!targetSides.includes(targetSide))
    return reject(edge, "Target port is outside the allowed attachment sides");
  const avoidObstacles =
    config.bezier?.avoidObstacles ?? state.settings.bezier?.avoidObstacles ?? true;
  const sourceEndpoint: BezierEndpoint =
    config.sourceLabel !== undefined
      ? { kind: "floating", bounds: sourceBounds, sides: allowedSource }
      : (config.bezier?.source ?? positionedSource(edge, state, sourceBounds, allowedSource));
  const adjusted: EdgeRoutingSettings = {
    ...config,
    sourceSide,
    targetSide,
    labelSides,
    ...(sourceEndpoint.kind === "port"
      ? { bezier: { ...config.bezier, source: sourceEndpoint } }
      : {}),
    ...(config.sourceLabel === undefined ? {} : { sourceAttachment: undefined }),
  };
  let guideObstacles = state.obstacles;
  if (config.sourceLabel === undefined)
    guideObstacles = guideObstacles.set(`n:${edge.sourceId}`, sourceBounds);
  guideObstacles = guideObstacles.set(`n:${edge.targetId}`, targetBounds);
  if (avoidObstacles)
    for (const [index, obstacle] of (config.bezier?.obstacles ?? []).entries()) {
      if ([sourceBounds, targetBounds, label].some((bounds) => sameBounds(bounds, obstacle)))
        continue;
      guideObstacles = guideObstacles.set(`bezier:${edge.id}:${index}`, obstacle);
    }
  const guideState: RoutingInput = {
    ...state,
    obstacles: guideObstacles,
    settings: {
      ...state.settings,
      clearance: Math.max(
        state.settings.clearance,
        edge.targetPort === undefined
          ? (config.bezier?.targetClearance ?? state.settings.bezier?.targetClearance ?? 10)
          : 0,
      ),
      edges: { ...state.settings.edges, [edge.id]: adjusted },
    },
  };
  const planned = routeEdge(edge, guideState, "orthogonal", metrics, batch);
  const suppliedGuides = config.waypoints?.length ? undefined : config.bezier?.guides;
  if (
    family &&
    !suppliedGuides &&
    planned.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "ROUTE_BLOCKED" || diagnostic.code === "CONSTRAINT_VIOLATION",
    )
  )
    return reject(edge, "No obstacle-clear guide is available for this label chain");
  let source = suppliedGuides?.source ?? guide(planned.sections[0]?.path, sourceBounds, label);
  let target = suppliedGuides?.target ?? guide(planned.sections.at(-1)?.path, label, targetBounds);
  if (!source || !target || planned.sections.length < 2)
    return reject(edge, "No complete source-label-target guide is available");
  if (!suppliedGuides && edge.targetPort === undefined)
    target = shortenTarget(
      target,
      config.bezier?.targetClearance ?? state.settings.bezier?.targetClearance ?? 10,
    );
  if (sourceEndpoint.kind === "port") {
    source = {
      ...source,
      path: undefined,
      sourceDirection: sourceEndpoint.direction,
      points: [sourceEndpoint.point, sourceEndpoint.escape, ...source.points.slice(1)],
    };
  }
  const excluded = new Set([
    `e:${edge.id}`,
    ...ancestors(edge.sourceId, state).map((id) => `n:${id}`),
    ...ancestors(edge.targetId, state).map((id) => `n:${id}`),
  ]);
  if (config.sourceLabel !== undefined) excluded.add(`e:${config.sourceLabel}`);
  const obstacles =
    config.bezier?.obstacles ??
    [...guideObstacles.bounds].filter(([id]) => !excluded.has(id)).map(([, bounds]) => bounds);
  const inwardSource =
    config.sourceLabel === undefined &&
    sourceEndpoint.kind !== "port" &&
    config.sourceAttachment?.facing === "inward";
  const inwardTarget = config.targetAttachment?.facing === "inward";
  const terminalBounds = [
    ...(config.bezier?.terminalBounds ?? []),
    ...(inwardSource ? [] : [sourceBounds]),
    ...(inwardTarget ? [] : [targetBounds]),
  ];
  const barriers = [...(avoidObstacles ? obstacles : []), ...terminalBounds];
  const fit = (source: BezierGuide, target: BezierGuide, floating = true) =>
    config.waypoints?.length || inwardSource || inwardTarget
      ? { source, target }
      : fitBezierTransition({
          source,
          target,
          label,
          obstacles,
          terminalBounds,
          avoidObstacles,
          attachmentMode: config.bezier?.attachmentMode ?? state.settings.bezier?.attachmentMode,
          targetClearance: config.bezier?.targetClearance ?? state.settings.bezier?.targetClearance,
          labelTangent: config.bezier?.labelTangent,
          endpoints:
            !floating ||
            family ||
            edge.targetPort !== undefined ||
            (config.bezier?.attachmentMode ?? state.settings.bezier?.attachmentMode) ===
              "orthogonal"
              ? undefined
              : {
                  source: sourceEndpoint,
                  target: config.bezier?.target ?? {
                    kind: "floating",
                    bounds: targetBounds,
                    sides: targetSides,
                  },
                },
        });
  const valid = (candidate: { source: BezierGuide; target: BezierGuide }): boolean => {
    const sourcePath = candidate.source.path ?? pathFromPoints(candidate.source.points);
    const targetPath = candidate.target.path ?? pathFromPoints(candidate.target.points);
    const sourceEnd = sourcePath.segments.at(-1)?.to ?? sourcePath.start;
    const targetEnd = targetPath.segments.at(-1)?.to ?? targetPath.start;
    const sourceLabelSide = boundarySide(sourceEnd, label);
    const targetLabelSide = boundarySide(targetPath.start, label);
    return (
      labelSides.includes(sourceLabelSide) &&
      labelSides.includes(targetLabelSide) &&
      (labelSides.length === 1 || sourceLabelSide !== targetLabelSide) &&
      allowedSource.includes(candidate.source.sourceDirection) &&
      (sourceEndpoint.kind === "port"
        ? allowedSource.includes(sourceEndpoint.direction) &&
          followsPort(sourcePath, sourceEndpoint)
        : allowedSource.includes(boundarySide(sourcePath.start, sourceBounds))) &&
      targetSides.includes(candidate.target.targetDirection) &&
      (targetPort?.x !== undefined && targetPort.y !== undefined
        ? targetEnd.x === targetBounds.x + targetPort.x + (targetPort.width ?? 0) / 2 &&
          targetEnd.y === targetBounds.y + targetPort.y + (targetPort.height ?? 0) / 2 &&
          candidate.target.targetDirection === targetSide
        : targetSides.includes(arrivalSide(targetPath, targetBounds))) &&
      safeGuides(candidate, barriers, sourceEndpoint)
    );
  };
  const candidates = [fit(source, target)];
  if (
    !family &&
    edge.targetPort === undefined &&
    (config.bezier?.attachmentMode ?? state.settings.bezier?.attachmentMode) !== "orthogonal"
  )
    candidates.push(fit(source, target, false));
  const guides = [
    {
      source: rounded(source, state.settings.radius),
      target: rounded(target, state.settings.radius),
    },
  ];
  let retrySource = guide(planned.sections[0]?.path, sourceBounds, label);
  let retryTarget = guide(planned.sections.at(-1)?.path, label, targetBounds);
  if (retrySource && sourceEndpoint.kind === "port")
    retrySource = {
      ...retrySource,
      path: undefined,
      sourceDirection: sourceEndpoint.direction,
      points: [sourceEndpoint.point, sourceEndpoint.escape, ...retrySource.points.slice(1)],
    };
  if (retryTarget && edge.targetPort === undefined)
    retryTarget = shortenTarget(
      retryTarget,
      config.bezier?.targetClearance ?? state.settings.bezier?.targetClearance ?? 10,
    );
  if (retrySource && retryTarget) {
    guides.push({ source: retrySource, target: retryTarget });
    if (suppliedGuides) candidates.push(fit(retrySource, retryTarget, false));
  }
  const assess = (candidate: { source: BezierGuide; target: BezierGuide }) => {
    const paths = [candidate.source, candidate.target].map(
      (guide) => guide.path ?? pathFromPoints(guide.points),
    );
    for (const path of paths) {
      const bounds = inflate(getPathBounds(path), state.settings.clearance);
      batch.dependencyBounds = batch.dependencyBounds
        ? union(batch.dependencyBounds, bounds)
        : bounds;
    }
    if (!valid(candidate)) return [];
    const segments = paths.flatMap(pathReservations);
    const conflicts = segments.reduce(
      (cost, segment) => cost + (batch.edgeCost?.(segment.a, segment.b) ?? 0),
      0,
    );
    const length = segments.reduce((cost, segment) => cost + distance(segment.a, segment.b), 0);
    return [{ candidate, conflicts, cost: length + conflicts }];
  };
  const isShaped = (candidate: { source: BezierGuide; target: BezierGuide }) =>
    [candidate.source, candidate.target].some((guide) =>
      guide.path?.segments.some((segment) => segment.kind !== "line"),
    );
  const shaped = candidates
    .filter(isShaped)
    .flatMap(assess)
    .sort((a, b) => a.cost - b.cost);
  const unshaped = [...guides, ...candidates.filter((candidate) => !isShaped(candidate))]
    .flatMap(assess)
    .sort((a, b) => a.cost - b.cost);
  let best = shaped[0] ?? unshaped[0];
  // A shorter guide alone must not discard the requested curve family. A guide
  // can win when it reduces final route conflicts as well as total finite cost.
  if (best && shaped.length)
    for (const candidate of unshaped)
      if (candidate.conflicts < best.conflicts && candidate.cost < best.cost) best = candidate;
  if (!best) return reject(edge, "Bézier paths violate attachment or obstacle constraints");
  const result = best.candidate;
  const diagnostics = planned.diagnostics.filter(
    (diagnostic) => diagnostic.code !== "ROUTE_CONFLICT",
  );
  if (
    [result.source, result.target].some((guide) =>
      pathReservations(guide.path ?? pathFromPoints(guide.points)).some((segment) =>
        batch.conflicts?.(segment.a, segment.b),
      ),
    )
  )
    diagnostics.push({
      code: "ROUTE_CONFLICT",
      edgeId: edge.id,
      message: "Route crosses or overlaps another edge; retained a compact visible path",
    });
  return {
    ...planned,
    status: diagnostics.length ? "fallback" : "routed",
    diagnostics,
    sections: [
      {
        id: `${edge.id}:source-label`,
        from:
          config.sourceLabel === undefined
            ? {
                kind: "node",
                nodeId: edge.sourceId,
                ...(edge.sourcePort === undefined ? {} : { port: edge.sourcePort }),
              }
            : { kind: "label", edgeId: config.sourceLabel },
        to: { kind: "label", edgeId: edge.id },
        fromSide:
          sourceEndpoint.kind === "port" ? sourceEndpoint.direction : result.source.sourceDirection,
        toSide: boundarySide(
          result.source.path?.segments.at(-1)?.to ?? result.source.points.at(-1)!,
          label,
        ),
        path: result.source.path ?? pathFromPoints(result.source.points),
      },
      {
        id: `${edge.id}:label-target`,
        from: { kind: "label", edgeId: edge.id },
        to: {
          kind: "node",
          nodeId: edge.targetId,
          ...(edge.targetPort === undefined ? {} : { port: edge.targetPort }),
        },
        fromSide: boundarySide(result.target.path?.start ?? result.target.points[0]!, label),
        toSide: result.target.targetDirection,
        path: result.target.path ?? pathFromPoints(result.target.points),
      },
    ],
  };
}
function positionedSource(
  edge: EdgeGeometry,
  state: RoutingInput,
  bounds: RouteBounds,
  sides: readonly RouteSide[],
): BezierEndpoint {
  const node = state.nodes.get(edge.sourceId),
    outer = node && worldRect(node, state),
    port = node?.ports?.find((p) => p.name === edge.sourcePort);
  if (outer && port && port.x !== undefined && port.y !== undefined) {
    const point = {
      x: outer.x + port.x + (port.width ?? 0) / 2,
      y: outer.y + port.y + (port.height ?? 0) / 2,
    };
    const direction = state.settings.edges[edge.id]?.sourceSide ?? sideToward(center(outer), point);
    const distance = state.settings.clearance + 1;
    const escape = {
      x:
        direction === "right"
          ? Math.max(point.x, outer.x + outer.width + distance)
          : direction === "left"
            ? Math.min(point.x, outer.x - distance)
            : point.x,
      y:
        direction === "bottom"
          ? Math.max(point.y, outer.y + outer.height + distance)
          : direction === "top"
            ? Math.min(point.y, outer.y - distance)
            : point.y,
    };
    return { kind: "port", point, direction, escape, owner: outer };
  }
  return { kind: "floating", bounds, sides };
}

function shortenTarget(guide: BezierGuide, amount: number): BezierGuide {
  const points = [...guide.points];
  const end = points.at(-1),
    before = points.at(-2);
  if (end && before && amount > 0) {
    const length = Math.hypot(end.x - before.x, end.y - before.y);
    const fraction = length > 0 ? Math.min(amount / length, 1 - 1e-9) : 0;
    points[points.length - 1] = {
      x: end.x + (before.x - end.x) * fraction,
      y: end.y + (before.y - end.y) * fraction,
    };
  }
  return { ...guide, points, path: pathFromPoints(points) };
}

function arrivalSide(path: NonNullable<BezierGuide["path"]>, bounds: RouteBounds): RouteSide {
  const segment = path.segments.at(-1);
  if (!segment) return boundarySide(path.start, bounds);
  const end = segment.to;
  const before =
    segment.kind === "cubic"
      ? segment.control2
      : segment.kind === "quadratic"
        ? segment.control
        : segment.kind === "arc"
          ? (flattenPath(path).at(-2) ?? path.start)
          : (path.segments.at(-2)?.to ?? path.start);
  const dx = end.x - before.x,
    dy = end.y - before.y;
  const hits: { side: RouteSide; t: number }[] = [];
  for (const side of SIDES) {
    const horizontal = side === "left" || side === "right";
    const delta = horizontal ? dx : dy;
    if (Math.abs(delta) < 1e-10) continue;
    const border = horizontal
      ? side === "left"
        ? bounds.x
        : bounds.x + bounds.width
      : side === "top"
        ? bounds.y
        : bounds.y + bounds.height;
    const t = (border - (horizontal ? end.x : end.y)) / delta;
    const cross = horizontal ? end.y + t * dy : end.x + t * dx;
    const low = horizontal ? bounds.y : bounds.x;
    const high = low + (horizontal ? bounds.height : bounds.width);
    if (t >= -1e-6 && cross >= low - 1e-6 && cross <= high + 1e-6) hits.push({ side, t });
  }
  return hits.sort((a, b) => a.t - b.t)[0]?.side ?? boundarySide(end, bounds);
}

function sameBounds(a: RouteBounds, b: RouteBounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
function followsPort(
  path: NonNullable<BezierGuide["path"]>,
  port: Extract<BezierEndpoint, { kind: "port" }>,
): boolean {
  if (path.start.x !== port.point.x || path.start.y !== port.point.y) return false;
  const first = path.segments[0];
  if (!first) return false;
  const toward =
    first.kind === "cubic" ? first.control1 : first.kind === "quadratic" ? first.control : first.to;
  const dx = toward.x - path.start.x;
  const dy = toward.y - path.start.y;
  switch (port.direction) {
    case "left":
      return dx < 0 && Math.abs(dy) < 1e-6;
    case "right":
      return dx > 0 && Math.abs(dy) < 1e-6;
    case "top":
      return dy < 0 && Math.abs(dx) < 1e-6;
    case "bottom":
      return dy > 0 && Math.abs(dx) < 1e-6;
  }
}
function safeGuides(
  guides: { source: BezierGuide; target: BezierGuide },
  obstacles: readonly RouteBounds[],
  source: BezierEndpoint,
): boolean {
  return [guides.source, guides.target].every((guide, index) => {
    const path = guide.path ?? pathFromPoints(guide.points);
    let start = path.start;
    for (const segment of path.segments) {
      for (const obstacle of obstacles) {
        const portPrefix =
          index === 0 &&
          source.kind === "port" &&
          sameBounds(obstacle, source.owner) &&
          start.x === source.point.x &&
          start.y === source.point.y &&
          segment.to.x === source.escape.x &&
          segment.to.y === source.escape.y;
        if (!portPrefix && segmentCrossesRect(start, segment, obstacle)) return false;
      }
      start = segment.to;
    }
    return true;
  });
}
