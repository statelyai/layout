import type { EntityRect, Point } from "@statelyai/graph";
import type { ExteriorLabelEdge } from "./separate-exterior-labels";

interface PlaceEndLabelsInput<E extends ExteriorLabelEdge> {
  edges: E[];
  nodeRects: readonly EntityRect[];
  spacing: number;
  placement: (edge: E) => string;
  inline: (edge: E) => boolean;
}

const overlaps = (left: EntityRect, right: EntityRect): boolean =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

/** Whether segment a-b passes through the box's interior (Liang-Barsky clipping). */
const segmentCrosses = (a: Point, b: Point, box: EntityRect): boolean => {
  let low = 0,
    high = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - box.x],
    [dx, box.x + box.width - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.height - a.y],
  ] as const) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
  }
  return low < high;
};

const crosses = (points: readonly Point[], box: EntityRect): boolean =>
  points.some((a, index) => {
    const b = points[index + 1];
    return b !== undefined && segmentCrosses(a, b, box);
  });

/**
 * Moves a HEAD or TAIL label that covers a node, another label or a route
 * beside its route instead: along the segment leaving its endpoint first,
 * then along later segments, at the first spot clear of all three, or else
 * the spot with the fewest collisions, nodes and labels weighing most.
 */
export function placeEndLabels<E extends ExteriorLabelEdge>({
  edges,
  nodeRects,
  spacing,
  placement,
  inline,
}: PlaceEndLabelsInput<E>): void {
  const labelled = edges.filter((edge) => edge.width > 0 && edge.height > 0);
  // Covering a node or another label hides content; a route through a label hides less.
  const conflicts = (edge: E, box: EntityRect) =>
    2 * nodeRects.filter((rect) => overlaps(box, rect)).length +
    2 * labelled.filter((other) => other !== edge && overlaps(box, other)).length +
    edges.filter((other) => crosses(other.points, box)).length;
  for (const edge of labelled) {
    const end = placement(edge);
    // A CENTER label moves only off a node, another label or another route,
    // to the clear spot nearest its own.
    const center = end === "CENTER" && !inline(edge);
    if (end !== "HEAD" && end !== "TAIL" && !center) continue;
    const { width, height } = edge;
    let best = { x: edge.x, y: edge.y, conflicts: conflicts(edge, edge), distance: 0 };
    if (best.conflicts === 0) continue;
    if (center && best.conflicts === Number(crosses(edge.points, edge))) continue;
    const route = end === "HEAD" ? edge.points.toReversed() : edge.points;
    // Beside each segment from the endpoint on, hugging the route before stepping away from it.
    search: for (let lateral = spacing; lateral <= spacing + 64; lateral += 8)
      for (let index = 1; index < route.length; index++) {
        const a = route[index - 1]!,
          b = route[index]!;
        const dx = b.x - a.x,
          dy = b.y - a.y;
        if (dx === 0 && dy === 0) continue;
        const along = Math.abs(dx) >= Math.abs(dy);
        const length = along ? Math.abs(dx) : Math.abs(dy);
        const size = along ? width : height;
        const step = Math.max(4, (length - size) / 16);
        // Slide from the segment's first point toward its last, below or right first, as ELK does.
        for (
          let offset = spacing;
          offset <= Math.max(spacing, length - size - spacing);
          offset += step
        ) {
          const boxes = along
            ? [a.y + lateral, a.y - lateral - height].map((y) => ({
                x: dx > 0 ? a.x + offset : a.x - offset - width,
                y,
                width,
                height,
              }))
            : [a.x + lateral, a.x - lateral - width].map((x) => ({
                x,
                y: dy > 0 ? a.y + offset : a.y - offset - height,
                width,
                height,
              }));
          for (const box of boxes) {
            const count = conflicts(edge, box);
            const distance = Math.abs(box.x - edge.x) + Math.abs(box.y - edge.y);
            if (
              count < best.conflicts ||
              (center && count === best.conflicts && distance < best.distance)
            )
              best = { x: box.x, y: box.y, conflicts: count, distance };
            if (count === 0 && !center) break search;
          }
        }
      }
    // Without a clear spot, the spot with the fewest collisions.
    edge.x = best.x;
    edge.y = best.y;
  }
}
