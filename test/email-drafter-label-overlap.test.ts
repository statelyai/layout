import { describe, expect, it } from "vitest";
import ELK, { type ElkNode } from "../src/elkjs";
import fixture from "./fixtures/email-drafter-label-overlap.json";

describe.each(["DOWN", "UP", "LEFT", "RIGHT"])("email drafter labels (%s)", (direction) => {
  it("keeps every label clear of other labels and states", async () => {
    const input = structuredClone(fixture);
    input.layoutOptions["elk.direction"] = direction;
    const sourceSide = { DOWN: "SOUTH", UP: "NORTH", LEFT: "WEST", RIGHT: "EAST" }[direction]!;
    const targetSide = { DOWN: "NORTH", UP: "SOUTH", LEFT: "EAST", RIGHT: "WEST" }[direction]!;
    for (const node of input.children)
      for (const port of node.ports)
        port.layoutOptions["elk.port.side"] = port.id.endsWith("__src") ? sourceSide : targetSide;
    const result = await new ELK().layout(input);
    for (const edge of result.edges!) {
      for (const section of edge.sections ?? []) {
        const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
        for (let i = 1; i < points.length; i++) {
          expect(
            points[i]!.x === points[i - 1]!.x || points[i]!.y === points[i - 1]!.y,
            `${edge.id} diagonal route`,
          ).toBe(true);
        }
      }
    }
    const labels = result.edges!.flatMap((e) => e.labels ?? []);
    const separate = (a: ElkNode, b: ElkNode) =>
      a.x! + a.width! <= b.x! ||
      b.x! + b.width! <= a.x! ||
      a.y! + a.height! <= b.y! ||
      b.y! + b.height! <= a.y!;
    for (let i = 0; i < labels.length; i++) {
      for (const b of labels.slice(i + 1))
        expect(separate(labels[i]! as ElkNode, b as ElkNode), `${labels[i]!.id}/${b.id}`).toBe(
          true,
        );
      for (const node of result.children!)
        expect(separate(labels[i]! as ElkNode, node), `${labels[i]!.id}/${node.id}`).toBe(true);
    }
  });
});
