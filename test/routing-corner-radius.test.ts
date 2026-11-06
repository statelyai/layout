import { expect, it } from "vitest";
import { roundCorners, pathFromPoints, type CornerRadiusOptions } from "../src/routing";
const short = pathFromPoints([
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 8 },
  { x: 200, y: 8 },
]);
it("shrinks adjacent radii to fit short segments without overrunning them", () => {
  const path = roundCorners(short, { radius: 20, minRadius: 4, maxRadius: 12 });
  const arcs = path.segments.filter((s) => s.kind === "arc");
  expect(arcs).toHaveLength(2);
  for (const arc of arcs) expect(arc.rx).toBe(4);
  expect(path.start).toEqual(short.start);
  expect(path.segments.at(-1)!.to).toEqual(short.segments.at(-1)!.to);
});
it("caps the preferred radius by maximum and raises it to minimum", () => {
  for (const options of [
    { radius: 20, minRadius: 0, maxRadius: 2 },
    { radius: 1, minRadius: 2, maxRadius: 4 },
  ]) {
    const arcs = roundCorners(short, options).segments.filter((s) => s.kind === "arc");
    expect(arcs).toHaveLength(2);
    for (const arc of arcs) expect(arc.rx).toBe(2);
  }
});
it("does not silently mix sharp and rounded corners when minimum is infeasible", () => {
  expect(roundCorners(short, { radius: 10, minRadius: 5 })).toBe(short);
});
it.each<CornerRadiusOptions>([
  { radius: -1 },
  { radius: NaN },
  { minRadius: -1 },
  { minRadius: Infinity },
  { maxRadius: -1 },
  { maxRadius: Infinity },
  { minRadius: 5, maxRadius: 4 },
])("rejects invalid radius bounds %j", (options) => {
  expect(() => roundCorners(short, options)).toThrow(RangeError);
});
it("supports explicit zero-radius sharp output", () => {
  expect(roundCorners(short, { radius: 20, maxRadius: 0 })).toBe(short);
});
