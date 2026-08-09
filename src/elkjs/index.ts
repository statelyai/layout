import { createGraph, type Graph } from "@statelyai/graph";
import { getBoxLayout } from "../box";
import { getFixedLayout } from "../fixed";
import { getLayeredLayout } from "../layered";
import { getRectanglePackingLayout } from "../packing";
import { getRandomLayout } from "../random";
import { getSporeCompactionLayout, getSporeOverlapRemovalLayout } from "../spore";
import type {
  ElkConstructorArguments,
  ElkLayoutAlgorithmDescription,
  ElkEdge,
  ElkLayoutArguments,
  ElkLayoutCategoryDescription,
  ElkLayoutOptionDescription,
  ElkNode,
  ElkPoint,
  LaidOutElkNode,
} from "./types";

export type {
  ElkConstructorArguments,
  ElkCommonDescription,
  ElkGraphElement,
  ElkId,
  ElkEdge,
  ElkEdgeSection,
  ElkLabel,
  ElkLayoutArguments,
  ElkLayoutAlgorithmDescription,
  ElkLayoutCategoryDescription,
  ElkLayoutOptionDescription,
  ElkLogging,
  ElkNode,
  ElkPoint,
  ElkPort,
  ElkShape,
  LaidOutElkNode,
} from "./types";

export default class ELK {
  readonly #options: ElkConstructorArguments;
  readonly #algorithmIds: ReadonlySet<string>;

