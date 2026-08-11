import { createGraph, type Graph } from "@statelyai/graph";
import { getBoxLayout } from "../box";
import { getFixedLayout } from "../fixed";
import { getLayeredLayout } from "../layered";
import {
  elkLayeredOptionDefinitions,
  type ElkLayeredOptionValueByName,
  type LayeredAdvancedOptions,
} from "../layered/elk-options";
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
  ElkPort,
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
      id: id === "layered" ? "org.eclipse.elk.layered" : id,
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
          ? elkLayeredOptionDefinitions.map((definition) => definition.elkId)
          : id === "box"
            ? ["padding", "spacing.nodeNode", "aspectRatio", "box.packingMode"]
            : id === "random"
              ? ["padding", "spacing.nodeNode", "aspectRatio", "randomSeed"]
              : ["position", "bendPoints"],
    }));
  }

  async knownLayoutOptions(): Promise<ElkLayoutOptionDescription[]> {
    return [
      { id: "org.eclipse.elk.algorithm", name: "Layout Algorithm", type: "STRING" },
      ...elkLayeredOptionDefinitions.map((definition) => ({
        id: definition.elkId,
        name: definition.name,
        type: definition.type,
        targets: [...definition.targets],
      })),
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
    const insideSelfLoopBaseHeightByNodeId = new Map<string, number>();
    const hierarchyHandling = getOption(layoutOptions, "hierarchyHandling");
    const topdownLayout = getBooleanOption(layoutOptions, "topdownLayout") === true;
    if (hasHierarchy && topdownLayout && hierarchyHandling === "INCLUDE_CHILDREN") {
      throw new Error(
        "org.eclipse.elk.core.UnsupportedConfigurationException: Topdown layout cannot be used together with hierarchy handling.",
      );
    }
    if (
      hasHierarchy &&
      hierarchyHandling !== undefined &&
      hierarchyHandling !== "INCLUDE_CHILDREN"
    ) {
      throw new Error(
        "org.eclipse.elk.core.UnsupportedGraphException: Hierarchical edges require INCLUDE_CHILDREN",
      );
    }
    if (hasHierarchy && topdownLayout) {
      if (getOption(layoutOptions, "topdown.nodeType") === undefined) {
        throw new Error(`${String(graph.id)} has not been assigned a top-down node type.`);
      }
      for (const child of graph.children ?? []) {
        if ((child.children?.length ?? 0) === 0) continue;
        const childOptions = { ...layoutOptions, ...child.layoutOptions };
        const childPadding = parsePadding(getOption(childOptions, "padding"), 12);
        const width = getNumberOption(childOptions, "topdown.hierarchicalNodeWidth") ?? 0;
        const aspectRatio =
          getNumberOption(childOptions, "topdown.hierarchicalNodeAspectRatio") ?? 1 / Math.sqrt(2);
        child.width = Math.max(child.width ?? 0, width + childPadding.left + childPadding.right);
        child.height = Math.max(
          child.height ?? 0,
          width / aspectRatio + childPadding.top + childPadding.bottom,
        );
      }
    } else if (hasHierarchy) {
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
        const insideLoopCount = (graph.edges ?? []).filter((edge) =>
          isInsideSelfLoop(graph, edge, String(child.id)),
        ).length;
        if (insideLoopCount > 0) {
          const baseHeight = child.height ?? 0;
          insideSelfLoopBaseHeightByNodeId.set(String(child.id), baseHeight);
          child.height = baseHeight + insideLoopCount * 11;
        }
      }
    }
    applyNodeMicroLayout(graph, layoutOptions);
    const graph_ = toGraph(graph, layoutOptions);
    const layerConstraintByNodeId = new Map(
      (graph.children ?? []).map((node) => [
        String(node.id),
        String(
          getOption(node.layoutOptions ?? {}, "layered.layering.layerConstraint") ??
            getOption(node.layoutOptions ?? {}, "layerConstraint") ??
            "NONE",
        ),
      ]),
    );
    if (
      algorithm === "layered" &&
      graph_.edges.some((edge) => {
        const sourceConstraint = layerConstraintByNodeId.get(edge.sourceId);
        const targetConstraint = layerConstraintByNodeId.get(edge.targetId);
        return (
          (sourceConstraint === "FIRST" || sourceConstraint === "FIRST_SEPARATE") &&
          (targetConstraint === "FIRST" || targetConstraint === "FIRST_SEPARATE")
        );
      })
    ) {
      throw new Error(
        "org.eclipse.elk.core.UnsupportedConfigurationException: Layer constraints conflict",
      );
    }
    const padding = parsePadding(
      getOption(layoutOptions, "padding"),
      algorithm === "layered" ? 12 : 0,
    );
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
                        layer: () => undefined,
                      },
                      settings: getLayeredSettings(layoutOptions),
                      nodeSettings: (node) => {
                        const child = graph.children?.find(
                          (candidate) => String(candidate.id) === node.id,
                        );
                        return getElementLayeredSettings(child?.layoutOptions ?? {});
                      },
                      edgeSettings: (edge) => {
                        const elkEdge = graph.edges?.find(
                          (candidate) => String(candidate.id) === edge.id,
                        );
                        return {
                          ...getElementLayeredSettings(elkEdge?.layoutOptions ?? {}),
                          ...getElementLayeredSettings(elkEdge?.labels?.[0]?.layoutOptions ?? {}),
                        };
                      },
                      portSettings: (port, node) => {
                        const child = graph.children?.find(
                          (candidate) => String(candidate.id) === node.id,
                        );
                        const elkPort = child?.ports?.find(
                          (candidate) => String(candidate.id) === port.name,
                        );
                        return {
                          ...getElementLayeredSettings(elkPort?.layoutOptions ?? {}),
                          "port.labelWidth": Math.max(
                            0,
                            ...(elkPort?.labels ?? []).map((label) => label.width ?? 0),
                          ),
                          "port.labelHeight": Math.max(
                            0,
                            ...(elkPort?.labels ?? []).map((label) => label.height ?? 0),
                          ),
                        } as ElkLayeredOptionValueByName;
                      },
                    });
    applyLayout(graph, laidOut, padding, layoutOptions);
    if (hasHierarchy && topdownLayout) {
      for (const child of graph.children ?? []) {
        if ((child.children?.length ?? 0) === 0) continue;
        const position = { x: child.x, y: child.y };
        await this.layout(child, {
          ...arguments_,
          logging: false,
          measureExecutionTime: false,
        });
        child.x = position.x;
        child.y = position.y;
      }
    }
    applyInsideSelfLoops(graph, insideSelfLoopBaseHeightByNodeId);
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

