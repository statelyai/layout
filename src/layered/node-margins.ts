import { placePorts } from "./strategies";
import type { LayeredPhaseInput } from "./types";

interface CrossMargins {
  before: number;
  after: number;
}
const preparedMargins = new WeakMap<LayeredPhaseInput, ReadonlyMap<string, CrossMargins>>();

/** Physical port boxes contribute to node margins before BK alignment and compaction. */
export function preparePortMargins(input: LayeredPhaseInput): void {
  const horizontal = input.direction === "right" || input.direction === "left";
  const margins = new Map<string, CrossMargins>();
  for (const node of input.graph.nodes) {
    const size = input.sizes.get(node.id) ?? { width: 0, height: 0 };
    const ports = placePorts(
      node.ports,
      { x: 0, y: 0, ...size },
      input.direction,
      (port) => input.portSettings?.(port, node),
      { ...input.settings, ...input.nodeSettings?.(node) },
    );
    let before = 0,
      after = 0;
    for (const port of ports ?? []) {
      const start = horizontal ? (port.y ?? 0) : (port.x ?? 0);
      const end = start + (horizontal ? (port.height ?? 0) : (port.width ?? 0));
      before = Math.max(before, -start);
      after = Math.max(after, end - (horizontal ? size.height : size.width));
    }
    if (before || after) margins.set(node.id, { before, after });
  }
  preparedMargins.set(input, margins);
}

export const portCrossMargins = (input: LayeredPhaseInput, id: string): CrossMargins | undefined =>
  preparedMargins.get(input)?.get(id);