  constructor(options: ElkConstructorArguments = {}) {
    this.#options = options;
    this.#algorithmIds = new Set([
      "box",
      "fixed",
      "random",
      "rectpacking",
      "sporeCompaction",
      "sporeOverlap",
      ...(options.algorithms ?? ["layered"]).filter((id) => id === "layered"),
    ]);
  }

  async knownLayoutAlgorithms(): Promise<ElkLayoutAlgorithmDescription[]> {
    return [...this.#algorithmIds].map((id) => ({
      id,
      name: {
        layered: "Layered",
        box: "Box",
        fixed: "Fixed",
        random: "Random",
        rectpacking: "Rectangle Packing",
        sporeCompaction: "SPOrE Compaction",
        sporeOverlap: "SPOrE Overlap Removal",
      }[id],
      category: id === "layered" ? "layered" : "other",
      knownOptions:
        id === "layered"
          ? [
              "elk.direction",
              "elk.padding",
              "elk.spacing.nodeNode",
              "elk.layered.spacing.nodeNodeBetweenLayers",
            ]
          : id === "box"
            ? ["padding", "spacing.nodeNode", "aspectRatio", "box.packingMode"]
            : id === "random"
              ? ["padding", "spacing.nodeNode", "aspectRatio", "randomSeed"]
              : ["position", "bendPoints"],
    }));
  }

  async knownLayoutOptions(): Promise<ElkLayoutOptionDescription[]> {
    return [
      { id: "elk.algorithm", name: "Layout Algorithm", type: "STRING" },
      { id: "elk.direction", name: "Direction", type: "ENUM" },
      { id: "elk.padding", name: "Padding", type: "OBJECT" },
      { id: "elk.aspectRatio", name: "Aspect Ratio", type: "DOUBLE" },
      { id: "elk.randomSeed", name: "Random Seed", type: "INT" },
      { id: "elk.spacing.nodeNode", name: "Node Spacing", type: "DOUBLE" },
      {
        id: "elk.layered.spacing.nodeNodeBetweenLayers",
        name: "Layer Spacing",
        type: "DOUBLE",
      },
    ];
  }

  async knownLayoutCategories(): Promise<ElkLayoutCategoryDescription[]> {
    return [
      {
        id: "layered",
        name: "Layered",
        knownLayouters: this.#algorithmIds.has("layered") ? ["layered"] : [],
      },
      { id: "other", name: "Other", knownLayouters: ["box", "fixed", "random"] },
    ];
  }

  terminateWorker(): void {}

  async layout<T extends ElkNode>(
    graph: T,
    arguments_: ElkLayoutArguments = {},
  ): Promise<LaidOutElkNode<T>> {
    const startedAt = performance.now();
    if (graph === undefined || graph === null) {
      throw new TypeError("Missing mandatory parameter: graph");
    }
    if (
      typeof graph.id !== "string" &&
      !(typeof graph.id === "number" && Number.isInteger(graph.id))
    ) {
      throw new TypeError("Graph id must be a string or integer");
    }
    delete graph.logging;
    const layoutOptions = {
      ...this.#options.defaultLayoutOptions,
      ...arguments_.layoutOptions,
      ...graph.properties,
      ...graph.layoutOptions,
    };
    const requestedAlgorithm = String(getOption(layoutOptions, "algorithm") ?? "layered");
    const algorithm = requestedAlgorithm.replace(/^(?:org\.eclipse\.)?elk\./, "");
    if (
      algorithm !== "layered" &&
      algorithm !== "box" &&
      algorithm !== "fixed" &&
      algorithm !== "random" &&
      algorithm !== "rectpacking" &&
      algorithm !== "sporeCompaction" &&
      algorithm !== "sporeOverlap"
    ) {
      throw new Error(
        `org.eclipse.elk.core.UnsupportedConfigurationException: Layout algorithm '${requestedAlgorithm}' not found`,
      );
    }
    const hasHierarchy = (graph.children ?? []).some((child) => (child.children?.length ?? 0) > 0);
    const hierarchyHandling = getOption(layoutOptions, "hierarchyHandling");
    if (
      hasHierarchy &&
      hierarchyHandling !== undefined &&
      hierarchyHandling !== "INCLUDE_CHILDREN"
    ) {
      throw new Error(
        "org.eclipse.elk.core.UnsupportedGraphException: Hierarchical edges require INCLUDE_CHILDREN",
      );
    }
    if (hasHierarchy) {
      for (const child of graph.children ?? []) {
        if ((child.children?.length ?? 0) === 0) continue;
        await this.layout(child, {
          ...arguments_,
          layoutOptions: {
            ...arguments_.layoutOptions,
            hierarchyHandling: "INCLUDE_CHILDREN",
          },
          logging: false,
          measureExecutionTime: false,
        });
      }
    }
    const graph_ = toGraph(graph);
    const padding = parsePadding(getOption(layoutOptions, "padding"));
    const constrainedLayerByNodeId = new Map(
      (graph.children ?? []).flatMap((node) =>
        getOption(node.layoutOptions ?? {}, "layerConstraint") === "FIRST"
          ? [[String(node.id), 0] as const]
          : [],
      ),
    );
    if (
      algorithm === "layered" &&
      graph_.edges.some((edge) => {
        const sourceLayer = constrainedLayerByNodeId.get(edge.sourceId);
        const targetLayer = constrainedLayerByNodeId.get(edge.targetId);
        return sourceLayer !== undefined && targetLayer !== undefined && targetLayer <= sourceLayer;
      })
    ) {
      throw new Error(
        "org.eclipse.elk.core.UnsupportedConfigurationException: Layer constraints conflict",
      );
    }
    const laidOut =
      algorithm === "sporeCompaction"
        ? getSporeCompactionLayout(graph_, {
            padding,
            spacing: getNumberOption(layoutOptions, "spacing.nodeNode"),
          })
        : algorithm === "sporeOverlap"
          ? getSporeOverlapRemovalLayout(graph_, {
              padding,
              spacing: getNumberOption(layoutOptions, "spacing.nodeNode"),
            })
          : algorithm === "rectpacking"
            ? getRectanglePackingLayout(graph_, {
                padding,
                spacing: getNumberOption(layoutOptions, "spacing.nodeNode"),
              })
            : algorithm === "random"
              ? getRandomLayout(graph_, {
                  padding: getOption(layoutOptions, "padding") === undefined ? 15 : padding,
                  spacing: getNumberOption(layoutOptions, "spacing.nodeNode"),
                  aspectRatio: getNumberOption(layoutOptions, "aspectRatio"),
                  seed: getNumberOption(layoutOptions, "randomSeed"),
                })
              : algorithm === "box"
                ? getBoxLayout(graph_, {
                    padding: getOption(layoutOptions, "padding") === undefined ? 15 : padding,
                    spacing: getNumberOption(layoutOptions, "spacing.nodeNode"),
                    aspectRatio: getNumberOption(layoutOptions, "aspectRatio"),
                    interactive: getBooleanOption(layoutOptions, "interactive"),
                    expandNodes: getBooleanOption(layoutOptions, "expandNodes"),
                    priority: (node) => {
                      const child = graph.children?.find(
                        (candidate) => String(candidate.id) === node.id,
                      );
                      return getNumberOption(child?.layoutOptions ?? {}, "priority");
                    },
                  })
                : algorithm === "fixed"
                  ? getFixedLayout(graph_, { direction: getDirection(layoutOptions) })
                  : getLayeredLayout(graph_, {
                      direction: getDirection(layoutOptions),
                      spacing: {
                        node: getNumberOption(layoutOptions, "spacing.nodeNode"),
                        layer: getNumberOption(
                          layoutOptions,
                          "layered.spacing.nodeNodeBetweenLayers",
                        ),
                      },
                      padding,
                      constraints: {
                        layer: (node) => constrainedLayerByNodeId.get(node.id),
                      },
                    });
    applyLayout(graph, laidOut, padding, layoutOptions);
    if (arguments_.logging || arguments_.measureExecutionTime) {
      graph.logging = {
        name: "Native TypeScript layout",
        children: [{ name: String(algorithm) }],
        ...(arguments_.measureExecutionTime
          ? { executionTime: (performance.now() - startedAt) / 1_000 }
          : {}),
      };
    }
    return graph as LaidOutElkNode<T>;
  }
}

