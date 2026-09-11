import ELK from "./index";
import type { ElkEdge, ElkId, ElkNode, ElkPoint, LaidOutElkNode } from "./types";

export interface StatechartScope {
  /** Direct child of this container; never inferred from state names. */
  initialNodeId?: ElkId;
  /** Connected direct-child path. Explicit paths resolve branching ambiguity. */
  preferredPath?: readonly ElkId[];
  direction?: "UP" | "DOWN" | "LEFT" | "RIGHT";
}

export interface StatechartLayoutOptions {
  scopes: Readonly<Record<string, StatechartScope>>;
  /** Total engine calls, including baseline; integer from 1 to 3. Default 3. */
  maxAttempts?: number;
}

export interface StatechartLayoutScore {
  invalid: number;
  overlaps: number;
  pathOrder: number;
  crossings: number;
  bends: number;
  routeLength: number;
}

export interface StatechartLayoutPlan {
  graph: ElkNode;
  paths: Record<string, ElkId[]>;
  commonExits: Record<string, ElkId[]>;
}

function option(node: ElkNode | ElkEdge, suffix: string): unknown {
  const settings = { ...node.properties, ...node.layoutOptions };
  return settings[suffix] ?? settings[`elk.${suffix}`] ?? settings[`org.eclipse.elk.${suffix}`];
}

const endpoint = (edge: ElkEdge, source: boolean) =>
  source ? (edge.sources?.[0] ?? edge.source) : (edge.targets?.[0] ?? edge.target);

