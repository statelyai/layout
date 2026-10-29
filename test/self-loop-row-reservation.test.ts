import { describe, expect, it } from "vitest";
import ELK from "../src/elkjs";
import { type ElkNode } from "../src/elkjs/types";

// The Stately editor's input for `a → b`, `b → b`, `b → c` with inline center
// labels taller than the states and loosely hinted ports.
function editorGraph(direction: string): ElkNode {
  const port = (id: string, side: string) => ({
    id,
    width: 20,
    height: 20,
    layoutOptions: { "elk.port.side": side },
  });
  const node = (id: string, ports: ReturnType<typeof port>[]) => ({
    id,
    width: 40,
    height: 45,
    ports,
    layoutOptions: {
      "elk.portConstraints": "UNDEFINED",
      "elk.layered.edgeRouting.selfLoopDistribution": "NORTH",
    },
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
        layoutOptions: { "elk.edgeLabels.inline": "true", "elk.edgeLabels.placement": "CENTER" },
      },
    ],
  });
  return {
    id: "root",
    layoutOptions: {
      "elk.direction": direction,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeSelfLoop": "24",
      "elk.layered.spacing.nodeNodeBetweenLayers": "30",
    },
    children: [
      node("a", [port("ab-src", "EAST")]),
      node("b", [
        port("ab-tgt", "WEST"),
        port("bb-src", "EAST"),
        port("bb-tgt", "WEST"),
        port("bc-src", "EAST"),
      ]),
      node("c", [port("bc-tgt", "WEST")]),
    ],
    edges: [edge("ab", 138, 70), edge("bb", 296, 98), edge("bc", 293, 68)],
  };
}

describe.each(["RIGHT", "LEFT"])("self-loop row reservation (%s)", (direction) => {
  it("moves label dummies with the row the loop pushes down", async () => {
    const result = await new ELK().layout(editorGraph(direction));
    const b = result.children!.find((child) => child.id === "b")!;
    const center = b.y! + b.height! / 2;
    for (const id of ["ab", "bc"]) {
      const label = result.edges!.find((edge) => edge.id === id)!.labels![0]!;
      expect(Math.abs(label.y! + label.height! / 2 - center)).toBeLessThan(b.height! / 2);
    }
    const loop = result.edges!.find((edge) => edge.id === "bb")!.labels![0]!;
    expect(loop.y! + loop.height!).toBeLessThanOrEqual(b.y!);
  });
});