function parsePadding(value: unknown) {
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value };
  }
  if (typeof value !== "string") {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const padding = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const match of value.matchAll(/(top|right|bottom|left)\s*=\s*(-?\d+(?:\.\d+)?)/g)) {
    const side = match[1] as keyof typeof padding;
    padding[side] = Number(match[2]);
  }
  return padding;
}

function getOption(options: Readonly<Record<string, unknown>>, suffix: string): unknown {
  const exactKeys = [suffix, `elk.${suffix}`, `org.eclipse.elk.${suffix}`];
  for (const key of exactKeys) {
    if (options[key] !== undefined) return options[key];
  }
  const match = Object.entries(options).find(([key]) => key.endsWith(`.${suffix}`));
  return match?.[1];
}

function getNumberOption(
  options: Readonly<Record<string, unknown>>,
  suffix: string,
): number | undefined {
  const value = getOption(options, suffix);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function getBooleanOption(
  options: Readonly<Record<string, unknown>>,
  suffix: string,
): boolean | undefined {
  const value = getOption(options, suffix);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
}

function getDirection(
  options: Readonly<Record<string, unknown>>,
): "up" | "down" | "left" | "right" {
  const direction = String(getOption(options, "direction") ?? "DOWN").toLowerCase();
  return direction === "up" || direction === "left" || direction === "right" ? direction : "down";
}

function endpoint(
  value: unknown,
  portOwnerById: ReadonlyMap<string, string>,
): { nodeId: string; port?: string } {
  const id = String(value);
  const ownerId = portOwnerById.get(id);
  return ownerId === undefined ? { nodeId: id } : { nodeId: ownerId, port: id };
}

function toGraph(root: ElkNode): Graph {
  const children = root.children ?? [];
  const nodeIds = new Set(children.map((child) => String(child.id)));
  const portOwnerById = new Map<string, string>();
  for (const child of children) {
    for (const port of child.ports ?? []) {
      if (port.id !== undefined) portOwnerById.set(String(port.id), String(child.id));
    }
  }

  return createGraph({
    id: String(root.id),
    nodes: children.map((child) => ({
      id: String(child.id),
      x: child.x,
      y: child.y,
      ...parsePosition(getOption(child.layoutOptions ?? {}, "position")),
      width: child.width,
      height: child.height,
      label: child.labels?.[0]?.text,
      ports: child.ports?.map((port) => ({
        name: String(port.id),
        direction: "inout" as const,
        x: port.x,
        y: port.y,
        width: port.width,
        height: port.height,
      })),
    })),
    edges: (root.edges ?? []).flatMap((edge) => {
      const source = endpoint(edge.sources?.[0] ?? edge.source, portOwnerById);
      const target = endpoint(edge.targets?.[0] ?? edge.target, portOwnerById);
      return nodeIds.has(source.nodeId) && nodeIds.has(target.nodeId)
        ? [
            {
              id: String(edge.id),
              sourceId: source.nodeId,
              targetId: target.nodeId,
              sourcePort: source.port,
              targetPort: target.port,
              label: edge.labels?.[0]?.text,
              width: edge.labels?.[0]?.width,
              height: edge.labels?.[0]?.height,
              points: parsePoints(getOption(edge.layoutOptions ?? {}, "bendPoints")),
            },
          ]
        : [];
    }),
  });
}

function parsePoints(value: unknown): ElkPoint[] | undefined {
  if (typeof value !== "string") return undefined;
  const points = [...value.matchAll(/\{\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\}/g)].map(
    (match) => ({ x: Number(match[1]), y: Number(match[2]) }),
  );
  return points.length > 0 ? points : undefined;
}

function parsePosition(value: unknown): ElkPoint | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : undefined;
}