function parsePadding(value: unknown, fallback = 0) {
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value };
  }
  if (typeof value !== "string") {
    return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  }
  const padding = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const match of value.matchAll(/(top|right|bottom|left)\s*=\s*(-?\d+(?:\.\d+)?)/g)) {
    const side = match[1] as keyof typeof padding;
    padding[side] = Number(match[2]);
  }
  return padding;
}

function parseVector(value: unknown): ElkPoint | undefined {
  if (typeof value === "object" && value !== null && "x" in value && "y" in value) {
    return { x: Number(value.x), y: Number(value.y) };
  }
  if (typeof value !== "string") return undefined;
  const match = value.match(/^\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : undefined;
}

function applyNodeMicroLayout(
  graph: ElkNode,
  globalOptions: Readonly<Record<string, unknown>>,
): void {
  const labelPadding = parsePadding(getOption(globalOptions, "nodeLabels.padding"), 5);
  for (const node of graph.children ?? []) {
    const constraints = String(getOption(node.layoutOptions ?? {}, "nodeSize.constraints") ?? "");
    if (!constraints) continue;
    const configuredSizeOptions = getOption(node.layoutOptions ?? {}, "nodeSize.options");
    const sizeOptions = new Set(
      configuredSizeOptions === undefined
        ? ["DEFAULT_MINIMUM_SIZE"]
        : String(configuredSizeOptions)
            .split(/[\s,;]+/)
            .filter(Boolean),
    );
    const effectivelyFixedPortLabelSize =
      constraints.includes("PORT_LABELS") &&
      !constraints.includes("NODE_LABELS") &&
      !constraints.includes("MINIMUM_SIZE");
    let width = effectivelyFixedPortLabelSize ? (node.width ?? 0) : 0;
    let height = effectivelyFixedPortLabelSize ? (node.height ?? 0) : 0;
    let insideHorizontalInset = 0;
    let insideVerticalInset = 0;
    const insideLabelCells = new Map<string, { width: number; height: number }>();
    if (constraints.includes("NODE_LABELS")) {
      for (const label of node.labels ?? []) {
        if (!label.text) continue;
        const placement = String(
          getOption(
            { ...globalOptions, ...node.layoutOptions, ...label.layoutOptions },
            "nodeLabels.placement",
          ) ?? "",
        );
        if (!placement) continue;
        const labelWidth = label.width ?? 0;
        const labelHeight = label.height ?? 0;
        if (placement.includes("OUTSIDE")) {
          if (!sizeOptions.has("OUTSIDE_NODE_LABELS_OVERHANG")) {
            width = Math.max(width, labelWidth);
          }
        } else {
          width = Math.max(width, labelWidth + labelPadding.left + labelPadding.right);
          const verticalInset =
            labelHeight * (placement.includes("V_CENTER") ? 1 : 2) +
            labelPadding.top +
            labelPadding.bottom;
          height = Math.max(height, verticalInset);
          insideHorizontalInset = Math.max(
            insideHorizontalInset,
            labelPadding.left + labelPadding.right,
          );
          insideVerticalInset = Math.max(insideVerticalInset, verticalInset);
          const row = placement.includes("V_CENTER")
            ? "center"
            : placement.includes("V_BOTTOM")
              ? "bottom"
              : "top";
          const column = placement.includes("H_CENTER")
            ? "center"
            : placement.includes("H_RIGHT")
              ? "right"
              : "left";
          const key = `${row}:${column}`;
          const cell = insideLabelCells.get(key) ?? { width: 0, height: 0 };
          cell.width = Math.max(cell.width, labelWidth);
          cell.height += labelHeight;
          insideLabelCells.set(key, cell);
        }
      }
      if (insideLabelCells.size > 0) {
        const rows = ["top", "center", "bottom"] as const;
        const columns = ["left", "center", "right"] as const;
        const cellWidth = (row: string, column: string) =>
          insideLabelCells.get(`${row}:${column}`)?.width ?? 0;
        const forceTabular = sizeOptions.has("FORCE_TABULAR_NODE_LABELS");
        const asymmetrical = sizeOptions.has("ASYMMETRICAL");
        const globalColumns = columns.map((column) =>
          Math.max(...rows.map((row) => cellWidth(row, column))),
        );
        const labelGridWidth = forceTabular
          ? globalColumns.reduce((sum, value) => sum + value, 0)
          : Math.max(
              ...rows.map((row) => {
                const left = cellWidth(row, "left");
                const center = cellWidth(row, "center");
                const right = cellWidth(row, "right");
                return asymmetrical ? left + center + right : 2 * Math.max(left, right) + center;
              }),
            );
        const labelGridHeight = rows.reduce(
          (sum, row) =>
            sum +
            Math.max(
              ...columns.map((column) => insideLabelCells.get(`${row}:${column}`)?.height ?? 0),
            ),
          0,
        );
        width = Math.max(width, labelGridWidth + labelPadding.left + labelPadding.right);
        height = Math.max(height, labelGridHeight + labelPadding.top + labelPadding.bottom);
      }
    }
    if (constraints.includes("MINIMUM_SIZE")) {
      const configuredMinimum = parseVector(
        getOption(node.layoutOptions ?? {}, "nodeSize.minimum"),
      );
      const minimum = {
        x:
          configuredMinimum?.x && configuredMinimum.x > 0
            ? configuredMinimum.x
            : sizeOptions.has("DEFAULT_MINIMUM_SIZE")
              ? 20
              : 0,
        y:
          configuredMinimum?.y && configuredMinimum.y > 0
            ? configuredMinimum.y
            : sizeOptions.has("DEFAULT_MINIMUM_SIZE")
              ? 20
              : 0,
      };
      if (sizeOptions.has("MINIMUM_SIZE_ACCOUNTS_FOR_PADDING")) {
        width = Math.max(width, minimum.x + insideHorizontalInset);
        height = Math.max(height, minimum.y + insideVerticalInset);
      } else {
        width = Math.max(width, minimum.x);
        height = Math.max(height, minimum.y);
      }
    }
    // Reading COMPUTE_PADDING is intentional: elkjs does not serialize the computed padding property.
    void sizeOptions.has("COMPUTE_PADDING");
    node.width = width;
    node.height = height;
  }
}

function getOption(options: Readonly<Record<string, unknown>>, suffix: string): unknown {
  const exactKeys = [suffix, `elk.${suffix}`, `org.eclipse.elk.${suffix}`];
  for (const key of exactKeys) {
    if (options[key] !== undefined) return options[key];
  }
  return undefined;
}

const ergonomicallyMappedLayeredSettings = new Set<keyof ElkLayeredOptionValueByName>([
  "direction",
  "padding",
  "spacing.node",
  "spacing.layer",
]);

function coerceLayeredOptionValue(value: unknown, type: string): unknown {
  if (type === "BOOLEAN") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() === "true";
  }
  if (type === "DOUBLE" || type === "INT") {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") return Number(value);
  }
  return value;
}

