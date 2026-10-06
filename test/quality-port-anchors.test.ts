import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import { HARD, score } from "../scripts/parity/quality-gate";
import input from "./fixtures/viz-back-edge-ports.json";

// Stately's editor gives every transition its own 20px port. Brandes-Köpf must
// align edges at those ports' centers, as ELK does, or a straight back edge
// gains a jog where its label dummy meets the ports.
it("aligns a labeled back edge with its sized ports like ELK", async () => {
  const layout = await new NativeELK().layout(structuredClone(input) as ElkNode);
  const x = (id: string) => layout.children!.find((child) => child.id === id)!.x;
  // Real ELK 0.11.1 places first at 106 and second at 40.67.
  expect(x("first")).toBeCloseTo(106, 6);
  expect(x("second")).toBeCloseTo(40.667, 2);
  const back = layout.edges!.find((edge) => edge.id === "BACK")!;
  expect(back.sections).toHaveLength(1);
  expect(back.sections![0]!.bendPoints ?? []).toEqual([]);
  const native = score(layout, input as ElkNode);
  expect(Object.fromEntries(HARD.map((key) => [key, native[key]]))).toEqual(
    Object.fromEntries(HARD.map((key) => [key, 0])),
  );
});