function toSection(edge: ElkEdge, points: readonly ElkPoint[]) {
  const startPoint = points[0];
  const endPoint = points.at(-1);
  if (!startPoint || !endPoint) return undefined;
  return {
    id: `${String(edge.id)}_s0`,
    startPoint: { ...startPoint },
    endPoint: { ...endPoint },
    ...(points.length > 2
      ? { bendPoints: points.slice(1, -1).map((point) => ({ ...point })) }
      : {}),
  };
}

function applyLayout(
  root: ElkNode,
  graph: ReturnType<typeof getLayeredLayout>,
  padding: { top: number; right: number; bottom: number; left: number },
  layoutOptions: Readonly<Record<string, unknown>>,
): void {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  for (const child of root.children ?? []) {
    const node = nodeById.get(String(child.id));
    if (!node) continue;
    child.x = node.x;
    child.y = node.y;
    child.width = node.width;
    child.height = node.height;
    placeNodeLabels(child, layoutOptions);
    for (const port of child.ports ?? []) {
      const laidOutPort = node.ports?.find((candidate) => candidate.name === String(port.id));
      if (!laidOutPort) continue;
      port.x = laidOutPort.x;
      port.y = laidOutPort.y;
      port.width = laidOutPort.width;
      port.height = laidOutPort.height;
    }
  }
  for (const edge of root.edges ?? []) {
    const laidOutEdge = edgeById.get(String(edge.id));
    if (!laidOutEdge) {
      const section = getParentEdgeSection(root, edge);
      if (section) edge.sections = [section];
      continue;
    }
    const section = toSection(edge, laidOutEdge.points ?? []);
    edge.sections = section ? [section] : [];
    const label = edge.labels?.[0];
    if (label) {
      label.x = laidOutEdge.x;
      label.y = laidOutEdge.y;
      label.width = laidOutEdge.width;
      label.height = laidOutEdge.height;
    }
  }
  root.width = Math.max(0, ...graph.nodes.map((node) => node.x + node.width)) + padding.right;
  root.height = Math.max(0, ...graph.nodes.map((node) => node.y + node.height)) + padding.bottom;
}

function getParentEdgeSection(root: ElkNode, edge: ElkEdge) {
  const sourceId = String(edge.sources?.[0] ?? edge.source);
  const targetId = String(edge.targets?.[0] ?? edge.target);
  const rootId = String(root.id);
  const source = root.children?.find((child) => String(child.id) === sourceId);
  const target = root.children?.find((child) => String(child.id) === targetId);
  if (source && targetId === rootId) {
    const startPoint = {
      x: (source.x ?? 0) + (source.width ?? 0) / 2,
      y: (source.y ?? 0) + (source.height ?? 0),
    };
    return {
      id: `${String(edge.id)}_s0`,
      startPoint,
      endPoint: { x: startPoint.x, y: 0 },
    };
  }
  if (sourceId === rootId && target) {
    const endPoint = {
      x: (target.x ?? 0) + (target.width ?? 0) / 2,
      y: target.y ?? 0,
    };
    return {
      id: `${String(edge.id)}_s0`,
      startPoint: { x: endPoint.x, y: 0 },
      endPoint,
    };
  }
  return undefined;
}

function placeNodeLabels(node: ElkNode, globalOptions: Readonly<Record<string, unknown>>): void {
  for (const label of node.labels ?? []) {
    const placement = String(
      getOption(
        { ...globalOptions, ...node.layoutOptions, ...label.layoutOptions },
        "nodeLabels.placement",
      ) ?? "",
    );
    if (!placement) continue;
    const width = label.width ?? 0;
    const height = label.height ?? 0;
    const nodeWidth = node.width ?? 0;
    const nodeHeight = node.height ?? 0;
    label.x = placement.includes("H_CENTER")
      ? (nodeWidth - width) / 2
      : placement.includes("H_RIGHT")
        ? nodeWidth - width
        : 0;
    if (placement.includes("OUTSIDE") && placement.includes("V_TOP")) {
      label.y = -height - 5;
    } else if (placement.includes("OUTSIDE") && placement.includes("V_BOTTOM")) {
      label.y = nodeHeight + 5;
    } else if (placement.includes("V_CENTER")) {
      label.y = (nodeHeight - height) / 2;
    } else if (placement.includes("V_BOTTOM")) {
      label.y = nodeHeight - height;
    } else {
      label.y = 0;
    }
  }
}