function parseIndividualSpacing(value: unknown): unknown {
  if (typeof value === "object" && value !== null) return value;
  if (typeof value !== "string") return value;
  const result: Record<string, number> = {};
  for (const entry of value.split(/;,;|;/)) {
    const match = entry.match(
      /^\s*(?:org\.eclipse\.elk\.)?(?:layered\.)?([^:]+)\s*:\s*(-?\d+(?:\.\d+)?)\s*$/,
    );
    if (!match) continue;
    const sourceName = match[1]!;
    const definition = elkLayeredOptionDefinitions.find((candidate) => {
      const suffix = candidate.elkId.replace(/^org\.eclipse\.elk\./, "");
      return candidate.name === sourceName || suffix === sourceName;
    });
    if (definition) result[definition.name] = Number(match[2]);
  }
  return result;
}

function parseMargin(value: unknown): unknown {
  if (typeof value === "object" && value !== null) return value;
  if (typeof value !== "string") return value;
  return parsePadding(value, 0);
}

function getElementLayeredSettings(
  options: Readonly<Record<string, unknown>>,
): ElkLayeredOptionValueByName {
  const settings: ElkLayeredOptionValueByName = {};
  for (const definition of elkLayeredOptionDefinitions) {
    const suffix = definition.elkId.replace(/^org\.eclipse\.elk\./, "");
    const value = [definition.name, suffix, `elk.${suffix}`, definition.elkId]
      .map((key) => options[key])
      .find((candidate) => candidate !== undefined);
    if (value === undefined) continue;
    const vectorMatch =
      definition.name === "port.anchor" && typeof value === "string"
        ? value.match(/^\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/)
        : undefined;
    settings[definition.name] = (
      vectorMatch
        ? { x: Number(vectorMatch[1]), y: Number(vectorMatch[2]) }
        : definition.name === "spacing.individual"
          ? parseIndividualSpacing(value)
          : definition.name === "spacing.portsSurrounding"
            ? parseMargin(value)
            : coerceLayeredOptionValue(value, definition.type)
    ) as never;
  }
  return settings;
}

