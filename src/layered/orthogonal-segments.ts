/*******************************************************************************
 * Copyright (c) 2010, 2020 Kiel University and others.
 * Adapted from ELK v0.11.0 orthogonal segment splitting and routing generation.
 * Source commit: 54123e884b1ae743b453260f713b20c9bf5787f2
 * SPDX-License-Identifier: EPL-2.0
 *******************************************************************************/
import type { JavaRandom } from "../java-random";
import { detectOrthogonalCycles, type OrthogonalDependency } from "./orthogonal-cycle-order";
export interface OrthogonalSegmentInput {
  incoming: readonly number[];
  outgoing: readonly number[];
}
export interface OrthogonalSegment {
  incoming: number[];
  outgoing: number[];
  start: number;
  end: number;
  slot: number;
  partner?: number;
  splitBy?: number;
}
const extent = (s: OrthogonalSegmentInput) => {
  const values = [...s.incoming, ...s.outgoing];
  return {
    start: values.length ? Math.min(...values) : NaN,
    end: values.length ? Math.max(...values) : NaN,
  };
};
const crossings = (positions: readonly number[], start: number, end: number) =>
  positions.filter((p) => p >= start && p <= end).length;
const orderingCrossings = (a: OrthogonalSegment, b: OrthogonalSegment) =>
  crossings(a.outgoing, b.start, b.end) + crossings(b.incoming, a.start, a.end);