/** Compile semantic hints into settings implemented by this package's ELK adapter. */
export function compileStatechartLayout(
  input: ElkNode,
  scopes: StatechartLayoutOptions["scopes"],
): StatechartLayoutPlan {
  const graph = structuredClone(input);
  const paths: Record<string, ElkId[]> = Object.create(null);
  const commonExits: Record<string, ElkId[]> = Object.create(null);
  const containers = new Map<string, ElkNode>();
  const edges: ElkEdge[] = [];
  const collect = (node: ElkNode) => {
    if (node.id === undefined || containers.has(String(node.id)))
      throw new Error("Statechart nodes require unique IDs");
    containers.set(String(node.id), node);
    edges.push(...(node.edges ?? []));
    node.children?.forEach(collect);
  };
  collect(graph);
  for (const [id, scope] of Object.entries(scopes)) {
    const container = containers.get(id);
    if (!container) throw new Error(`Unknown statechart container: ${id}`);
    const children = container.children ?? [];
    const ids = new Set(children.map((node) => node.id));
    const owner = new Map<ElkId | undefined, ElkId>();
    const own = (node: ElkNode, childId: ElkId) => {
      owner.set(node.id, childId);
      node.ports?.forEach((port) => owner.set(port.id, childId));
      node.children?.forEach((descendant) => own(descendant, childId));
    };
    children.forEach((child) => own(child, child.id!));
    const localEdges = edges.filter(
      (edge) => owner.has(endpoint(edge, true)) && owner.has(endpoint(edge, false)),
    );
    const successors = new Map(children.map((node) => [node.id, new Set<ElkId>()]));
    const predecessors = new Map(children.map((node) => [node.id, new Set<ElkId>()]));
    for (const edge of localEdges) {
      const source = owner.get(endpoint(edge, true))!;
      const target = owner.get(endpoint(edge, false))!;
      if (source === target) continue;
      successors.get(source)!.add(target);
      predecessors.get(target)!.add(source);
    }
    const exits = children
      .filter((node) => successors.get(node.id)!.size === 0 && predecessors.get(node.id)!.size >= 2)
      .map((node) => node.id!);
    commonExits[id] = exits;
    const path = [
      ...(scope.preferredPath ?? (scope.initialNodeId === undefined ? [] : [scope.initialNodeId])),
    ];
    if (new Set(path).size !== path.length || path.some((nodeId) => !ids.has(nodeId))) {
      throw new Error(`Path must contain distinct direct children of ${id}`);
    }
    if (
      scope.initialNodeId !== undefined &&
      (!ids.has(scope.initialNodeId) || (path.length > 0 && path[0] !== scope.initialNodeId))
    ) {
      throw new Error(`Path must start at initial child of ${id}`);
    }
    if (scope.preferredPath) {
      for (let i = 1; i < path.length; i++) {
        if (!successors.get(path[i - 1])?.has(path[i]))
          throw new Error(`Disconnected preferred path in ${id}`);
      }
    } else {
      while (path.length) {
        const next = [...successors.get(path.at(-1))!].filter(
          (nodeId) => !path.includes(nodeId) && !exits.includes(nodeId),
        );
        if (next.length !== 1) break;
        path.push(next[0]);
      }
    }
    paths[id] = path;
    const order = [
      ...path,
      ...children
        .map((node) => node.id!)
        .filter((nodeId) => !path.includes(nodeId) && !exits.includes(nodeId)),
      ...exits.filter((nodeId) => !path.includes(nodeId)),
    ];
    container.children = order.map((nodeId) => children.find((node) => node.id === nodeId)!);
    container.layoutOptions = {
      ...(path.length > 1 && option(container, "layered.cycleBreaking.strategy") === undefined
        ? { "elk.layered.cycleBreaking.strategy": "MODEL_ORDER" }
        : {}),
      ...(path.length > 1 && option(container, "layered.feedbackEdges") === undefined
        ? { "elk.layered.feedbackEdges": true }
        : {}),
      ...container.layoutOptions,
      ...(scope.direction ? { direction: scope.direction } : {}),
    };
  }
  return { graph, paths, commonExits };
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const cross = (a: ElkPoint, b: ElkPoint, c: ElkPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** Diagnostic objective, not a proof of geometric validity. Coordinates are container-relative. */
export function scoreStatechartLayout(
  graph: ElkNode,
  paths: StatechartLayoutPlan["paths"] = {},
): StatechartLayoutScore {
  const score: StatechartLayoutScore = {
    invalid: 0,
    overlaps: 0,
    pathOrder: 0,
    crossings: 0,
    bends: 0,
    routeLength: 0,
  };
  const segments: Array<{ a: ElkPoint; b: ElkPoint; edge: ElkEdge }> = [];
  const boxes: Array<{ rect: Rect; ancestors: ElkNode[]; node?: ElkNode }> = [];
  const rect = (
    shape: { x?: number; y?: number; width?: number; height?: number },
    x: number,
    y: number,
  ): Rect => {
    const values = [shape.x, shape.y, shape.width, shape.height];
    if (
      values.some((value) => value === undefined || !Number.isFinite(value)) ||
      (shape.width ?? 0) < 0 ||
      (shape.height ?? 0) < 0
    )
      score.invalid++;
    return {
      x: x + (shape.x ?? 0),
      y: y + (shape.y ?? 0),
      width: shape.width ?? 0,
      height: shape.height ?? 0,
    };
  };
  const visit = (node: ElkNode, x: number, y: number, ancestors: ElkNode[]) => {
    const direction = String(option(node, "direction") ?? "RIGHT").toUpperCase();
    const horizontal = direction === "RIGHT" || direction === "LEFT";
    const sign = direction === "LEFT" || direction === "UP" ? -1 : 1;
    const path = paths[String(node.id)] ?? [];
    for (let i = 1; i < path.length; i++) {
      const a = node.children?.find((child) => child.id === path[i - 1]);
      const b = node.children?.find((child) => child.id === path[i]);
      if (!a || !b || sign * (horizontal ? b.x! - a.x! : b.y! - a.y!) <= 0) score.pathOrder++;
    }
    for (const child of node.children ?? []) {
      const box = rect(child, x, y);
      if (
        (child.x ?? 0) < 0 ||
        (child.y ?? 0) < 0 ||
        (child.x ?? 0) + (child.width ?? 0) > (node.width ?? Infinity) + 0.001 ||
        (child.y ?? 0) + (child.height ?? 0) > (node.height ?? Infinity) + 0.001
      )
        score.invalid++;
      boxes.push({ rect: box, ancestors, node: child });
      visit(child, box.x, box.y, [...ancestors, child]);
    }
    for (const edge of node.edges ?? []) {
      if (String(option(edge, "noLayout")).toLowerCase() === "true") continue;
      if (!edge.sections?.length) score.invalid++;
      for (const label of edge.labels ?? []) {
        if (label.layoutOptions?.noLayout === true) continue;
        boxes.push({ rect: rect(label, x, y), ancestors });
      }
      for (const section of edge.sections ?? []) {
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
        score.bends += section.bendPoints?.length ?? 0;
        for (const point of points)
          if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) score.invalid++;
        for (let i = 1; i < points.length; i++) {
          const a = { x: x + points[i - 1].x, y: y + points[i - 1].y };
          const b = { x: x + points[i].x, y: y + points[i].y };
          score.routeLength += Math.hypot(b.x - a.x, b.y - a.y);
          segments.push({ a, b, edge });
        }
      }
    }
  };
  visit(graph, 0, 0, [graph]);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      if ((a.node && b.ancestors.includes(a.node)) || (b.node && a.ancestors.includes(b.node)))
        continue;
      if (intersects(a.rect, b.rect)) score.overlaps++;
    }
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i],
        b = segments[j];
      if (a.edge === b.edge) continue;
      if (
        cross(a.a, a.b, b.a) * cross(a.a, a.b, b.b) < 0 &&
        cross(b.a, b.b, a.a) * cross(b.a, b.b, a.b) < 0
      )
        score.crossings++;
    }
  if (!Number.isFinite(score.routeLength)) score.routeLength = Number.MAX_VALUE;
  return score;
}

