import type { LayeredPhaseInput } from "./types";

export type IndividualSpacing = Readonly<Record<string, number>>;

/** ELK resolves local spacing as the maximum override on either graph element. */
export function nodeNodeSpacing(
  input: LayeredPhaseInput,
  firstId: string,
  secondId: string,
): number {
  let spacing = input.spacing.node;
  for (const id of [firstId, secondId]) {
    const node = input.graph.nodes.find((candidate) => candidate.id === id);
    if (!node) continue;
    const individual = input.nodeSettings?.(node)?.["spacing.individual"];
    if (individual && typeof individual === "object") {
      const value = (individual as IndividualSpacing)["spacing.node"];
      if (typeof value === "number" && Number.isFinite(value)) spacing = Math.max(spacing, value);
    }
  }
  return spacing;
}
