import type { NodePlacement } from "./types";

export interface CompactionBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
const boundsByPlacement = new WeakMap<NodePlacement, CompactionBounds>();
export function recordCompactionBounds(placement: NodePlacement, bounds: CompactionBounds): void {
  boundsByPlacement.set(placement, bounds);
}
export function compactionBounds(placement: NodePlacement): CompactionBounds | undefined {
  return boundsByPlacement.get(placement);
}
