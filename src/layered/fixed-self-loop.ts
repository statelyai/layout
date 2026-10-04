/* Native fixed-port perimeter routing following ELK self-loop semantics. SPDX-License-Identifier: EPL-2.0 */
import type { EntityRect, GraphEdge, Point } from "@statelyai/graph";
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
  // A loop on a single port closes a small square beside the port instead of
  // retracing its own outward segment.
  if (from === to && a.x === b.x && a.y === b.y) {
    const alongY = from === "WEST" || from === "EAST";
    const step = (alongY ? a.y < height / 2 : a.x < width / 2) ? distance : -distance;
    const shift = (p: Point): Point =>
      alongY ? { x: p.x, y: p.y + step } : { x: p.x + step, y: p.y };
    return [a, first, shift(first), shift(b), b].map(physical);
  }
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

/**
 * ELK combines self loops that share a port into one self hyperloop routed on
 * a single track. Returns each loop's track index, in order of first loop.
 */
export function selfLoopTracks(loops: readonly GraphEdge[]): Map<string, number> {
  const parent = loops.map((_, index) => index);
  const root = (index: number): number =>
    parent[index] === index ? index : (parent[index] = root(parent[index]!));
  const ownerByPort = new Map<string, number>();
  for (const [index, loop] of loops.entries())
    for (const port of [loop.sourcePort, loop.targetPort]) {
      if (port === undefined) continue;
      const other = ownerByPort.get(port);
      if (other === undefined) ownerByPort.set(port, index);
      else parent[root(index)] = root(other);
    }
  const trackByRoot = new Map<number, number>();
  return new Map(
    loops.map((loop, index) => {
      const group = root(index);
      if (!trackByRoot.has(group)) trackByRoot.set(group, trackByRoot.size);
      return [loop.id, trackByRoot.get(group)!];
    }),
  );
}
