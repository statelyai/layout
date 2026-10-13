import { expect, it } from "vitest";
import NativeELK from "../src/elkjs";
import type { ElkNode } from "../src/elkjs/types";
import editorModes from "./fixtures/editor-modes-measured.json";

const positions = (graph: ElkNode): Record<string, [number, number]> => {
  const out: Record<string, [number, number]> = {};
  const visit = (node: ElkNode) => {
    for (const child of node.children ?? []) {
      out[String(child.id)] = [Math.round(child.x ?? 0), Math.round(child.y ?? 0)];
      visit(child);
    }
  };
  visit(graph);
  return out;
};

// The editor measures this label at 124.203125px or, mid-zoom, at
// 124.20310191782421px. Brandes-Koepf's four candidate layouts then tie on
// width only up to summation-order rounding (890.8906019178241 vs ...243), and
// the exact comparison picked another candidate: Edit Mode moved from x=133 to
// x=727.
it("lays out the same graph the same way under measurement noise", async () => {
  const exact = structuredClone(editorModes) as ElkNode;
  const noisy = structuredClone(editorModes) as ElkNode;
  noisy.edges![1]!.labels![0]!.width = 124.20310191782421;

  expect(positions(await new NativeELK().layout(noisy))).toEqual(
    positions(await new NativeELK().layout(exact)),
  );
});
