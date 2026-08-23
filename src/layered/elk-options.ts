import type { LayoutDirection } from "../types";
import {
  elkLayeredOptionDefinitions,
  type ElkLayeredOptionId,
  type ElkLayeredOptionName,
  type ElkLayeredOptionValueByName,
} from "./elk-options.generated";
import { elkLayeredEnumValues } from "./elk-enum-values";
import type { LayeredLayoutOptions, LayoutPadding } from "./types";
export { elkLayeredEnumValues, type ElkLayeredEnumOptionName } from "./elk-enum-values";

export {
  elkLayeredOptionDefinitions,
  type ElkLayeredOptionId,
  type ElkLayeredOptionName,
  type ElkLayeredOptionValueByName,
};

export type CycleBreakingStrategy = (typeof elkLayeredEnumValues)["cycleBreaking.strategy"][number];
export type LayeringStrategy = (typeof elkLayeredEnumValues)["layering.strategy"][number];
export type CrossingMinimizationStrategy =
  (typeof elkLayeredEnumValues)["crossingMinimization.strategy"][number];
export type NodePlacementStrategy = (typeof elkLayeredEnumValues)["nodePlacement.strategy"][number];
export type EdgeRoutingStyle = (typeof elkLayeredEnumValues)["edgeRouting"][number];

type StrictElkLayeredOptionValueByName = Omit<
  ElkLayeredOptionValueByName,
  keyof typeof elkLayeredEnumValues
> & {
  [Name in keyof typeof elkLayeredEnumValues]?: (typeof elkLayeredEnumValues)[Name][number];
};

export type LayeredAdvancedOptions = Omit<
  StrictElkLayeredOptionValueByName,
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
