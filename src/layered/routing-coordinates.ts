import type { NodePlacement } from "./types";

// ELK routes in the node placer's coordinate space, before graph-padding normalization.
const coordinateSpaces = new WeakMap<
  NodePlacement,
  { raw: NodePlacement; normalized: NodePlacement }
>();

export function recordRoutingCoordinates(placement: NodePlacement, raw: NodePlacement): void {
  coordinateSpaces.set(placement, {
    raw,
    normalized: { rectByNodeId: new Map(placement.rectByNodeId) },
  });
}

export function routingCoordinates(placement: NodePlacement): NodePlacement {
  const spaces = coordinateSpaces.get(placement);
  if (!spaces) return placement;
  return {
    rectByNodeId: new Map(
      [...placement.rectByNodeId].map(([id, rect]) => {
        const original = spaces.normalized.rectByNodeId.get(id),
          raw = spaces.raw.rectByNodeId.get(id);
        if (!original || !raw) return [id, rect];
        return [
          id,
          { ...rect, x: raw.x + (rect.x - original.x), y: raw.y + (rect.y - original.y) },
        ];
      }),
    ),
  };
}
