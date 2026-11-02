import { describe, expect, it } from "vitest";
import ELK from "../src/elkjs";
import { type ElkNode } from "../src/elkjs/types";

// The Stately editor's input for a state with a labeled targetless transition
// and two labeled transitions to the next state, one label taller than the state.
function editorGraph(tallLabelHeight: number): ElkNode {
  const port = (id: string, side: string) => ({
    id,
    width: 20,
    height: 20,
    layoutOptions: { "elk.port.side": side },
  });
  const edge = (id: string, width: number, height: number) => ({
    id,
    sources: [`${id}-src`],
    targets: [`${id}-tgt`],
    labels: [
      {
        id: `${id}-label`,
        text: id,
        width,
        height,
        layoutOptions: { "elk.edgeLabels.inline": "true" },
      },
    ],
  });
  return {
    id: "root",
    children: [
      {
        id: "idle",
        width: 200,
        height: 111,
        ports: [
          port("go-src", "EAST"),
          port("reset-src", "EAST"),
          port("reset-tgt", "WEST"),
          port("done-src", "EAST"),
        ],
      },
      {
        id: "done",
        width: 104,
        height: 45,
        ports: [port("go-tgt", "WEST"), port("done-tgt", "WEST")],
      },
    ],
    edges: [edge("go", 204, tallLabelHeight), edge("reset", 150, 70), edge("done", 299, 70)],
  };
}

describe("self-loop beside a tall sibling label", () => {
  it.each([70, 204])(
    "keeps the loop and its label outside the state (label height %i)",
    async (height) => {
      const result = await new ELK().layout(editorGraph(height));
      const idle = result.children!.find((child) => child.id === "idle")!;
      const reset = result.edges!.find((edge) => edge.id === "reset")!;
      const label = reset.labels![0]!;
      expect(label.y! + label.height!).toBeLessThanOrEqual(idle.y!);
      for (const section of reset.sections!)
        for (const point of [
          section.startPoint,
          ...(section.bendPoints ?? []),
          section.endPoint,
        ].slice(1, -1))
          expect(point.y).toBeLessThanOrEqual(idle.y!);
    },
  );
});