function getLayeredSettings(options: Readonly<Record<string, unknown>>): LayeredAdvancedOptions {
  const settings = getElementLayeredSettings(options);
  for (const name of ergonomicallyMappedLayeredSettings) delete settings[name];
  return settings as LayeredAdvancedOptions;
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
  const direction = String(getOption(options, "direction") ?? "RIGHT").toLowerCase();
  return direction === "up" || direction === "left" || direction === "down" ? direction : "right";
}

function endpoint(
  value: unknown,
  portOwnerById: ReadonlyMap<string, string>,
): { nodeId: string; port?: string } {
  const id = String(value);
  const ownerId = portOwnerById.get(id);
  return ownerId === undefined ? { nodeId: id } : { nodeId: ownerId, port: id };
}

function isInsideSelfLoop(root: ElkNode, edge: ElkEdge, expectedNodeId?: string): boolean {
  const source = String(edge.sources?.[0] ?? edge.source);
  const target = String(edge.targets?.[0] ?? edge.target);
  if (source !== target || (expectedNodeId !== undefined && source !== expectedNodeId))
    return false;
  const node = root.children?.find((child) => String(child.id) === source);
  return (
    getBooleanOption(node?.layoutOptions ?? {}, "insideSelfLoops.activate") === true &&
    getBooleanOption(edge.layoutOptions ?? {}, "insideSelfLoops.yo") === true
  );
}

function applyInsideSelfLoops(
  root: ElkNode,
  baseHeightByNodeId: ReadonlyMap<string, number>,
): void {
  const indexByNodeId = new Map<string, number>();
  for (const edge of root.edges ?? []) {
    if (!isInsideSelfLoop(root, edge)) continue;
    const nodeId = String(edge.sources?.[0] ?? edge.source);
    const node = root.children?.find((child) => String(child.id) === nodeId);
    const baseHeight = baseHeightByNodeId.get(nodeId);
    if (!node || baseHeight === undefined) continue;
    const index = indexByNodeId.get(nodeId) ?? 0;
    indexByNodeId.set(nodeId, index + 1);
    const y = (node.y ?? 0) + baseHeight - 2 + index * 11;
    edge.sections = [
      {
        id: `${String(edge.id)}_s0`,
        startPoint: { x: node.x ?? 0, y },
        endPoint: { x: (node.x ?? 0) + (node.width ?? 0), y },
        incomingShape: edge.sources?.[0] ?? edge.source,
        outgoingShape: edge.targets?.[0] ?? edge.target,
      },
    ];
  }
}

