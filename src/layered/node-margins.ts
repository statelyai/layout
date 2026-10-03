import { placePorts } from "./strategies";
import type { LayeredPhaseInput } from "./types";

interface CrossMargins {
  before: number;
  after: number;
  flowBefore: number;
  flowAfter: number;
}
const preparedMargins = new WeakMap<LayeredPhaseInput, ReadonlyMap<string, CrossMargins>>();

/** Physical port boxes contribute to node margins before BK alignment and compaction. */
export function preparePortMargins(input: LayeredPhaseInput, sizes = input.sizes): void {
  const horizontal = input.direction === "right" || input.direction === "left";
  const margins = new Map<string, CrossMargins>();
  for (const node of input.graph.nodes) {
    const size = sizes.get(node.id) ?? { width: 0, height: 0 };
    const ports = placePorts(
      node.ports,
      { x: 0, y: 0, width: size.width, height: size.height },
      input.direction,
      (port) => input.portSettings?.(port, node),
      { ...input.settings, ...input.nodeSettings?.(node) },
    );
    let before = 0,
      after = 0,
      flowBefore = 0,
      flowAfter = 0;
    for (const port of ports ?? []) {
      const start = horizontal ? (port.y ?? 0) : (port.x ?? 0);
      const end = start + (horizontal ? (port.height ?? 0) : (port.width ?? 0));
      before = Math.max(before, -start);
      after = Math.max(after, end - (horizontal ? size.height : size.width));
      const flowStart = horizontal ? (port.x ?? 0) : (port.y ?? 0);
      const flowEnd = flowStart + (horizontal ? (port.width ?? 0) : (port.height ?? 0));
      flowBefore = Math.max(flowBefore, -flowStart);
      flowAfter = Math.max(flowAfter, flowEnd - (horizontal ? size.width : size.height));
    }
    if (before || after || flowBefore || flowAfter) {
      const reverse = input.direction === "left" || input.direction === "up";
      margins.set(node.id, {
        before,
        after,
        flowBefore: reverse ? flowAfter : flowBefore,
        flowAfter: reverse ? flowBefore : flowAfter,
      });
    }
  }
  preparedMargins.set(input, margins);
}

export const portCrossMargins = (input: LayeredPhaseInput, id: string): CrossMargins | undefined =>
  preparedMargins.get(input)?.get(id);