const objectives = [
  "invalid",
  "overlaps",
  "pathOrder",
  "crossings",
  "bends",
  "routeLength",
] as const;
function better(a: StatechartLayoutScore, b: StatechartLayoutScore) {
  for (const key of objectives) if (a[key] !== b[key]) return a[key] < b[key];
  return false;
}

/** Each attempt starts from original input. No post-layout geometry edits. */
export async function layoutStatechart<T extends ElkNode>(
  input: T,
  options: StatechartLayoutOptions,
) {
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3)
    throw new RangeError("maxAttempts must be an integer from 1 to 3");
  const plan = compileStatechartLayout(input, options.scopes);
  const attempts: Array<{ kind: "baseline" | "policy" | "spacing"; score: StatechartLayoutScore }> =
    [];
  let selected:
    | { graph: LaidOutElkNode<T>; score: StatechartLayoutScore; attempt: number }
    | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = structuredClone(attempt === 0 ? input : plan.graph);
    // Directions are explicit user intent, so apply them to the baseline too.
    const configure = (node: ElkNode) => {
      const scope = Object.hasOwn(options.scopes, String(node.id))
        ? options.scopes[String(node.id)]
        : undefined;
      if (scope?.direction)
        node.layoutOptions = { ...node.layoutOptions, direction: scope.direction };
      if (attempt === 2 && scope)
        node.layoutOptions = {
          ...node.layoutOptions,
          "spacing.nodeNode": Math.max(40, Number(option(node, "spacing.nodeNode") ?? 20) * 1.5),
          "layered.spacing.nodeNodeBetweenLayers": Math.max(
            60,
            Number(option(node, "layered.spacing.nodeNodeBetweenLayers") ?? 20) * 1.5,
          ),
        };
      if (attempt === 2 && scope) {
        // Spread at most three parallel labels over the engine's supported anchors.
        const groups = new Map<string, ElkEdge[]>();
        for (const edge of node.edges ?? []) {
          if (!edge.labels?.length) continue;
          const key = JSON.stringify([endpoint(edge, true), endpoint(edge, false)]);
          const group = groups.get(key) ?? [];
          group.push(edge);
          groups.set(key, group);
        }
        for (const group of groups.values())
          for (let i = 1; i < Math.min(group.length, 3); i++) {
            const edge = group[i];
            if (
              option(edge, "edgeLabels.placement") === undefined &&
              edge.labels!.every((label) => option(label, "edgeLabels.placement") === undefined)
            ) {
              edge.layoutOptions = {
                ...edge.layoutOptions,
                "elk.edgeLabels.placement": i === 1 ? "HEAD" : "TAIL",
              };
            }
          }
      }
      node.children?.forEach(configure);
    };
    configure(candidate);
    const graph = (await new ELK().layout(candidate)) as LaidOutElkNode<T>;
    const score = scoreStatechartLayout(graph, plan.paths);
    attempts.push({
      kind: attempt === 0 ? "baseline" : attempt === 1 ? "policy" : "spacing",
      score,
    });
    if (!selected || better(score, selected.score)) selected = { graph, score, attempt };
  }
  return { ...selected!, attempts, paths: plan.paths, commonExits: plan.commonExits };
}
