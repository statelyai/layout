/*******************************************************************************
 * Copyright (c) 2017 Kiel University and others.
 * Adapted from ELK v0.11.0 ScanlineConstraintCalculator.java.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { EntityRect } from "@statelyai/graph";

export interface ScanlineItem extends EntityRect {
  group: string;
}

/** Visibility constraints, rather than all pairs of overlapping intervals. */
export function scanlineConstraints<T extends ScanlineItem>(items: readonly T[]): [T, T][] {
  const events = items.flatMap((item) => [
    { item, low: true, y: item.y },
    { item, low: false, y: item.y + item.height },
  ]);
  events.sort((a, b) => a.y - b.y || Number(a.low) - Number(b.low));
  const active: T[] = [];
  const candidates = new Map<T, T | undefined>();
  const constraints: [T, T][] = [];
  const center = (item: T) => item.x + item.width / 2;
  for (const event of events) {
    const { item } = event;
    // Empty hitboxes cannot participate in an overlap interval.
    if (item.height <= 0) continue;
    if (event.low) {
      const index = active.findIndex((other) => center(other) >= center(item));
      const position = index < 0 ? active.length : index;
      if (active[position] && center(active[position]!) === center(item))
        throw new Error("Invalid hitboxes for scanline constraint calculation.", {
          cause: { first: active[position], second: item },
        });
      active.splice(position, 0, item);
      candidates.set(item, active[position - 1]);
      const right = active[position + 1];
      if (right) candidates.set(right, item);
    } else {
      const position = active.indexOf(item);
      const left = active[position - 1],
        right = active[position + 1];
      if (left && candidates.get(item) === left && left.group !== item.group)
        constraints.push([left, item]);
      if (right && candidates.get(right) === item && right.group !== item.group)
        constraints.push([item, right]);
      active.splice(position, 1);
    }
  }
  return constraints;
}
