/*
 * Copyright (c) 2011, 2020 Kiel University and others.
 * Native adaptations of ELK getExternalPortPosition and CompoundGraphPostprocessor.
 * SPDX-License-Identifier: EPL-2.0
 */
import type { Point } from "@statelyai/graph";
import type { ExternalPortSide } from "./external-port-dummy";
import type { LayoutPadding, NodeSize } from "./types";

export interface ExternalPortTransfer {
  contentSize: NodeSize;
  padding: LayoutPadding;
  offset: Point;
  dummy: Point & NodeSize;
  side: ExternalPortSide;
  borderOffset: number;
  portSize: NodeSize;
}
/** Return both effects of ELK's transfer: parent port and corrected content-space dummy. */
export function transferExternalPort(input: ExternalPortTransfer): { port: Point; dummy: Point } {
  const { contentSize: size, padding: p, offset: o, borderOffset: b, portSize } = input;
  const dummy = { x: input.dummy.x, y: input.dummy.y };
  const port = { x: dummy.x + input.dummy.width / 2, y: dummy.y + input.dummy.height / 2 };
  switch (input.side) {
    case "NORTH":
      port.x += p.left + o.x - portSize.width / 2;
      port.y = -portSize.height - b;
      dummy.y = -(p.top + b + o.y);
      break;
    case "EAST":
      port.x = size.width + p.left + p.right + b;
      port.y += p.top + o.y - portSize.height / 2;
      dummy.x = size.width + p.right + b - o.x;
      break;
    case "SOUTH":
      port.x += p.left + o.x - portSize.width / 2;
      port.y = size.height + p.top + p.bottom + b;
      dummy.y = size.height + p.bottom + b - o.y;
      break;
    case "WEST":
      port.x = -portSize.width - b;
      port.y += p.top + o.y - portSize.height / 2;
      dummy.x = -(p.left + b + o.x);
      break;
  }
  return { port, dummy };
}

export interface CompoundRouteSegment {
  points: readonly Point[];
  offset: Point;
}
/** Segments are directed source-to-target and translated to one reference graph. */
export function joinCompoundRouteSegments(
  segments: readonly CompoundRouteSegment[],
  unnecessaryBendpoints = false,
): Point[] {
  const bends: Point[] = [];
  let start: Point | undefined, end: Point | undefined, last: Point | undefined;
  for (const segment of segments) {
    if (segment.points.length < 2) throw new Error("Compound route segment needs two anchors");
    const points = segment.points.map((p) => ({
      x: p.x + segment.offset.x,
      y: p.y + segment.offset.y,
    }));
    const source = points[0]!,
      target = points.at(-1)!;
    const inner = points.slice(1, -1);
    if (!start) start = source;
    if (last) {
      const next = inner[0] ?? target;
      const dx = Math.abs(last.x - next.x) > 1e-6;
      const dy = Math.abs(last.y - next.y) > 1e-6;
      if (unnecessaryBendpoints ? dx || dy : dx && dy) bends.push(source);
    }
    bends.push(...inner);
    last = inner.at(-1) ?? source;
    end = target;
  }
  return start && end ? [start, ...bends, end] : [];
}