/** Full ELK segment dependency, critical split, cycle removal and rank phases. */
export function routeOrthogonalSegments(
  input: readonly OrthogonalSegmentInput[],
  conflictThreshold: number,
  criticalThreshold: number,
  random: JavaRandom,
) {
  const segments: OrthogonalSegment[] = input.map((s) => ({
    incoming: [...s.incoming],
    outgoing: [...s.outgoing],
    ...extent(s),
    slot: 0,
  }));
  let dependencies: OrthogonalDependency[] = [];
  const add = (source: number, target: number, critical: boolean, weight: number) =>
    dependencies.push({ source, target, critical, weight });
  const conflicts = (a: readonly number[], b: readonly number[]) => {
    if (!a.length || !b.length) return 0;
    let i = 0,
      j = 0,
      count = 0;
    while (true) {
      const x = a[i]!,
        y = b[j]!;
      if (x > y - criticalThreshold && x < y + criticalThreshold) return -1;
      if (x > y - conflictThreshold && x < y + conflictThreshold) count++;
      if (x <= y && i < a.length - 1) i++;
      else if (y <= x && j < b.length - 1) j++;
      else break;
    }
    return count;
  };
  const create = (a: number, b: number) => {
    const left = segments[a]!,
      right = segments[b]!;
    if (Math.abs(left.start - left.end) < 1e-3 || Math.abs(right.start - right.end) < 1e-3)
      return 0;
    const c1 = conflicts(left.outgoing, right.incoming),
      c2 = conflicts(right.outgoing, left.incoming);
    if (c1 === -1 || c2 === -1) {
      if (c1 === -1) add(b, a, true, 1);
      if (c2 === -1) add(a, b, true, 1);
      return Number(c1 === -1) + Number(c2 === -1);
    }
    const v1 = c1 + 16 * orderingCrossings(left, right),
      v2 = c2 + 16 * orderingCrossings(right, left);
    if (v1 < v2) add(a, b, false, v2 - v1);
    else if (v1 > v2) add(b, a, false, v1 - v2);
    else if (v1 > 0) {
      add(a, b, false, 0);
      add(b, a, false, 0);
    }
    return 0;
  };
  let criticalCount = 0;
  for (let a = 0; a < segments.length - 1; a++)
    for (let b = a + 1; b < segments.length; b++) criticalCount += create(a, b);
  if (criticalCount >= 2) {
    const cycle = detectOrthogonalCycles(segments.length, dependencies, true, random);
    const selected = new Set<number>();
    for (const dependency of cycle.backwards) {
      let { source, target } = dependency;
      if (selected.has(source) || selected.has(target)) continue;
      const a = segments[source]!,
        b = segments[target]!;
      if (a.incoming.length + a.outgoing.length > 2 && b.incoming.length + b.outgoing.length <= 2)
        [source, target] = [target, source];
      selected.add(source);
      segments[source]!.splitBy = target;
    }
    const coords = segments.flatMap((s) => [...s.incoming, ...s.outgoing]).sort((a, b) => a - b);
    const areas: Array<{ start: number; end: number }> = [];
    for (let i = 1; i < coords.length; i++)
      if (coords[i]! - coords[i - 1]! >= 2 * criticalThreshold)
        areas.push({
          start: coords[i - 1]! + criticalThreshold,
          end: coords[i]! - criticalThreshold,
        });
    const ordered = [...selected].sort(
      (a, b) => segments[a]!.end - segments[a]!.start - (segments[b]!.end - segments[b]!.start),
    );
    for (const index of ordered) {
      const segment = segments[index]!,
        causing = segment.splitBy!;
      let position = (segment.start + segment.end) / 2;
      const possible = areas.flatMap((area, i) =>
        area.start <= segment.end && area.end >= segment.start ? [i] : [],
      );
      if (possible.length) {
        const rating = (areaIndex: number) => {
          const area = areas[areaIndex]!,
            center = (area.start + area.end) / 2;
          // ELK rates using the provisional halves' extents before adding the bridge.
          const left = {
            ...segment,
            outgoing: [center],
            ...extent({ incoming: segment.incoming, outgoing: [] }),
          };
          const right = {
            ...segment,
            incoming: [center],
            ...extent({ incoming: [], outgoing: segment.outgoing }),
          };
          let depCount = 2,
            cross = 0;
          const neighbors = [
            ...dependencies.filter((d) => d.target === index).map((d) => d.source),
            ...dependencies.filter((d) => d.source === index).map((d) => d.target),
          ];
          for (const other of neighbors)
            for (const half of [left, right]) {
              const c1 = orderingCrossings(half, segments[other]!),
                c2 = orderingCrossings(segments[other]!, half);
              if (c1 === c2) {
                if (c1 > 0) {
                  depCount += 2;
                  cross += c1;
                }
              } else {
                depCount++;
                cross += Math.min(c1, c2);
              }
            }
          cross +=
            orderingCrossings(left, segments[causing]!) +
            orderingCrossings(segments[causing]!, right);
          return { cross, depCount, size: area.end - area.start };
        };
        let best = possible[0]!,
          score = rating(best);
        for (const candidate of possible.slice(1)) {
          const curr = rating(candidate);
          if (
            curr.cross < score.cross ||
            (curr.cross === score.cross &&
              (curr.depCount < score.depCount ||
                (curr.depCount === score.depCount && curr.size > score.size)))
          ) {
            best = candidate;
            score = curr;
          }
        }
        const area = areas[best]!;
        position = (area.start + area.end) / 2;
        areas.splice(best, 1);
        if ((area.end - area.start) / 2 >= criticalThreshold) {
          const replacement = [];
          if (area.start <= position - criticalThreshold)
            replacement.push({ start: area.start, end: position - criticalThreshold });
          if (position + criticalThreshold <= area.end)
            replacement.push({ start: position + criticalThreshold, end: area.end });
          areas.splice(best, 0, ...replacement);
        }
      }
      const partner = segments.length;
      const outgoing = segment.outgoing;
      segment.outgoing = [position];
      segment.partner = partner;
      Object.assign(segment, extent(segment));
      segments.push({
        incoming: [position],
        outgoing,
        ...extent({ incoming: [position], outgoing }),
        slot: 0,
        partner: index,
      });
      dependencies = dependencies.filter((d) => d.source !== index && d.target !== index);
      add(index, causing, true, 1);
      add(causing, partner, true, 1);
      for (let other = 0; other < segments.length; other++)
        if (other !== index && other !== partner && other !== causing) {
          create(other, index);
          create(other, partner);
        }
    }
  }
  const regular = detectOrthogonalCycles(segments.length, dependencies, false, random);
  // Reversal appends to both adjacency lists, just like ELK's setters.
  for (const backwards of regular.backwards) {
    dependencies.splice(dependencies.indexOf(backwards), 1);
    if (backwards.weight > 0)
      dependencies.push({ ...backwards, source: backwards.target, target: backwards.source });
  }
  const inCount = segments.map((_, i) => dependencies.filter((d) => d.target === i).length),
    outCount = segments.map((_, i) => dependencies.filter((d) => d.source === i).length);
  const sources = inCount.flatMap((n, i) => (n === 0 ? [i] : [])),
    targets = outCount.flatMap((n, i) =>
      n === 0 && segments[i]!.incoming.length === 0 ? [i] : [],
    );
  let maxRank = -1;
  while (sources.length) {
    const index = sources.shift()!;
    for (const d of dependencies.filter((d) => d.source === index)) {
      segments[d.target]!.slot = Math.max(segments[d.target]!.slot, segments[index]!.slot + 1);
      maxRank = Math.max(maxRank, segments[d.target]!.slot);
      if (--inCount[d.target]! === 0) sources.push(d.target);
    }
  }
  if (maxRank > -1) {
    for (const index of targets) segments[index]!.slot = maxRank;
    while (targets.length) {
      const index = targets.shift()!;
      for (const d of dependencies.filter((d) => d.target === index)) {
        if (segments[d.source]!.incoming.length) continue;
        segments[d.source]!.slot = Math.min(segments[d.source]!.slot, segments[index]!.slot - 1);
        if (--outCount[d.source]! === 0) targets.push(d.source);
      }
    }
  }
  return { segments, dependencies };
}
