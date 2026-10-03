import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode, ElkPoint } from "../src/elkjs/types";
import fixture from "./fixtures/cross-hierarchy-viz.json";

it("joins ancestor edges at their actual descendant faces with orthogonal segments", async () => {
  const graph = await new NativeELK().layout(structuredClone(fixture));
  const parent = graph.children!.find((node) => node.id === "parent")!;
  const child = parent.children!.find((node) => node.id === "child")!;
  const onFace = (point: ElkPoint, node: ElkNode, offset: ElkPoint) => {
    const left = offset.x + node.x!,
      top = offset.y + node.y!;
    const right = left + node.width!,
      bottom = top + node.height!;
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-8;
    return (
      point.x >= left - 1e-8 &&
      point.x <= right + 1e-8 &&
      point.y >= top - 1e-8 &&
      point.y <= bottom + 1e-8 &&
      (near(point.x, left) || near(point.x, right) || near(point.y, top) || near(point.y, bottom))
    );
  };
  for (const id of ["parent-child", "child-parent"]) {
    const edge = graph.edges!.find((candidate) => candidate.id === id)!;
    expect(edge.container).toBe(parent.id);
    const section = edge.sections![0]!;
    const globalPoint = (point: ElkPoint): ElkPoint => ({
      x: point.x + parent.x!,
      y: point.y + parent.y!,
    });
    const childPoint = globalPoint(id === "parent-child" ? section.endPoint : section.startPoint);
    const parentPoint = globalPoint(id === "parent-child" ? section.startPoint : section.endPoint);
    expect(onFace(childPoint, child, { x: parent.x!, y: parent.y! })).toBe(true);
    expect(onFace(parentPoint, parent, { x: 0, y: 0 })).toBe(true);
    const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    for (const point of points) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
    for (let i = 1; i < points.length; i++)
      expect(
        Math.abs(points[i]!.x - points[i - 1]!.x) < 1e-8 ||
          Math.abs(points[i]!.y - points[i - 1]!.y) < 1e-8,
      ).toBe(true);
  }
});
