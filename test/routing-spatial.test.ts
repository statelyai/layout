import { expect, it } from "vitest";
import { PersistentMap } from "../src/routing/persistent";
import { intersects, SpatialIndex } from "../src/routing/spatial";

it("preserves ordered iteration across immutable map insertions and removals", () => {
  let map = new PersistentMap<number>();
  for (let i = 500; i >= 0; i--) map = map.set(String(i), i);
  const previous = map;
  for (let i = 0; i <= 500; i += 3) map = map.delete(String(i));
  expect([...map.keys()]).toEqual(
    Array.from({ length: 501 }, (_, i) => i)
      .filter((i) => i % 3)
      .map(String)
      .sort(),
  );
  expect([...map.values()]).toEqual([...map].map(([, value]) => value));
  expect(previous.size).toBe(501);
  expect([...previous]).toHaveLength(501);
  expect([...new PersistentMap()]).toEqual([]);
});

it("returns exact spatial candidates for narrow, wide, and overflow rectangles", () => {
  const rectangles = Array.from({ length: 60 }, (_, i) => ({
    id: `route${i}`,
    x: i * 3,
    y: i * 10,
    width: 5000,
    height: 3,
  }));
  rectangles.push({ id: "oversized", x: -10000, y: -10000, width: 20000, height: 20000 });
  let index = new SpatialIndex();
  for (const { id, ...bounds } of rectangles) index = index.set(id, bounds);
  for (const query of [
    { x: 40, y: 80, width: 3, height: 4 },
    { x: 0, y: 0, width: 5000, height: 600 },
    { x: -15000, y: -15000, width: 30000, height: 30000 },
  ]) {
    expect(index.query(query)).toEqual(
      rectangles
        .filter((bounds) => intersects(bounds, query))
        .map(({ id }) => id)
        .sort(),
    );
  }
});
