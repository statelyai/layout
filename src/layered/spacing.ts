import { externalPortDummyOf } from "./external-port-dummy";
import type { LayeredPhaseInput } from "./types";

export type IndividualSpacing = Readonly<Record<string, number>>;

/** ELK resolves local spacing as the maximum override on either graph element. */
export function nodeNodeSpacing(
  input: LayeredPhaseInput,
  firstId: string,
  secondId: string,
): number {
  const firstBreakingPoint = firstId.startsWith("__layout_breaking:");
  const secondBreakingPoint = secondId.startsWith("__layout_breaking:");
  const firstLabel = firstId.startsWith("__layout_dummy:label:");
  const secondLabel = secondId.startsWith("__layout_dummy:label:");
  const firstNode = input.graph.nodes.find((node) => node.id === firstId);
  const secondNode = input.graph.nodes.find((node) => node.id === secondId);
  const firstExternal = firstNode !== undefined && externalPortDummyOf(firstNode) !== undefined;
  const secondExternal = secondNode !== undefined && externalPortDummyOf(secondNode) !== undefined;
  const firstDummy = firstId.startsWith("__layout_dummy:") || firstBreakingPoint || firstExternal;
  const secondDummy =
    secondId.startsWith("__layout_dummy:") || secondBreakingPoint || secondExternal;
  const spacingName =
    firstExternal && secondExternal
      ? "spacing.portPort"
      : (firstExternal && secondLabel) || (secondExternal && firstLabel)
        ? "spacing.labelPortVertical"
        : firstLabel && secondLabel
          ? "spacing.edgeEdge"
          : (firstLabel && !secondDummy) || (secondLabel && !firstDummy)
            ? "spacing.node"
            : (firstLabel && secondDummy) || (secondLabel && firstDummy)
              ? "spacing.edgeNode"
              : firstDummy && secondDummy && firstBreakingPoint === secondBreakingPoint
                ? "spacing.edgeEdge"
                : firstDummy || secondDummy
                  ? "spacing.edgeNode"
                  : "spacing.node";
  let spacing =
    spacingName === "spacing.portPort"
      ? Number(input.settings["spacing.portPort"] ?? 10)
      : spacingName === "spacing.labelPortVertical"
        ? Number(input.settings["spacing.labelPortVertical"] ?? 1)
        : spacingName === "spacing.edgeEdge"
          ? Number(input.settings["spacing.edgeEdge"] ?? 10)
          : spacingName === "spacing.edgeNode"
            ? Number(input.settings["spacing.edgeNode"] ?? 10)
            : input.spacing.node;
  for (const id of [firstId, secondId]) {
    const node = input.graph.nodes.find((candidate) => candidate.id === id);
    if (!node) continue;
    const individual = input.nodeSettings?.(node)?.["spacing.individual"];
    if (individual && typeof individual === "object") {
      const value = (individual as IndividualSpacing)[spacingName];
      if (typeof value === "number" && Number.isFinite(value)) spacing = Math.max(spacing, value);
    }
  }
  return spacing;
}
