/* Native fixed-port perimeter routing following ELK self-loop semantics. SPDX-License-Identifier: EPL-2.0 */
import type { EntityRect, Point } from "@statelyai/graph";
import type { LayoutDirection } from "../types";
type Side = "NORTH" | "EAST" | "SOUTH" | "WEST";

export function fixedSelfLoopSide(value: string | undefined): Side | undefined {
  return value === "NORTH" || value === "EAST" || value === "SOUTH" || value === "WEST"
    ? value
    : undefined;
}

/** Route fixed anchors around the perimeter; never replace a port with a default loop anchor. */
export function routeFixedSelfLoop(
  rect: EntityRect,
  start: Point,
  end: Point,
  sourceSide: Side,
  targetSide: Side,
  distance: number,
  direction: LayoutDirection,
): Point[] {
  const horizontal = direction === "right" || direction === "left";
  const width = horizontal ? rect.width : rect.height;
  const height = horizontal ? rect.height : rect.width;
  const reverse = direction === "left" || direction === "up";
  const canonical = (p: Point): Point => {
    const flow = horizontal ? p.x - rect.x : p.y - rect.y;
    return { x: reverse ? width - flow : flow, y: horizontal ? p.y - rect.y : p.x - rect.x };
  };
  const physical = (p: Point): Point => {
    const flow = reverse ? width - p.x : p.x;
    return { x: rect.x + (horizontal ? flow : p.y), y: rect.y + (horizontal ? p.y : flow) };
  };
  const side = (s: Side): Side => {
    const vectors = {
      NORTH: { x: 0, y: -1 },
      EAST: { x: 1, y: 0 },
      SOUTH: { x: 0, y: 1 },
      WEST: { x: -1, y: 0 },
    };
    const v = vectors[s];
    const flow = (horizontal ? v.x : v.y) * (reverse ? -1 : 1);
    const cross = horizontal ? v.y : v.x;
    return flow > 0 ? "EAST" : flow < 0 ? "WEST" : cross > 0 ? "SOUTH" : "NORTH";
  };
  const a = canonical(start),
    b = canonical(end);
  const from = side(sourceSide),
    to = side(targetSide);
  const outward = (p: Point, s: Side): Point => ({
    x:
      s === "WEST"
        ? Math.min(0, p.x) - distance
        : s === "EAST"
          ? Math.max(width, p.x) + distance
          : p.x,
    y:
      s === "NORTH"
        ? Math.min(0, p.y) - distance
        : s === "SOUTH"
          ? Math.max(height, p.y) + distance
          : p.y,
  });
  const first = outward(a, from),
    last = outward(b, to);
  const points = [a, first];
  if (from !== to) {
    const verticalFrom = from === "WEST" || from === "EAST";
    const verticalTo = to === "WEST" || to === "EAST";
    if (verticalFrom !== verticalTo) {
      points.push(verticalFrom ? { x: first.x, y: last.y } : { x: last.x, y: first.y });
    } else if (verticalFrom) {
      points.push({ x: first.x, y: height + distance }, { x: last.x, y: height + distance });
    } else {
      const track = from === "SOUTH" ? -distance : width + distance;
      points.push({ x: track, y: first.y }, { x: track, y: last.y });
    }
  }
  points.push(last, b);
  return points.map(physical);
}
