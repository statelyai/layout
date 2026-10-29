import type { Graph } from "@statelyai/graph";
import { LayoutError, UnsupportedLayoutError } from "../errors";
import type { ForceLayoutOptions, StressLayoutOptions } from "../force";
import { executeElkjs0111Layout } from "../internal/layout-engine";
import type { LayoutPadding } from "../layered";
import type { RadialLayoutOptions, TreeLayoutOptions } from "../tree";
import type { ElkNode } from "./types";

type ProviderId = "mrtree" | "radial" | "force" | "stress";
type Options = Readonly<Record<string, unknown>>;

export function isAdditionalProvider(id: string): id is ProviderId {
  return id === "mrtree" || id === "radial" || id === "force" || id === "stress";
}
function option(options: Options, id: string): unknown {
  return options[id] ?? options[`elk.${id}`] ?? options[`org.eclipse.elk.${id}`];
}
function number(options: Options, id: string): number | undefined {
  const value = option(options, id);
  if (value === undefined) return undefined;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid numeric option ${id}`);
  return result;
}
function boolean(options: Options, id: string): boolean | undefined {
  const value = option(options, id);
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error(`Invalid boolean option ${id}`);
}
function elementOptions(node: { properties?: unknown; layoutOptions?: Options }): Options {
  return {
    ...(typeof node.properties === "object" && node.properties !== null ? node.properties : {}),
    ...node.layoutOptions,
  };
}
function rejectUnimplemented(id: ProviderId, values: Options, supported: readonly string[]): void {
  for (const key of Object.keys(values)) {
    const bare = key.replace(/^(?:org\.eclipse\.)?elk\./, "");
    if (bare.startsWith(`${id}.`) && !supported.includes(bare)) {
      throw new UnsupportedLayoutError(`${id} option '${key}' is not implemented`);
    }
  }
}
function direction(options: Options): TreeLayoutOptions["direction"] {
  const value = String(option(options, "direction") ?? "DOWN").toUpperCase();
  switch (value) {
    case "DOWN":
    case "UNDEFINED":
      return "down";
    case "UP":
      return "up";
    case "LEFT":
      return "left";
    case "RIGHT":
      return "right";
    default:
      throw new Error(`Invalid direction ${value}`);
  }
}
function treeOptions(options: Options, padding: LayoutPadding): TreeLayoutOptions {
  rejectUnimplemented("mrtree", options, []);
  return { padding, direction: direction(options), spacing: number(options, "spacing.nodeNode") };
}
function radialOptions(options: Options, padding: LayoutPadding): RadialLayoutOptions {
  rejectUnimplemented("radial", options, ["radial.radius"]);
  return {
    padding,
    radius: number(options, "radial.radius"),
    spacing: number(options, "spacing.nodeNode"),
  };
}
function forceOptions(options: Options, root: ElkNode, padding: LayoutPadding): ForceLayoutOptions {
  rejectUnimplemented("force", options, [
    "force.model",
    "force.iterations",
    "force.temperature",
    "force.repulsion",
  ]);
  const model = option(options, "force.model");
  if (model !== undefined && model !== "EADES" && model !== "FRUCHTERMAN_REINGOLD")
    throw new Error(`Unknown force model ${String(model)}`);
  return {
    padding,
    spacing: number(options, "spacing.nodeNode"),
    seed: number(options, "randomSeed"),
    iterations: number(options, "force.iterations"),
    temperature: number(options, "force.temperature"),
    repulsion: number(options, "force.repulsion"),
    model,
    priority: (node) =>
      number(
        elementOptions(root.children?.find((child) => String(child.id) === node.id) ?? {}),
        "priority",
      ),
  };
}
function stressOptions(
  options: Options,
  root: ElkNode,
  padding: LayoutPadding,
): StressLayoutOptions {
  rejectUnimplemented("stress", options, [
    "stress.iterationLimit",
    "stress.epsilon",
    "stress.desiredEdgeLength",
    "stress.dimension",
  ]);
  const dimension = option(options, "stress.dimension");
  if (dimension !== undefined && dimension !== "XY" && dimension !== "X" && dimension !== "Y")
    throw new Error(`Unknown stress dimension ${String(dimension)}`);
  return {
    padding,
    spacing: number(options, "spacing.nodeNode"),
    seed: number(options, "randomSeed"),
    iterationLimit: number(options, "stress.iterationLimit"),
    epsilon: number(options, "stress.epsilon"),
    desiredEdgeLength: number(options, "stress.desiredEdgeLength"),
    dimension,
    edgeLength: (edge) =>
      number(
        elementOptions(root.edges?.find((candidate) => String(candidate.id) === edge.id) ?? {}),
        "stress.desiredEdgeLength",
      ),
    fixed: (node) =>
      boolean(
        elementOptions(root.children?.find((child) => String(child.id) === node.id) ?? {}),
        "stress.fixed",
      ) ?? false,
  };
}

export function executeAdditionalProvider(
  id: ProviderId,
  graph: Graph,
  root: ElkNode,
  options: Options,
  padding: LayoutPadding,
) {
  const defaultPadding = id === "mrtree" ? 20 : id === "radial" ? 12 : 50;
  const providerPadding =
    option(options, "padding") === undefined
      ? { top: defaultPadding, right: defaultPadding, bottom: defaultPadding, left: defaultPadding }
      : padding;
  for (const child of root.children ?? [])
    rejectUnimplemented(id, elementOptions(child), id === "stress" ? ["stress.fixed"] : []);
  for (const edge of root.edges ?? [])
    rejectUnimplemented(
      id,
      elementOptions(edge),
      id === "stress" ? ["stress.desiredEdgeLength"] : [],
    );
  switch (id) {
    case "mrtree":
      return executeElkjs0111Layout({
        algorithm: id,
        graph,
        options: treeOptions(options, providerPadding),
      });
    case "radial":
      try {
        return executeElkjs0111Layout({
          algorithm: id,
          graph,
          options: radialOptions(options, providerPadding),
        });
      } catch (error) {
        if (error instanceof LayoutError && error.code === "GRAPH_NOT_TREE") {
          throw new Error("java.lang.IllegalArgumentException: The given graph is not a tree!");
        }
        throw error;
      }
    case "force":
      return executeElkjs0111Layout({
        algorithm: id,
        graph,
        options: forceOptions(options, root, providerPadding),
      });
    case "stress":
      return executeElkjs0111Layout({
        algorithm: id,
        graph,
        options: stressOptions(options, root, providerPadding),
      });
  }
}
