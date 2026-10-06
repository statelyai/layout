import type { EntityRect, Point } from "@statelyai/graph";

export interface FeedbackChain {
  edgeId: string;
  /** Center-label dummy on the chain and the cross coordinate where the route meets it. */
  label?: { id: string; cross: number };
}

/**
 * A reversed feedback edge split by label or inverted-port dummies is routed
 * one segment at a time, so each segment detours to the outer feedback track
 * and back to the next dummy. Rejoin the chain as one track: the label's own
 * track, or the outer track with the label moved onto it, whichever is clear.
 */
export function straightenFeedbackChains(
  chains: readonly FeedbackChain[],
  pointsByEdgeId: Map<string, readonly Point[]>,
  rectByNodeId: Map<string, EntityRect>,
  horizontal: boolean,
): void {
  const cross = (p: Point) => (horizontal ? p.y : p.x);
  const flow = (p: Point) => (horizontal ? p.x : p.y);
  const at = (f: number, c: number): Point => (horizontal ? { x: f, y: c } : { x: c, y: f });
  const overlaps = (a: EntityRect, b: EntityRect) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  // Degenerate boxes still hit a rect whose interior they pass through.
  const hits = (a: Point, b: Point, rect: EntityRect) =>
    rect.width > 0 &&
    rect.height > 0 &&
    Math.min(a.x, b.x) < rect.x + rect.width &&
    Math.max(a.x, b.x) > rect.x &&
    Math.min(a.y, b.y) < rect.y + rect.height &&
    Math.max(a.y, b.y) > rect.y;
  for (const { edgeId, label } of chains) {
    const points = pointsByEdgeId.get(edgeId);
    if (!points || points.length < 6) continue;
    const [start, lead] = points as [Point, Point];
    const tail = points.at(-2)!,
      end = points.at(-1)!;
    const outer = Math.max(...points.map(cross));
    const labelRect = label && rectByNodeId.get(label.id);
    for (const track of label ? [label.cross, outer] : [outer]) {
      const route = [start, lead, at(flow(lead), track), at(flow(tail), track), tail, end];
      const moved = labelRect && {
        ...labelRect,
        ...(horizontal
          ? { y: labelRect.y + track - label!.cross }
          : { x: labelRect.x + track - label!.cross }),
      };
      const blocked = [...rectByNodeId].some(
        ([id, rect]) =>
          id !== label?.id &&
          (route.slice(1, 4).some((point, index) => hits(point, route[index + 2]!, rect)) ||
            (moved !== undefined && overlaps(moved, rect))),
      );
      const crossed =
        moved !== undefined &&
        track !== label!.cross &&
        [...pointsByEdgeId].some(
          ([id, other]) =>
            id !== edgeId &&
            other.some((point, index) => index > 0 && hits(other[index - 1]!, point, moved)),
        );
      if (blocked || crossed) continue;
      const simple: Point[] = [];
      for (const point of route) {
        const previous = simple.at(-1),
          before = simple.at(-2);
        if (previous && previous.x === point.x && previous.y === point.y) continue;
        if (
          previous &&
          before &&
          ((before.x === previous.x && previous.x === point.x) ||
            (before.y === previous.y && previous.y === point.y))
        ) {
          // A collinear turnaround folds the route back onto itself.
          if ((previous.x - before.x) * (point.x - previous.x) < 0) break;
          if ((previous.y - before.y) * (point.y - previous.y) < 0) break;
          simple.pop();
        }
        simple.push(point);
      }
      if (simple.at(-1) !== end) continue;
      if (simple.length >= points.length) break;
      pointsByEdgeId.set(edgeId, simple);
      if (moved) rectByNodeId.set(label!.id, moved);
      break;
    }
  }
}
