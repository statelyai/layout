import { expect, it } from "vitest";
import { scanlineConstraints } from "../src/layered/compaction-scanline";
const box = (group: string, x: number, y = 0, height = 10, width = 0) => ({
  group,
  x,
  y,
  height,
  width,
});
const pairs = (items: ReturnType<typeof box>[]) =>
  scanlineConstraints(items).map(([a, b]) => `${a.group}:${b.group}`);
it("constrains visible neighbors without redundant outer pairs", () => {
  expect(pairs([box("a", 0), box("b", 10), box("c", 20)])).toEqual(["a:b", "b:c"]);
});
it("retains transitive separation after an intervening interval ends", () => {
  expect(pairs([box("a", 0), box("b", 10, 0, 5), box("c", 20)])).toEqual(["a:b", "b:c"]);
});
it("deletes before inserting at touching borders", () => {
  expect(pairs([box("a", 0, 0, 5), box("b", 10, 5, 5)])).toEqual([]);
});
it("orders by centers rather than left borders", () => {
  expect(pairs([box("a", 0, 0, 10, 40), box("b", 10)])).toEqual(["b:a"]);
});
it("suppresses internal rigid-group constraints", () => {
  expect(pairs([box("a", 0), box("a", 10), box("c", 20)])).toEqual(["a:c"]);
});
it("rejects overlapping equal-center hitboxes", () => {
  expect(() => pairs([box("a", 0), box("b", 0)])).toThrow("Invalid hitboxes");
});
it("ignores empty hitboxes and preserves caller geometry", () => {
  const items = [box("a", 0), box("empty", 10, 5, 0), box("b", 20)];
  const saved = structuredClone(items);
  expect(pairs(items)).toEqual(["a:b"]);
  expect(items).toEqual(saved);
});
