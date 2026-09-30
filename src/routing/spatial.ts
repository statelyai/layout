import { PersistentMap } from "./persistent";
import type { RouteBounds } from "./types";
export const intersects = (a: RouteBounds, b: RouteBounds): boolean =>
  a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
export const inflate = (r: RouteBounds, amount: number): RouteBounds => ({
  x: r.x - amount,
  y: r.y - amount,
  width: r.width + amount * 2,
  height: r.height + amount * 2,
});
export function union(a: RouteBounds, b: RouteBounds): RouteBounds {
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
function cells(r: RouteBounds): string[] | undefined {
  const x1 = Math.floor(r.x / 128),
    x2 = Math.floor((r.x + r.width) / 128),
    y1 = Math.floor(r.y / 128),
    y2 = Math.floor((r.y + r.height) / 128);
  if ((x2 - x1 + 1) * (y2 - y1 + 1) > 4096) return undefined;
  const result: string[] = [];
  for (let x = 0; x <= x2 - x1; x++)
    for (let y = 0; y <= y2 - y1; y++) result.push(`${x1 + x}:${y1 + y}`);
  return result;
}
/** Persistent uniform-grid broad phase; oversized rectangles live in an overflow index. */
export class SpatialIndex {
  constructor(
    readonly bounds = new PersistentMap<RouteBounds>(),
    private readonly buckets = new PersistentMap<PersistentMap<true>>(),
    private readonly overflow = new PersistentMap<true>(),
  ) {
    Object.freeze(this);
  }
  set(id: string, rect?: RouteBounds): SpatialIndex {
    let { bounds, buckets, overflow } = this;
    const previous = bounds.get(id);
    if (previous) {
      const keys = cells(previous);
      if (!keys) overflow = overflow.delete(id);
      else
        for (const key of keys) {
          const bucket = buckets.get(key)!.delete(id);
          buckets = bucket.size ? buckets.set(key, bucket) : buckets.delete(key);
        }
      bounds = bounds.delete(id);
    }
    if (rect) {
      const keys = cells(rect);
      if (!keys) overflow = overflow.set(id, true);
      else
        for (const key of keys)
          buckets = buckets.set(key, (buckets.get(key) ?? new PersistentMap<true>()).set(id, true));
      bounds = bounds.set(id, rect);
    }
    return new SpatialIndex(bounds, buckets, overflow);
  }
  query(rect: RouteBounds): string[] {
    const keys = cells(rect),
      found = new Set<string>();
    if (!keys) {
      for (const [id, bounds] of this.bounds) if (intersects(rect, bounds)) found.add(id);
    } else {
      for (const key of keys)
        for (const id of this.buckets.get(key)?.keys() ?? [])
          if (intersects(rect, this.bounds.get(id)!)) found.add(id);
      for (const id of this.overflow.keys())
        if (intersects(rect, this.bounds.get(id)!)) found.add(id);
    }
    return [...found].sort();
  }
}
