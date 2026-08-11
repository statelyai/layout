import type { LayoutDirection } from "../types";
import {
  elkLayeredOptionDefinitions,
  type ElkLayeredOptionId,
  type ElkLayeredOptionName,
  type ElkLayeredOptionValueByName,
} from "./elk-options.generated";
import type { LayeredLayoutOptions, LayoutPadding } from "./types";
export { elkLayeredEnumValues, type ElkLayeredEnumOptionName } from "./elk-enum-values";

export {
  elkLayeredOptionDefinitions,
  type ElkLayeredOptionId,
  type ElkLayeredOptionName,
  type ElkLayeredOptionValueByName,
};

export type CycleBreakingStrategy =
  | "GREEDY"
  | "DEPTH_FIRST"
  | "INTERACTIVE"
  | "MODEL_ORDER"
  | "GREEDY_MODEL_ORDER"
  | "SCC_CONNECTIVITY"
  | "SCC_NODE_TYPE"
  | "DFS_NODE_ORDER"
  | "BFS_NODE_ORDER";

export type LayeringStrategy =
  | "NETWORK_SIMPLEX"
  | "LONGEST_PATH"
  | "LONGEST_PATH_SOURCE"
  | "COFFMAN_GRAHAM"
  | "INTERACTIVE"
  | "STRETCH_WIDTH"
  | "MIN_WIDTH"
  | "BF_MODEL_ORDER"
  | "DF_MODEL_ORDER";

export type CrossingMinimizationStrategy =
  | "LAYER_SWEEP"
  | "MEDIAN_LAYER_SWEEP"
  | "INTERACTIVE"
  | "NONE";

export type NodePlacementStrategy =
  | "SIMPLE"
  | "INTERACTIVE"
  | "LINEAR_SEGMENTS"
  | "BRANDES_KOEPF"
  | "NETWORK_SIMPLEX";

export type EdgeRoutingStyle = "UNDEFINED" | "POLYLINE" | "ORTHOGONAL" | "SPLINES";

export type LayeredAdvancedOptions = Omit<
  ElkLayeredOptionValueByName,
  | "direction"
  | "padding"
  | "spacing.node"
  | "spacing.layer"
  | "cycleBreaking.strategy"
  | "layering.strategy"
  | "crossingMinimization.strategy"
  | "nodePlacement.strategy"
  | "edgeRouting"
> & {
  "cycleBreaking.strategy"?: CycleBreakingStrategy;
  "layering.strategy"?: LayeringStrategy;
  "crossingMinimization.strategy"?: CrossingMinimizationStrategy;
  "nodePlacement.strategy"?: NodePlacementStrategy;
  edgeRouting?: EdgeRoutingStyle;
};

const definitionByName = new Map(
  elkLayeredOptionDefinitions.map((definition) => [definition.name, definition]),
);

function formatPadding(padding: number | Partial<LayoutPadding>): string {
  if (typeof padding === "number") {
    return `[top=${padding},right=${padding},bottom=${padding},left=${padding}]`;
  }
  return `[top=${padding.top ?? 0},right=${padding.right ?? 0},bottom=${padding.bottom ?? 0},left=${padding.left ?? 0}]`;
}

function formatDirection(direction: LayoutDirection): Uppercase<LayoutDirection> {
  return direction.toUpperCase() as Uppercase<LayoutDirection>;
}

/** Translate every simplified layered setting to its exact ELK 0.11.1 option ID. */
export function toElkLayeredOptions(
  options: LayeredLayoutOptions,
): Partial<Record<ElkLayeredOptionId, unknown>> {
  const result: Partial<Record<ElkLayeredOptionId, unknown>> = {};
  if (options.direction !== undefined) {
    result["org.eclipse.elk.direction"] = formatDirection(options.direction);
  }
  if (options.padding !== undefined) {
    result["org.eclipse.elk.padding"] = formatPadding(options.padding);
  }
  if (options.spacing?.node !== undefined) {
    result["org.eclipse.elk.spacing.nodeNode"] = options.spacing.node;
  }
  if (options.spacing?.layer !== undefined) {
    result["org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers"] = options.spacing.layer;
  }
  for (const [name, value] of Object.entries(options.settings ?? {})) {
    if (value === undefined) continue;
    const definition = definitionByName.get(name as ElkLayeredOptionName);
    if (!definition) throw new Error(`Unknown layered setting: ${name}`);
    result[definition.elkId] = value;
  }
  return result;
}

/** Return the simplified public name for an exact ELK layered option ID. */
export function fromElkLayeredOptionId(id: ElkLayeredOptionId): ElkLayeredOptionName {
  const definition = elkLayeredOptionDefinitions.find((candidate) => candidate.elkId === id);
  if (!definition) throw new Error(`Unknown ELK layered option: ${id}`);
  return definition.name;
}