function toGraph(root: ElkNode, globalOptions: Readonly<Record<string, unknown>> = {}): Graph {
  const children = (root.children ?? []).filter(
    (child) => getBooleanOption(child.layoutOptions ?? {}, "noLayout") !== true,
  );
  const nodeIds = new Set(children.map((child) => String(child.id)));
  const portOwnerById = new Map<string, string>();
  for (const child of children) {
    for (const port of child.ports ?? []) {
      if (port.id !== undefined) portOwnerById.set(String(port.id), String(child.id));
    }
  }
  const sourcePortIds = new Set(
    (root.edges ?? []).flatMap((edge) =>
      (edge.sources ?? (edge.source === undefined ? [] : [edge.source])).map(String),
    ),
  );
  const targetPortIds = new Set(
    (root.edges ?? []).flatMap((edge) =>
      (edge.targets ?? (edge.target === undefined ? [] : [edge.target])).map(String),
    ),
  );
  const sourcePortDegree = new Map<string, number>();
  const targetPortDegree = new Map<string, number>();
  const edgeModelOrderByPortId = new Map<string, number>();
  for (const [edgeIndex, edge] of (root.edges ?? []).entries()) {
    for (const source of edge.sources ?? (edge.source === undefined ? [] : [edge.source])) {
      const id = String(source);
      sourcePortDegree.set(id, (sourcePortDegree.get(id) ?? 0) + 1);
      if (portOwnerById.has(id) && !edgeModelOrderByPortId.has(id)) {
        edgeModelOrderByPortId.set(id, edgeIndex);
      }
    }
    for (const target of edge.targets ?? (edge.target === undefined ? [] : [edge.target])) {
      const id = String(target);
      targetPortDegree.set(id, (targetPortDegree.get(id) ?? 0) + 1);
      if (portOwnerById.has(id) && !edgeModelOrderByPortId.has(id)) {
        edgeModelOrderByPortId.set(id, edgeIndex);
      }
    }
  }
  const orderedPorts = (child: ElkNode) => {
    const ports = [...(child.ports ?? [])];
    if (String(getOption(child.layoutOptions ?? {}, "portConstraints")) !== "FIXED_SIDE") {
      return ports;
    }
    const side = (port: ElkPort) => String(getOption(port.layoutOptions ?? {}, "port.side"));
    const sideOrder = ["NORTH", "EAST", "SOUTH", "WEST"];
    ports.sort((left, right) => {
      const leftSide = side(left);
      const rightSide = side(right);
      const sideDifference = sideOrder.indexOf(leftSide) - sideOrder.indexOf(rightSide);
      if (sideDifference !== 0) return sideDifference;
      if (String(getOption(globalOptions, "layered.portSortingStrategy")) === "PORT_DEGREE") {
        if (leftSide === "EAST") {
          return (
            (sourcePortDegree.get(String(right.id)) ?? 0) -
            (sourcePortDegree.get(String(left.id)) ?? 0)
          );
        }
        if (leftSide === "WEST") {
          return (
            (targetPortDegree.get(String(left.id)) ?? 0) -
            (targetPortDegree.get(String(right.id)) ?? 0)
          );
        }
      }
      const modelOrderStrategy = String(
        getOption(globalOptions, "layered.considerModelOrder.strategy") ?? "NONE",
      );
      const usePortModelOrder =
        getBooleanOption(globalOptions, "layered.considerModelOrder.portModelOrder") === true;
      if (modelOrderStrategy !== "NONE" && !usePortModelOrder) {
        const edgeOrderDifference =
          (edgeModelOrderByPortId.get(String(left.id)) ?? Infinity) -
          (edgeModelOrderByPortId.get(String(right.id)) ?? Infinity);
        if (edgeOrderDifference !== 0) return edgeOrderDifference;
      }
      const direction = leftSide === "WEST" ? -1 : 1;
      return direction * ((child.ports?.indexOf(left) ?? 0) - (child.ports?.indexOf(right) ?? 0));
    });
    return ports;
  };

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
      ports: orderedPorts(child).map((port) => ({
        name: String(port.id),
        direction: sourcePortIds.has(String(port.id))
          ? targetPortIds.has(String(port.id))
            ? ("inout" as const)
            : ("out" as const)
          : targetPortIds.has(String(port.id))
            ? ("in" as const)
            : ("inout" as const),
        x: port.x,
        y: port.y,
        width: port.width,
        height: port.height,
      })),
    })),
    edges: (root.edges ?? []).flatMap((edge) => {
      if (getBooleanOption(edge.layoutOptions ?? {}, "noLayout") === true) return [];
      if (isInsideSelfLoop(root, edge)) return [];
      const source = endpoint(edge.sources?.[0] ?? edge.source, portOwnerById);
      const target = endpoint(edge.targets?.[0] ?? edge.target, portOwnerById);
      const labels = (edge.labels ?? []).filter((label) => Boolean(label.text));
      const labelLabelSpacing = getNumberOption(globalOptions, "spacing.labelLabel") ?? 0;
      const labelWidth = Math.max(0, ...labels.map((label) => label.width ?? 0));
      const labelHeight =
        labels.reduce((sum, label) => sum + (label.height ?? 0), 0) +
        Math.max(0, labels.length - 1) * labelLabelSpacing;
      return nodeIds.has(source.nodeId) && nodeIds.has(target.nodeId)
        ? [
            {
              id: String(edge.id),
              sourceId: source.nodeId,
              targetId: target.nodeId,
              sourcePort: source.port,
              targetPort: target.port,
              label: edge.labels?.[0]?.text,
              width: labelWidth,
              height: labelHeight,
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
    incomingShape: edge.sources?.[0] ?? edge.source,
    outgoingShape: edge.targets?.[0] ?? edge.target,
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
      if (getBooleanOption(port.layoutOptions ?? {}, "noLayout") === true) continue;
      const laidOutPort = node.ports?.find((candidate) => candidate.name === String(port.id));
      if (!laidOutPort) continue;
      port.x = laidOutPort.x;
      port.y = laidOutPort.y;
      port.width = laidOutPort.width;
      port.height = laidOutPort.height;
    }
    placePortLabels(child, layoutOptions);
  }
  for (const edge of root.edges ?? []) {
    const laidOutEdge = edgeById.get(String(edge.id));
    if (!laidOutEdge) {
      if (getBooleanOption(edge.layoutOptions ?? {}, "noLayout") === true) {
        for (const section of edge.sections ?? []) {
          section.incomingShape ??= edge.sources?.[0] ?? edge.source;
          section.outgoingShape ??= edge.targets?.[0] ?? edge.target;
        }
        continue;
      }
      const section = getParentEdgeSection(root, edge);
      if (section) edge.sections = [section];
      continue;
    }
    const section = toSection(edge, laidOutEdge.points ?? []);
    edge.sections = section ? [section] : [];
    const target = root.children?.find(
      (child) => String(child.id) === String(edge.targets?.[0] ?? edge.target),
    );
    if (
      getBooleanOption(target?.layoutOptions ?? {}, "hypernode") === true &&
      (section?.bendPoints?.length ?? 0) > 0
    ) {
      edge.junctionPoints = [section!.bendPoints!.at(-1)!];
    }
    let labelY = laidOutEdge.y ?? 0;
    const points = laidOutEdge.points ?? [];
    const firstPoint = points[0] ?? { x: laidOutEdge.x ?? 0, y: laidOutEdge.y ?? 0 };
    const lastPoint = points.at(-1) ?? firstPoint;
    const midpointX = (laidOutEdge.x ?? 0) + (laidOutEdge.width ?? 0) / 2;
    const edgeLabelSpacing = getNumberOption(layoutOptions, "spacing.edgeLabel") ?? 2;
    const labelLabelSpacing = getNumberOption(layoutOptions, "spacing.labelLabel") ?? 0;
    for (const label of edge.labels ?? []) {
      if (!label.text) continue;
      const placement = String(
        getOption(label.layoutOptions ?? {}, "edgeLabels.placement") ?? "CENTER",
      );
      const width = label.width ?? 0;
      label.x =
        placement === "TAIL"
          ? firstPoint.x + edgeLabelSpacing
          : placement === "HEAD"
            ? lastPoint.x - width - edgeLabelSpacing
            : midpointX - width / 2;
      label.y = labelY;
      labelY += (label.height ?? 0) + labelLabelSpacing;
    }
  }
  normalizeElkGraphBounds(root, padding, layoutOptions);
}

function normalizeElkGraphBounds(
  root: ElkNode,
  padding: { top: number; right: number; bottom: number; left: number },
  layoutOptions: Readonly<Record<string, unknown>> = {},
): void {
  const authoredWidth = root.width;
  const authoredHeight = root.height;
  const fixedGraphSize = getBooleanOption(layoutOptions, "nodeSize.fixedGraphSize") === true;
  const layoutChildren = (root.children ?? []).filter(
    (node) => getBooleanOption(node.layoutOptions ?? {}, "noLayout") !== true,
  );
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  for (const node of layoutChildren) {
    minimumX = Math.min(
      minimumX,
      node.x ?? 0,
      ...(node.labels ?? []).map((label) => (node.x ?? 0) + (label.x ?? 0)),
      ...(node.ports ?? []).map((port) => (node.x ?? 0) + (port.x ?? 0)),
      ...(node.ports ?? []).flatMap((port) =>
        (port.labels ?? []).map((label) => (node.x ?? 0) + (port.x ?? 0) + (label.x ?? 0)),
      ),
    );
    minimumY = Math.min(
      minimumY,
      node.y ?? 0,
      ...(node.labels ?? []).map((label) => (node.y ?? 0) + (label.y ?? 0)),
      ...(node.ports ?? []).map((port) => (node.y ?? 0) + (port.y ?? 0)),
      ...(node.ports ?? []).flatMap((port) =>
        (port.labels ?? []).map((label) => (node.y ?? 0) + (port.y ?? 0) + (label.y ?? 0)),
      ),
    );
  }
  for (const edge of root.edges ?? []) {
    minimumX = Math.min(minimumX, ...(edge.labels ?? []).map((label) => label.x ?? 0));
    minimumY = Math.min(minimumY, ...(edge.labels ?? []).map((label) => label.y ?? 0));
    if (getBooleanOption(edge.layoutOptions ?? {}, "noLayout") !== true) {
      const points = (edge.sections ?? []).flatMap((section) => [
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ]);
      minimumX = Math.min(minimumX, ...points.map((point) => point.x));
      minimumY = Math.min(minimumY, ...points.map((point) => point.y));
    }
  }
  const shiftX = Number.isFinite(minimumX) ? Math.max(0, padding.left - minimumX) : 0;
  const shiftY = Number.isFinite(minimumY) ? Math.max(0, padding.top - minimumY) : 0;
  if (shiftX !== 0 || shiftY !== 0) {
    for (const node of layoutChildren) {
      node.x = (node.x ?? 0) + shiftX;
      node.y = (node.y ?? 0) + shiftY;
    }
    for (const edge of root.edges ?? []) {
      for (const section of edge.sections ?? []) {
        for (const point of [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]) {
          point.x += shiftX;
          point.y += shiftY;
        }
      }
      for (const label of edge.labels ?? []) {
        label.x = (label.x ?? 0) + shiftX;
        label.y = (label.y ?? 0) + shiftY;
      }
    }
  }
  const calculatedWidth =
    Math.max(
      0,
      ...layoutChildren.flatMap((node) => [
        (node.x ?? 0) + (node.width ?? 0),
        ...(node.labels ?? []).map((label) => (node.x ?? 0) + (label.x ?? 0) + (label.width ?? 0)),
        ...(node.ports ?? []).map((port) => (node.x ?? 0) + (port.x ?? 0) + (port.width ?? 0)),
        ...(node.ports ?? []).flatMap((port) =>
          (port.labels ?? []).map(
            (label) => (node.x ?? 0) + (port.x ?? 0) + (label.x ?? 0) + (label.width ?? 0),
          ),
        ),
      ]),
      ...(root.edges ?? []).flatMap((edge) =>
        (edge.labels ?? []).map((label) => (label.x ?? 0) + (label.width ?? 0)),
      ),
      ...(root.edges ?? []).flatMap((edge) =>
        getBooleanOption(edge.layoutOptions ?? {}, "noLayout") === true
          ? []
          : (edge.sections ?? []).flatMap((section) => [
              section.startPoint.x,
              ...(section.bendPoints ?? []).map((point) => point.x),
              section.endPoint.x,
            ]),
      ),
    ) +
    padding.right +
    (getBooleanOption(layoutOptions, "layered.feedbackEdges") === true &&
    (getDirection(layoutOptions) === "down" || getDirection(layoutOptions) === "up")
      ? 1
      : 0);
  const calculatedHeight =
    Math.max(
      0,
      ...layoutChildren.flatMap((node) => [
        (node.y ?? 0) + (node.height ?? 0),
        ...(node.labels ?? []).map((label) => (node.y ?? 0) + (label.y ?? 0) + (label.height ?? 0)),
        ...(node.ports ?? []).map((port) => (node.y ?? 0) + (port.y ?? 0) + (port.height ?? 0)),
        ...(node.ports ?? []).flatMap((port) =>
          (port.labels ?? []).map(
            (label) => (node.y ?? 0) + (port.y ?? 0) + (label.y ?? 0) + (label.height ?? 0),
          ),
        ),
      ]),
      ...(root.edges ?? []).flatMap((edge) =>
        (edge.labels ?? []).map(
          (label) =>
            (label.y ?? 0) +
            (label.height ?? 0) +
            (String(getOption(label.layoutOptions ?? {}, "edgeLabels.placement") ?? "CENTER") ===
            "CENTER"
              ? 1
              : 0),
        ),
      ),
      ...(root.edges ?? []).flatMap((edge) =>
        getBooleanOption(edge.layoutOptions ?? {}, "noLayout") === true
          ? []
          : (edge.sections ?? []).flatMap((section) => [
              section.startPoint.y,
              ...(section.bendPoints ?? []).map((point) => point.y),
              section.endPoint.y,
            ]),
      ),
    ) +
    padding.bottom +
    (getBooleanOption(layoutOptions, "layered.feedbackEdges") === true &&
    (getDirection(layoutOptions) === "right" || getDirection(layoutOptions) === "left")
      ? 1
      : 0);
  root.width = fixedGraphSize && authoredWidth !== undefined ? authoredWidth : calculatedWidth;
  root.height = fixedGraphSize && authoredHeight !== undefined ? authoredHeight : calculatedHeight;
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
  const labelPadding = parsePadding(getOption(globalOptions, "nodeLabels.padding"), 5);
  for (const label of node.labels ?? []) {
    if (!label.text) continue;
    if (getBooleanOption(label.layoutOptions ?? {}, "noLayout") === true) continue;
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
      ? (nodeWidth - width + labelPadding.left - labelPadding.right) / 2
      : placement.includes("H_RIGHT")
        ? nodeWidth - width - labelPadding.right
        : labelPadding.left;
    if (placement.includes("OUTSIDE") && placement.includes("V_TOP")) {
      label.y = -height - Number(getOption(globalOptions, "spacing.labelNode") ?? 5);
    } else if (placement.includes("OUTSIDE") && placement.includes("V_BOTTOM")) {
      label.y = nodeHeight + Number(getOption(globalOptions, "spacing.labelNode") ?? 5);
    } else if (placement.includes("V_CENTER")) {
      label.y = (nodeHeight - height + labelPadding.top - labelPadding.bottom) / 2;
    } else if (placement.includes("V_BOTTOM")) {
      label.y = nodeHeight - height - labelPadding.bottom;
    } else {
      label.y = labelPadding.top;
    }
  }
}

function placePortLabels(node: ElkNode, globalOptions: Readonly<Record<string, unknown>>): void {
  const placement = String(
    getOption({ ...globalOptions, ...node.layoutOptions }, "portLabels.placement") ?? "OUTSIDE",
  );
  const inside = placement === "INSIDE";
  const horizontalSpacing = getNumberOption(globalOptions, "spacing.labelPortHorizontal") ?? 1;
  const verticalSpacing = getNumberOption(globalOptions, "spacing.labelPortVertical") ?? 1;
  const labelSpacing = getNumberOption(globalOptions, "spacing.labelLabel") ?? 0;
  const treatAsGroup =
    getBooleanOption(node.layoutOptions ?? {}, "portLabels.treatAsGroup") ?? false;
  const placeNextToPort =
    getOption(node.layoutOptions ?? {}, "portLabels.nextToPortIfPossible") !== undefined;
  const nodeWidth = node.width ?? 0;
  for (const port of node.ports ?? []) {
    if (getBooleanOption(port.layoutOptions ?? {}, "noLayout") === true) continue;
    const portWidth = port.width ?? 0;
    const portHeight = port.height ?? 0;
    const side =
      (port.x ?? 0) < 0
        ? "WEST"
        : (port.x ?? 0) >= nodeWidth
          ? "EAST"
          : (port.y ?? 0) < 0
            ? "NORTH"
            : "SOUTH";
    const labels = (port.labels ?? []).filter(
      (label) =>
        Boolean(label.text) && getBooleanOption(label.layoutOptions ?? {}, "noLayout") !== true,
    );
    const totalLabelHeight =
      labels.reduce((sum, label) => sum + (label.height ?? 0), 0) +
      Math.max(0, labels.length - 1) * labelSpacing;
    let stackedY =
      labels.length > 1
        ? inside || placeNextToPort
          ? treatAsGroup
            ? (portHeight - totalLabelHeight) / 2
            : (portHeight - (labels[0]?.height ?? 0)) / 2
          : portHeight + verticalSpacing
        : undefined;
    for (const label of labels) {
      if (!label.text) continue;
      const width = label.width ?? 0;
      const height = label.height ?? 0;
      if (side === "EAST") {
        label.x = inside ? -width - horizontalSpacing : portWidth + horizontalSpacing;
        label.y = stackedY ?? (inside ? (portHeight - height) / 2 : portHeight + verticalSpacing);
      } else if (side === "WEST") {
        label.x = inside ? portWidth + horizontalSpacing : -width - horizontalSpacing;
        label.y = stackedY ?? (inside ? (portHeight - height) / 2 : portHeight + verticalSpacing);
      } else if (side === "NORTH") {
        label.x = inside ? (portWidth - width) / 2 : portWidth + horizontalSpacing;
        label.y = inside ? portHeight + verticalSpacing : -height - verticalSpacing;
      } else {
        label.x = inside ? (portWidth - width) / 2 : portWidth + horizontalSpacing;
        label.y = inside ? -height - verticalSpacing : portHeight + verticalSpacing;
      }
      if (stackedY !== undefined) stackedY += height + labelSpacing;
    }
  }
}
