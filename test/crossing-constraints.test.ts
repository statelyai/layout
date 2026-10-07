import { expect, it } from "vitest";
import {
  associatedBarycenters,
  canSwapCrossingUnits,
  resolveCrossingConstraints,
  type CrossingUnits,
} from "../src/layered/crossing-constraints";
import { JavaRandom } from "../src/java-random";
const state = (successors: [string, string[]][] = []): CrossingUnits => ({
  successors: new Map(successors),
  units: new Map(),
  associates: new Map(),
  normalNodes: new Set(),
});
it("merges violated groups and reinserts by their actual ELK mean", () => {
  const scores = new Map([
    ["a", 10],
    ["b", 0],
    ["c", 4],
  ]);
  expect(resolveCrossingConstraints(["b", "c", "a"], scores, state([["a", ["b"]]]))).toEqual([
    "c",
    "a",
    "b",
  ]);
  expect(scores.get("a")).toBe(5);
  expect(scores.get("b")).toBe(5);
});
it("resolves equal-score predecessor constraints by original sorted position", () => {
  const scores = new Map([
    ["a", 1],
    ["b", 1],
  ]);
  expect(resolveCrossingConstraints(["b", "a"], scores, state([["a", ["b"]]]))).toEqual(["a", "b"]);
});
it("preserves noninterleaved neighboring owner units", () => {
  const s = state([
    ["n1", ["a"]],
    ["b", ["s2"]],
  ]);
  s.units = new Map([
    ["n1", "a"],
    ["a", "a"],
    ["b", "b"],
    ["s2", "b"],
  ]);
  s.normalNodes = new Set(["a", "b"]);
  const scores = new Map([
    ["s2", 0],
    ["a", 1],
    ["b", 2],
    ["n1", 3],
  ]);
  expect(resolveCrossingConstraints(["s2", "a", "b", "n1"], scores, s)).toEqual([
    "n1",
    "a",
    "b",
    "s2",
  ]);
});
it("retains unrelated ordering with no constraints", () => {
  expect(
    resolveCrossingConstraints(
      ["b", "a"],
      new Map([
        ["b", 0],
        ["a", 1],
      ]),
      state(),
    ),
  ).toEqual(["b", "a"]);
});
it("combines owner edges with recursively computed dummy associates", () => {
  const scores = associatedBarycenters(
    ["owner", "dummy"],
    new Map([
      ["owner", [2]],
      ["dummy", [8, 10]],
    ]),
    new Map(),
    new Map([["owner", ["dummy"]]]),
  );
  expect(scores.get("dummy")).toBe(9);
  expect(scores.get("owner")).toBe(20 / 3);
});
it("guards recursive same-layer cycles and ignores self loops", () => {
  const scores = associatedBarycenters(
    ["a", "b"],
    new Map([
      ["a", [2]],
      ["b", [8]],
    ]),
    new Map([
      ["a", ["a", "b"]],
      ["b", ["a"]],
    ]),
    new Map(),
  );
  expect(scores.get("b")).toBe(5);
  expect(scores.get("a")).toBe(4);
});
it("perturbs associates before their owner using the same seeded random stream", () => {
  const random = new JavaRandom(19),
    expected = random.clone();
  const dummy = 8 + (expected.nextFloat() * Math.fround(0.07) - Math.fround(0.07) / 2);
  const owner =
    (2 + dummy + (expected.nextFloat() * Math.fround(0.07) - Math.fround(0.07) / 2)) / 2;
  const scores = associatedBarycenters(
    ["owner", "dummy"],
    new Map([
      ["owner", [2]],
      ["dummy", [8]],
    ]),
    new Map(),
    new Map([["owner", ["dummy"]]]),
    random,
  );
  expect(scores.get("dummy")).toBe(dummy);
  expect(scores.get("owner")).toBe(owner);
  expect(random.nextFloat()).toBe(expected.nextFloat());
});

it("resolves authored normal constraints before freezing layout-unit order", () => {
  const s = state([
    ["a", ["b"]],
    ["n", ["a"]],
    ["b", ["south"]],
  ]);
  s.normalNodes = new Set(["a", "b"]);
  s.units = new Map([
    ["a", "a"],
    ["n", "a"],
    ["b", "b"],
    ["south", "b"],
  ]);
  s.constraintsBetweenNormalNodes = true;
  expect(
    resolveCrossingConstraints(
      ["b", "south", "n", "a"],
      new Map([
        ["b", 0],
        ["south", 1],
        ["n", 2],
        ["a", 3],
      ]),
      s,
    ),
  ).toEqual(["n", "a", "b", "south"]);
});

it("blocks greedy switches through owner units while allowing long-edge tracks", () => {
  const s = state([["north", ["a"]]]);
  s.normalNodes = new Set(["a", "b"]);
  s.units = new Map([
    ["a", "a"],
    ["north", "a"],
    ["b", "b"],
  ]);
  s.longEdgeNodes = new Set(["long"]);
  expect(canSwapCrossingUnits("north", "a", s)).toBe(false);
  expect(canSwapCrossingUnits("north", "b", s)).toBe(false);
  expect(canSwapCrossingUnits("north", "long", s)).toBe(true);
  expect(canSwapCrossingUnits("a", "b", s)).toBe(true);
});
